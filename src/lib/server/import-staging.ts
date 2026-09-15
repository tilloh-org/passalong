import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Staging area for validated import archives.
 *
 * An upload is validated and listed first, then activated with an explicit administrator choice.
 * Holding the archive on disk instead of in memory keeps a large upload out of the request
 * handler's heap, and an opaque single-use token keeps the browser from resending the file.
 *
 * The surface that calls this runs **before any account exists**, so it is reachable without a
 * session. It therefore has to protect itself: a bounded number of pending uploads, a bounded
 * lifetime per upload, and a sweep that runs whenever a new archive is staged. Without that, an
 * anonymous visitor could fill the volume that also holds the database.
 *
 * Entries live only in process memory: a restart simply invalidates a pending staging step, which
 * the operator redoes by uploading again. The files are swept on the next staging attempt.
 */
const stagedArchives = new Map<string, { path: string }>();

/** Prefix of every file this store writes, so a sweep never touches anything else. */
const stagedFilePrefix = 'import-';

/** Maximum number of uploads that may wait for activation at the same time. */
export const MAXIMUM_STAGED_ARCHIVES = 4;

/** Maximum accepted archive size for a staged upload, in bytes. */
export const MAXIMUM_STAGED_ARCHIVE_BYTES = 512 * 1024 * 1024;

/** How long a staged archive may wait for activation before a sweep removes it. */
export const STAGED_ARCHIVE_LIFETIME_MILLISECONDS = 30 * 60 * 1000;

/**
 * Remove staged archives that were never activated.
 *
 * Only files this store wrote are considered, so an unrelated file in the directory survives.
 *
 * @param {string} stagingDirectory - Directory that holds staged archives.
 * @returns {void}
 */
function sweepStagedArchives(stagingDirectory: string): void {
	const expiry = Date.now() - STAGED_ARCHIVE_LIFETIME_MILLISECONDS;
	const stalePaths = new Set<string>();
	for (const [token, entry] of stagedArchives) {
		try {
			if (statSync(entry.path).mtimeMs < expiry) {
				stalePaths.add(entry.path);
				rmSync(entry.path, { force: true });
				stagedArchives.delete(token);
			}
		} catch {
			// Already gone: forget it so the map cannot grow without bound.
			stagedArchives.delete(token);
		}
	}
	for (const name of readdirSync(stagingDirectory)) {
		if (!name.startsWith(stagedFilePrefix)) {
			continue;
		}
		const path = join(stagingDirectory, name);
		if (stalePaths.has(path)) {
			continue;
		}
		try {
			if (statSync(path).mtimeMs < expiry) {
				rmSync(path, { force: true });
			}
		} catch {
			// A race with another sweep is harmless.
		}
	}
}

/**
 * Stage a validated archive and return a single-use token for it.
 *
 * @param {Buffer} archive - Archive bytes that already passed validation.
 * @param {string} stagingDirectory - Directory that holds staged archives.
 * @returns {string | null} Opaque staging token, or null when the archive is too large or too many uploads already wait.
 */
export function stageArchive(archive: Buffer, stagingDirectory: string): string | null {
	if (archive.length > MAXIMUM_STAGED_ARCHIVE_BYTES) {
		return null;
	}
	mkdirSync(stagingDirectory, { recursive: true });
	sweepStagedArchives(stagingDirectory);
	if (stagedArchives.size >= MAXIMUM_STAGED_ARCHIVES) {
		return null;
	}
	const token = randomUUID();
	const path = join(stagingDirectory, `${stagedFilePrefix}${token}.zip`);
	writeFileSync(path, archive);
	stagedArchives.set(token, { path });
	return token;
}

/**
 * Consume a staged archive by token.
 *
 * The entry is removed whether or not the bytes could be read, so a token can never be replayed.
 *
 * @param {string} token - Staging token issued by {@link stageArchive}.
 * @returns {Buffer | null} Archive bytes, or null when the token is unknown.
 */
export function takeStagedArchive(token: string): Buffer | null {
	const entry = stagedArchives.get(token);
	if (!entry) {
		return null;
	}
	stagedArchives.delete(token);
	try {
		return readFileSync(entry.path);
	} catch {
		return null;
	} finally {
		rmSync(entry.path, { force: true });
	}
}

/**
 * Remove every staged archive and forget all tokens.
 *
 * @returns {void}
 */
export function clearStagedArchives(): void {
	for (const entry of stagedArchives.values()) {
		rmSync(entry.path, { force: true });
	}
	stagedArchives.clear();
}
