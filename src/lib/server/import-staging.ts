import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Staging area for validated import archives.
 *
 * An upload is validated and listed first, then activated with an explicit administrator choice.
 * Holding the archive on disk instead of in memory keeps a large upload out of the request
 * handler's heap, and an opaque single-use token keeps the browser from resending the file.
 *
 * Entries live only in process memory: a restart simply invalidates a pending staging step, which
 * the operator redoes by uploading again.
 */
const stagedArchives = new Map<string, { path: string }>();

/**
 * Stage a validated archive and return a single-use token for it.
 *
 * @param {Buffer} archive - Archive bytes that already passed validation.
 * @param {string} stagingDirectory - Directory that holds staged archives.
 * @returns {string} Opaque staging token.
 */
export function stageArchive(archive: Buffer, stagingDirectory: string): string {
	const token = randomUUID();
	mkdirSync(stagingDirectory, { recursive: true });
	const path = join(stagingDirectory, `import-${token}.zip`);
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
