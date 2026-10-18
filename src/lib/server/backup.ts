import { createHash } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
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
export function buildZip(entries: Array<[string, Buffer]>): Buffer {
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
export async function createInstanceBackup({
	databasePath,
	mediaRoot
}: {
	databasePath: string;
	mediaRoot: string;
}): Promise<BackupArchive> {
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
		manifest.files[name] = {
			sha256: createHash('sha256').update(payload).digest(sha256Encoding),
			bytes: payload.length
		};
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
 * One check of the automatic smoke test that runs after a restore.
 */
export interface SmokeCheck {
	name: string;
	ok: boolean;
	detail: string;
}

/**
 * Result of a restore attempt.
 */
export interface RestoreOutcome {
	restored: boolean;
	reason?: string;
	revokedSessions?: number;
	smokeChecks?: SmokeCheck[];
}

interface ZipEntry {
	name: string;
	payloadOffset: number;
	size: number;
}

const localFileHeaderSignature = 0x04034b50;

/** The only supported ZIP compression method: stored (uncompressed). */
const storedCompressionMethod = 0;
const localFileHeaderFixedLength = 30;
const tamperedArchiveMessage = 'archive is not a valid backup';

/**
 * Detect the end-of-central-directory record to reject appended garbage.
 *
 * @param {Buffer} payload - Archive bytes.
 * @returns {boolean} Whether a valid EOCD signature exists at the tail.
 */
export function hasValidEndOfCentralDirectory(payload: Buffer): boolean {
	const minimumLength = 22;
	if (payload.length < minimumLength) {
		return false;
	}
	return payload.readUInt32LE(payload.length - minimumLength) === 0x06054b50;
}

/**
 * Parse a store-method ZIP archive into entry offsets.
 *
 * Only stored (uncompressed) entries are supported. A compressed entry is rejected rather than read:
 * its payload length would not be its content length, so reading it "successfully" would mean
 * trusting a declared uncompressed size instead of the bytes actually present.
 *
 * @param {Buffer} payload - Archive bytes.
 * @returns {Map<string, ZipEntry>} Entries keyed by name.
 * @throws {Error} If an entry declares a compression method other than "stored".
 */
export function parseZip(payload: Buffer): Map<string, ZipEntry> {
	const entries = new Map<string, ZipEntry>();
	let offset = 0;
	while (offset + localFileHeaderFixedLength <= payload.length) {
		if (payload.readUInt32LE(offset) !== localFileHeaderSignature) {
			break;
		}
		const compressionMethod = payload.readUInt16LE(offset + 8);
		if (compressionMethod !== storedCompressionMethod) {
			throw new Error(`archive entry uses the unsupported compression method ${compressionMethod}`);
		}
		const nameLength = payload.readUInt16LE(offset + 26);
		const extraLength = payload.readUInt16LE(offset + 28);
		const compressedSize = payload.readUInt32LE(offset + 18);
		const name = payload
			.subarray(
				offset + localFileHeaderFixedLength,
				offset + localFileHeaderFixedLength + nameLength
			)
			.toString('utf8');
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
export async function restoreInstanceBackup({
	archivePath,
	databasePath,
	mediaRoot
}: {
	archivePath: string;
	databasePath: string;
	mediaRoot: string;
}): Promise<RestoreOutcome> {
	const payload = readFileSync(archivePath);
	if (!hasValidEndOfCentralDirectory(payload)) {
		return { restored: false, reason: tamperedArchiveMessage };
	}
	const entries = parseZip(payload);
	const manifestEntry = entries.get(manifestEntryName);
	if (!manifestEntry) {
		return { restored: false, reason: tamperedArchiveMessage };
	}
	const manifestPayload = payload.subarray(
		manifestEntry.payloadOffset,
		manifestEntry.payloadOffset + manifestEntry.size
	);
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
	writeFileSync(
		stagingDatabasePath,
		payload.subarray(databaseEntry.payloadOffset, databaseEntry.payloadOffset + databaseEntry.size)
	);
	const stagingMediaRoot = `${mediaRoot}.restore-staging`;
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

	// The restored database is live now: it has to pass the smoke test, otherwise the previous
	// instance is put back before the instance serves anyone again.
	let revokedSessions = 0;
	let sessionInvalidationFailed = false;
	try {
		revokedSessions = revokeRestoredSessions(databasePath);
	} catch {
		sessionInvalidationFailed = true;
	}
	const smokeChecks = runRestoreSmokeTest({
		databasePath,
		mediaRoot,
		revokedSessions,
		sessionInvalidationFailed
	});
	if (smokeChecks.some((check) => !check.ok)) {
		rollbackRestore({ databasePath, mediaRoot });
		return {
			restored: false,
			reason: 'Die wiederhergestellte Instanz hat den Selbsttest nicht bestanden.',
			smokeChecks
		};
	}
	return { restored: true, revokedSessions, smokeChecks };
}

/**
 * Revoke every session the restored database still knows.
 *
 * A backup holds the sessions of the moment it was created, so without this step the tokens of a
 * previous administrator would work again after a restore.
 *
 * @param {string} databasePath - Path of the restored database.
 * @returns {number} Number of sessions that were revoked.
 */
function revokeRestoredSessions(databasePath: string): number {
	const restored = new Database(databasePath);
	try {
		const result = restored
			.prepare('UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL')
			.run(new Date().toISOString());
		return result.changes;
	} finally {
		restored.close();
	}
}

/**
 * Check that the restored database and its media are complete and usable.
 *
 * @param {{ databasePath: string; mediaRoot: string; revokedSessions: number; sessionInvalidationFailed: boolean }} input - Restore artifacts to check.
 * @returns {SmokeCheck[]} One entry per check.
 */
function runRestoreSmokeTest({
	databasePath,
	mediaRoot,
	revokedSessions,
	sessionInvalidationFailed
}: {
	databasePath: string;
	mediaRoot: string;
	revokedSessions: number;
	sessionInvalidationFailed: boolean;
}): SmokeCheck[] {
	const checks: SmokeCheck[] = [];
	let restored: Database.Database | undefined;
	try {
		restored = new Database(databasePath, { readonly: true });
	} catch (error) {
		return [
			{
				name: requiredTablesCheckName,
				ok: false,
				detail: error instanceof Error ? error.message : 'unreadable'
			}
		];
	}
	try {
		const integrity = restored.pragma('integrity_check') as Array<{ integrity_check: string }>;
		const integrityResult = integrity[0]?.integrity_check ?? 'missing';
		checks.push({
			name: 'Datenbank ist unversehrt',
			ok: integrityResult === 'ok',
			detail: integrityResult
		});

		const tables = new Set(
			(
				restored.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
					name: string;
				}[]
			).map((row) => row.name)
		);
		const missingTables = requiredTables.filter((table) => !tables.has(table));
		checks.push({
			name: requiredTablesCheckName,
			ok: missingTables.length === 0,
			detail:
				missingTables.length === 0 ? `${requiredTables.length} Tabellen` : missingTables.join(', ')
		});

		const accountCount = missingTables.includes('users')
			? 0
			: (restored.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count;
		checks.push({
			name: 'Ein Konto kann sich anmelden',
			ok: accountCount > 0,
			detail: `${accountCount} Konten`
		});

		const activeSessions = missingTables.includes('sessions')
			? 0
			: (
					restored
						.prepare('SELECT COUNT(*) AS count FROM sessions WHERE revoked_at IS NULL')
						.get() as { count: number }
				).count;
		checks.push({
			name: 'Alte Sitzungen sind zurückgesetzt',
			ok: !sessionInvalidationFailed && activeSessions === 0,
			detail: sessionInvalidationFailed
				? 'not revocable'
				: `${revokedSessions} zurückgesetzt, ${activeSessions} aktiv`
		});

		checks.push(mediaCompletenessCheck(restored, mediaRoot, missingTables));
	} finally {
		restored.close();
	}
	return checks;
}

const requiredTables = [
	'users',
	'sessions',
	'collections',
	'items',
	'item_images',
	'market_days',
	'expenses'
];
const requiredTablesCheckName = 'Das Schema ist vollständig';

/**
 * Check that every stored media key of the restored database exists in the restored media folder.
 *
 * @param {Database.Database} restored - Open handle on the restored database.
 * @param {string} mediaRoot - Root folder of the restored media.
 * @param {string[]} missingTables - Tables absent from the restored schema.
 * @returns {SmokeCheck} The media check.
 */
function mediaCompletenessCheck(
	restored: Database.Database,
	mediaRoot: string,
	missingTables: string[]
): SmokeCheck {
	if (missingTables.includes('items') || missingTables.includes('item_images')) {
		return { name: mediaCheckName, ok: false, detail: 'items or item_images missing' };
	}
	const keys = new Set<string>();
	for (const row of restored.prepare('SELECT storage_key FROM item_images').all() as {
		storage_key: string;
	}[]) {
		keys.add(row.storage_key);
	}
	const hasAvatarColumn = (
		restored.prepare("PRAGMA table_info('users')").all() as { name: string }[]
	).some((column) => column.name === 'avatar_storage_key');
	if (hasAvatarColumn) {
		for (const row of restored
			.prepare('SELECT avatar_storage_key FROM users WHERE avatar_storage_key IS NOT NULL')
			.all() as { avatar_storage_key: string }[]) {
			keys.add(row.avatar_storage_key);
		}
	}
	const missing = [...keys].filter((key) => !existsSync(join(mediaRoot, key)));
	return {
		name: mediaCheckName,
		ok: missing.length === 0,
		detail:
			missing.length === 0 ? `${keys.size} Bilder` : `fehlend: ${missing.slice(0, 3).join(', ')}`
	};
}

const mediaCheckName = 'Alle Bilder sind vorhanden';

/**
 * Put the artifacts of the previous instance back after a failed smoke test.
 *
 * The swap keeps the previous database and media as `<path>.pre-restore`; the rejected restore
 * result is removed so a failed attempt leaves the disk as it was.
 *
 * @param {{ databasePath: string; mediaRoot: string }} input - Restore artifacts to roll back.
 * @returns {void}
 */
function rollbackRestore({
	databasePath,
	mediaRoot
}: {
	databasePath: string;
	mediaRoot: string;
}): void {
	for (const suffix of sqliteNativeFileSuffixes) {
		renameSyncForce(`${databasePath}${suffix}`, `${databasePath}.rejected-restore${suffix}`);
	}
	renameSyncForce(databasePath, `${databasePath}.rejected-restore`);
	renameSyncForce(`${databasePath}.pre-restore`, databasePath);
	for (const suffix of sqliteNativeFileSuffixes) {
		renameSyncForce(`${databasePath}.pre-restore${suffix}`, `${databasePath}${suffix}`);
	}
	renameSyncForce(mediaRoot, `${mediaRoot}.rejected-restore`);
	renameSyncForce(`${mediaRoot}.pre-restore`, mediaRoot);
	removePathForce(`${databasePath}.rejected-restore`);
	removePathForce(`${mediaRoot}.rejected-restore`);
}

function removePathForce(target: string): void {
	rmSync(target, { force: true, recursive: true });
	rmSync(`${target}-wal`, { force: true });
	rmSync(`${target}-shm`, { force: true });
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
