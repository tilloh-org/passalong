import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Build identity shown in the global footer.
 *
 * The commit hash is not knowable at runtime: the Docker build copies the source without `.git`,
 * so the hash has to be injected while the bundle is built. Priority is
 *
 * 1. `VITE_COMMIT_HASH` — set by the CI/Docker build (see the `commit-hash` build argument);
 * 2. `git rev-parse --short HEAD` — local development, where the repository is present;
 * 3. empty — a source tarball without either, which renders as the plain release version.
 */

/** Length of the short commit hash shown in the footer. */
export const SHORT_COMMIT_HASH_LENGTH = 7;

/** Label used when neither a release version nor a commit hash is available. */
const fallbackLabel = 'dev';

/**
 * Read the release version from this package's metadata.
 *
 * @param {{ version?: unknown }} packageMetadata - Parsed package.json.
 * @returns {string} The declared version, or an empty string when it is unusable.
 */
export function resolveReleaseVersion(packageMetadata: { version?: unknown }): string {
	const value = packageMetadata?.version;
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * Pick the commit hash from the injected build value or the local repository.
 *
 * @param {{ injected?: string; fromGit?: string }} sources - Candidate hashes, most authoritative first.
 * @returns {string} The chosen hash, or an empty string when neither source has one.
 */
export function resolveCommitHash(sources: { injected?: string; fromGit?: string }): string {
	const injected = (sources.injected ?? '').trim();
	if (injected) {
		return injected;
	}
	return (sources.fromGit ?? '').trim();
}

/**
 * Build the footer label in the `v<release>-<short hash>` syntax.
 *
 * @param {string} releaseVersion - Release version, with or without a leading `v`.
 * @param {string} commitHash - Full or already-short commit hash.
 * @returns {string} The version label.
 */
export function buildVersionLabel(releaseVersion: string, commitHash: string): string {
	const release = (releaseVersion ?? '').trim().replace(/^v/i, '');
	const shortHash = (commitHash ?? '').trim().slice(0, SHORT_COMMIT_HASH_LENGTH);
	if (!release && !shortHash) {
		return fallbackLabel;
	}
	if (!release) {
		return `${fallbackLabel}-${shortHash}`;
	}
	if (!shortHash) {
		return `v${release}`;
	}
	return `v${release}-${shortHash}`;
}

/**
 * Read the short commit hash from the local repository.
 *
 * @returns {string} The short hash, or an empty string when git or the repository is unavailable.
 */
function readGitCommitHash(): string {
	try {
		return execFileSync('git', ['rev-parse', `--short=${SHORT_COMMIT_HASH_LENGTH}`, 'HEAD'], {
			cwd: process.cwd(),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return '';
	}
}

/**
 * Read the release version from this package's own package.json.
 *
 * @returns {string} The declared version, or an empty string when it cannot be read.
 */
function readPackageVersion(): string {
	try {
		const metadata = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
			version?: unknown;
		};
		return resolveReleaseVersion(metadata);
	} catch {
		return '';
	}
}

/**
 * Resolve the version label for the running build.
 *
 * @returns {Promise<string>} The version label.
 */
export async function getVersionLabel(): Promise<string> {
	// `$env/dynamic/private` reads at runtime, so the injected build value is picked up without
	// baking a second copy of the label into the client bundle.
	const { env } = await import('$env/dynamic/private');
	return buildVersionLabel(
		readPackageVersion(),
		resolveCommitHash({ injected: env.COMMIT_HASH, fromGit: readGitCommitHash() })
	);
}
