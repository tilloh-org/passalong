import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import Database from 'better-sqlite3';

const sha256Encoding = 'hex';
const manifestEntryName = 'manifest.json';
const databaseEntryName = 'database.sqlite';
const mediaEntryPrefix = 'media/';
const sqliteNativeFileSuffixes = ['-wal', '-shm'];

export interface BackupArchive {
	entries: Map<string, Buffer>;
	manifest: BackupManifest;
	zip: Buffer;
}

export interface BackupManifest {
	createdAt: string;
	schemaVersion: string;
	files: Record<string, { sha256: string; bytes: number }>;
}

interface ZipWriterState {
	chunks: Buffer[];
	centralDirectory: Buffer[];
	offset: number;
	count: number;
}

const crc32Table = (() => {
	const table = new Uint32Array(256);
	for (let index = 0; index < 256; index += 1) {
		let value = index;
		for (let bit = 0; bit < 8; bit += 1) {
			value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[index] = value >>> 0;
	}
	return table;
})();

/**
 * Compute the CRC-32 checksum of a buffer.
 *
 * @param {Buffer} payload - Bytes to checksum.
 * @returns {number} Unsigned CRC-32 value.
 */
function crc32(payload: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of payload) {
		crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Collect every file below the media root as relative storage keys.
 *
 * @param {string} mediaRoot - Absolute directory that stores media files.
 * @returns {string[]} Storage keys relative to the media root (forward slashes).
 */
function collectMediaKeys(mediaRoot: string): string[] {
	if (!existsSync(mediaRoot)) {
		return [];
	}
	const keys: string[] = [];
	const walk = (directory: string): void => {
		for (const entry of readdirSync(directory)) {
			const absolute = join(directory, entry);
			if (statSync(absolute).isDirectory()) {
				walk(absolute);
			} else {
				keys.push(relative(mediaRoot, absolute).split(sep).join('/'));
			}
		}
	};
	walk(mediaRoot);
	return keys.sort();
}

/**
 * Build a store-method (uncompressed) ZIP archive from the given entries.
 *
 * @param {Array<[string, Buffer]>} entries - Name and payload pairs, names use forward slashes.
 * @returns {Buffer} Complete ZIP archive bytes.
 */
function buildZip(entries: Array<[string, Buffer]>): Buffer {
	const state: ZipWriterState = { chunks: [], centralDirectory: [], offset: 0, count: 0 };
	for (const [name, payload] of entries) {
		const nameBytes = Buffer.from(name, 'utf8');
		const crc = crc32(payload);
		const localHeader = Buffer.alloc(30 + nameBytes.length);
		localHeader.writeUInt32LE(0x04034b50, 0);
		localHeader.writeUInt16LE(20, 4);
		localHeader.writeUInt16LE(0, 6);
		localHeader.writeUInt16LE(0, 8);
		localHeader.writeUInt16LE(0, 10);
		localHeader.writeUInt16LE(0, 12);
		localHeader.writeUInt32LE(crc, 14);
		localHeader.writeUInt32LE(payload.length, 18);
		localHeader.writeUInt32LE(payload.length, 22);
		localHeader.writeUInt16LE(nameBytes.length, 26);
		localHeader.writeUInt16LE(0, 28);
		nameBytes.copy(localHeader, 30);
		state.chunks.push(localHeader, payload);
		const central = Buffer.alloc(46 + nameBytes.length);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0, 8);
		central.writeUInt16LE(0, 10);
		central.writeUInt16LE(0, 12);
		central.writeUInt16LE(0, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(payload.length, 20);
		central.writeUInt32LE(payload.length, 24);
		central.writeUInt16LE(nameBytes.length, 28);
		central.writeUInt32LE(state.offset, 42);
		nameBytes.copy(central, 46);
		state.centralDirectory.push(central);
		state.offset += localHeader.length + payload.length;
		state.count += 1;
	}
	const centralBuffer = Buffer.concat(state.centralDirectory);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(state.count, 8);
	end.writeUInt16LE(state.count, 10);
	end.writeUInt32LE(centralBuffer.length, 12);
	end.writeUInt32LE(state.offset, 16);
	return Buffer.concat([...state.chunks, centralBuffer, end]);
}

/**
 * Create a consistent instance backup: SQLite snapshot, media files, and a checksum manifest.
 *
 * @param {{ databasePath: string; mediaRoot: string }} options - Database and media locations.
 * @returns {Promise<BackupArchive>} Archive entries keyed by name plus the parsed manifest.
 */
export async function createInstanceBackup({ databasePath, mediaRoot }: { databasePath: string; mediaRoot: string }): Promise<BackupArchive> {
	const files: Array<[string, Buffer]> = [];

	// SQLite online backup API produces a consistent snapshot while the app writes.
	const temporarySnapshotPath = `${databasePath}.backup-tmp`;
	const source = new Database(databasePath, { readonly: true });
	await source.backup(temporarySnapshotPath);
	source.close();
	files.push([databaseEntryName, readFileSync(temporarySnapshotPath)]);

	for (const key of collectMediaKeys(mediaRoot)) {
		files.push([mediaEntryNameFor(key), readFileSync(join(mediaRoot, key))]);
	}

	const manifest: BackupManifest = {
		createdAt: new Date().toISOString(),
		schemaVersion: readSchemaVersion(databasePath),
		files: {}
	};
	for (const [name, payload] of files) {
		manifest.files[name] = { sha256: createHash('sha256').update(payload).digest(sha256Encoding), bytes: payload.length };
	}
	const manifestPayload = Buffer.from(JSON.stringify(manifest, null, '\t'), 'utf8');

	const zip = buildZip([[manifestEntryName, manifestPayload], ...files]);
	return {
		entries: new Map([[manifestEntryName, manifestPayload], ...files]),
		manifest,
		zip
	};
}

function mediaEntryNameFor(key: string): string {
	return `media/${key}`;
}

/**
 * Read the applied schema version from the snapshot database.
 *
 * @param {string} databasePath - Path of the source database.
 * @returns {string} Latest schema version or an empty string.
 */
function readSchemaVersion(databasePath: string): string {
	const source = new Database(databasePath, { readonly: true });
	const row = source
		.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
		.get() as { version: string } | undefined;
	source.close();
	return row?.version ?? '';
}
/**
 * Result of a restore attempt.
 */
export interface RestoreOutcome {
	restored: boolean;
	reason?: string;
}

interface ZipEntry {
	name: string;
	payloadOffset: number;
	size: number;
}

const localFileHeaderSignature = 0x04034b50;
const localFileHeaderFixedLength = 30;
const tamperedArchiveMessage = 'archive is not a valid backup';

/**
 * Detect the end-of-central-directory record to reject appended garbage.
 *
 * @param {Buffer} payload - Archive bytes.
 * @returns {boolean} Whether a valid EOCD signature exists at the tail.
 */
function hasValidEndOfCentralDirectory(payload: Buffer): boolean {
	const minimumLength = 22;
	if (payload.length < minimumLength) {
		return false;
	}
	return payload.readUInt32LE(payload.length - minimumLength) === 0x06054b50;
}

/**
 * Parse a store-method ZIP archive into entry offsets.
 *
 * @param {Buffer} payload - Archive bytes.
 * @returns {Map<string, ZipEntry>} Entries keyed by name.
 */
function parseZip(payload: Buffer): Map<string, ZipEntry> {
	const entries = new Map<string, ZipEntry>();
	let offset = 0;
	while (offset + localFileHeaderFixedLength <= payload.length) {
		if (payload.readUInt32LE(offset) !== localFileHeaderSignature) {
			break;
		}
		const nameLength = payload.readUInt16LE(offset + 26);
		const extraLength = payload.readUInt16LE(offset + 28);
		const compressedSize = payload.readUInt32LE(offset + 18);
		const name = payload.subarray(offset + localFileHeaderFixedLength, offset + localFileHeaderFixedLength + nameLength).toString('utf8');
		entries.set(name, {
			name,
			payloadOffset: offset + localFileHeaderFixedLength + nameLength + extraLength,
			size: compressedSize
		});
		offset += localFileHeaderFixedLength + nameLength + extraLength + compressedSize;
	}
	return entries;
}

/**
 * Restore an instance backup: validate the manifest and checksums, then swap database and media.
 *
 * Invalid archives leave the running instance untouched.
 *
 * @param {{ archivePath: string; databasePath: string; mediaRoot: string }} options - Restore inputs.
 * @returns {Promise<RestoreOutcome>} Whether the restore succeeded.
 */
export async function restoreInstanceBackup({ archivePath, databasePath, mediaRoot }: { archivePath: string; databasePath: string; mediaRoot: string }): Promise<RestoreOutcome> {
	const payload = readFileSync(archivePath);
	if (!hasValidEndOfCentralDirectory(payload)) {
		return { restored: false, reason: tamperedArchiveMessage };
	}
	const entries = parseZip(payload);
	const manifestEntry = entries.get(manifestEntryName);
	if (!manifestEntry) {
		return { restored: false, reason: tamperedArchiveMessage };
	}
	const manifestPayload = payload.subarray(manifestEntry.payloadOffset, manifestEntry.payloadOffset + manifestEntry.size);
	let manifest: BackupManifest;
	try {
		manifest = JSON.parse(manifestPayload.toString('utf8')) as BackupManifest;
	} catch {
		return { restored: false, reason: tamperedArchiveMessage };
	}
	if (!manifest?.files?.[databaseEntryName] || typeof manifest.schemaVersion !== 'string') {
		return { restored: false, reason: tamperedArchiveMessage };
	}

	// Verify every manifest entry against the archive contents.
	for (const [name, meta] of Object.entries(manifest.files)) {
		const entry = entries.get(name);
		if (!entry || entry.size !== meta.bytes) {
			return { restored: false, reason: tamperedArchiveMessage };
		}
		const entryPayload = payload.subarray(entry.payloadOffset, entry.payloadOffset + entry.size);
		if (createHash('sha256').update(entryPayload).digest(sha256Encoding) !== meta.sha256) {
			return { restored: false, reason: tamperedArchiveMessage };
		}
	}

	// Stage the database beside the live file and the media into a sibling directory.
	const stagingDatabasePath = `${databasePath}.restore-staging`;
	const databaseEntry = entries.get(databaseEntryName)!;
	writeFileSync(stagingDatabasePath, payload.subarray(databaseEntry.payloadOffset, databaseEntry.payloadOffset + databaseEntry.size));
	const stagingMediaRoot = `${mediaRoot}.restore-staging`;
	const mediaEntries = Object.keys(manifest.files).filter((name) => name.startsWith(mediaEntryPrefix));
	for (const name of mediaEntriesOf(manifest)) {
		const entry = entries.get(name);
		if (!entry) {
			continue;
		}
		const relativeKey = name.slice(mediaEntryPrefix.length);
		const target = join(stagingMediaRoot, relativeKey);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, payload.subarray(entry.payloadOffset, entry.payloadOffset + entry.size));
	}

	// Atomic swap: move the current artifacts aside, then move the staging copies into place.
	swapFile(databasePath, stagingDatabasePath);
	swapDirectory(mediaRoot, stagingMediaRoot);
	return { restored: true };
}

function mediaEntriesOf(manifest: BackupManifest): string[] {
	return Object.keys(manifest.files).filter((name) => name.startsWith(mediaEntryPrefix));
}

/**
 * Swap a file with its staged replacement, keeping the previous file as a rollback copy.
 *
 * @param {string} livePath - Current file location.
 * @param {string} stagingPath - Staged replacement file.
 * @returns {void}
 */
function swapFile(livePath: string, stagingPath: string): void {
	for (const suffix of sqliteNativeFileSuffixes) {
		renameSyncForce(`${livePath}${suffix}`, `${livePath}.pre-restore${suffix}`);
	}
	renameSyncForce(livePath, `${livePath}.pre-restore`);
	renameSyncForce(stagingPath, livePath);
}

/**
 * Swap a directory similarly to {@link swapFile}.
 *
 * @param {string} liveDir - Current directory.
 * @param {string} stagingDir - Staged replacement directory.
 * @returns {void}
 */
function swapDirectory(liveDir: string, stagingDir: string): void {
	renameSyncForce(liveDir, `${liveDir}.pre-restore`);
	renameSyncForce(stagingDir, liveDir);
}

function renameSyncForce(from: string, to: string): void {
	try {
		renameSync(from, to);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}
}
