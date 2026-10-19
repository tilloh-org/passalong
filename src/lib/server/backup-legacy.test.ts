import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
	buildZip,
	createInstanceBackup,
	parseZip,
	restoreInstanceBackup
} from '$lib/server/backup';
import {
	createCollectionRepository,
	currentSchemaVersion,
	type SessionScope
} from '$lib/server/collection-repository';
import { hashPassword, verifyPassword } from '$lib/server/password';

/**
 * An older supported release: the build before the publication status (F-004) and the market-day
 * location (F-005). A backup of it is restored and migrated to the current schema.
 */
const legacySchemaVersion = '2026091701_collection_public_id';
const droppedMigrationVersions = [
	'2026101801_collection_publication_status',
	'2026101901_market_day_location'
];

const legacyPassword = 'legacy-backup-passphrase';
const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const legacyBackupPath = join(repositoryRoot, 'fixtures', 'backup', 'legacy-schema-backup.zip');

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories) {
		rmSync(directory, { force: true, recursive: true });
	}
	temporaryDirectories.length = 0;
});

/**
 * Build the legacy backup: a complete instance backup whose database still carries the schema of
 * the release before the publication status and the market-day location.
 *
 * @returns {Promise<Buffer>} Archive bytes.
 */
async function buildLegacyBackup(): Promise<Buffer> {
	const workspace = mkdtempSync(join(tmpdir(), 'passalong-legacy-'));
	temporaryDirectories.push(workspace);
	const databasePath = join(workspace, 'legacy.sqlite');
	const mediaRoot = join(workspace, 'legacy-media');
	const repository = createCollectionRepository({ databasePath });
	const scope = repository.createInitialAdmin({
		username: 'legacyowner',
		displayName: 'Legacy owner',
		passwordHash: await hashPassword(legacyPassword)
	});
	const collection = repository.createCollection({ name: 'Flohmarkt' }, scope);
	const item = repository.createItem(
		{
			collectionId: collection.id,
			title: 'Vase aus dem Altbestand',
			priceCents: 800,
			category: 'decor',
			condition: 'good',
			internalNotes: '',
			externalDescription: '',
			isComplete: false,
			isFunctional: true
		},
		scope
	);
	mkdirSync(mediaRoot, { recursive: true });
	const mediaKey = 'legacy-vase.png';
	writeFileSync(join(mediaRoot, mediaKey), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]));
	repository.createSessionForUser(scope, 'legacy-session-token-hash');
	repository.close();

	// Downgrade the database to the schema of the older release this backup came from.
	const database = new Database(databasePath);
	database
		.prepare(
			'INSERT INTO item_images (id, tenant_id, item_id, storage_key, position, is_cover, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.run('legacy-image', scope.tenantId, item.id, mediaKey, 0, 1, new Date().toISOString());
	database.exec('ALTER TABLE collections DROP COLUMN is_published');
	database.exec('ALTER TABLE market_days DROP COLUMN latitude');
	database.exec('ALTER TABLE market_days DROP COLUMN longitude');
	database.exec('ALTER TABLE market_days DROP COLUMN location_released');
	database
		.prepare('DELETE FROM schema_migrations WHERE version IN (?, ?)')
		.run(...droppedMigrationVersions);
	database.close();

	const archive = await createInstanceBackup({ databasePath, mediaRoot });
	return archive.zip;
}

/**
 * Create an instance that already runs, so the restore has something to replace.
 *
 * @param {string} workspace - Directory of the instance.
 * @returns {{ databasePath: string; mediaRoot: string }} Instance paths.
 */
function createRunningInstance(workspace: string): { databasePath: string; mediaRoot: string } {
	const databasePath = join(workspace, 'app.sqlite');
	const mediaRoot = join(workspace, 'media');
	createCollectionRepository({ databasePath }).close();
	mkdirSync(mediaRoot, { recursive: true });
	return { databasePath, mediaRoot };
}

describe('restoring a backup of an older schema version', () => {
	it('keeps the committed legacy backup in step with its generator', async () => {
		if (process.env.LEGACY_BACKUP_WRITE === '1') {
			mkdirSync(dirname(legacyBackupPath), { recursive: true });
			writeFileSync(legacyBackupPath, await buildLegacyBackup());
		}

		// act
		const archive = readFileSync(legacyBackupPath);
		const manifestEntry = parseZip(archive).get('manifest.json')!;
		const manifest = JSON.parse(
			archive
				.subarray(manifestEntry.payloadOffset, manifestEntry.payloadOffset + manifestEntry.size)
				.toString('utf8')
		) as { schemaVersion: string };

		// assume — the fixture really is the backup of the older release, not of this build
		expect(archive.length).toBeGreaterThan(0);
		expect(manifest.schemaVersion).toBe(legacySchemaVersion);
		expect(manifest.schemaVersion < currentSchemaVersion).toBe(true);
	});

	it('migrates the restored database to the current schema and keeps the data', async () => {
		// arrange — a running instance and the backup of the older release
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-legacy-target-'));
		temporaryDirectories.push(workspace);
		const instance = createRunningInstance(workspace);
		const archivePath = join(workspace, 'legacy-backup.zip');
		writeFileSync(archivePath, readFileSync(legacyBackupPath));

		// act
		const outcome = await restoreInstanceBackup({ archivePath, ...instance });

		// assume — the restore accepted the older archive and migrated it
		expect(outcome.restored).toBe(true);
		const database = new Database(instance.databasePath, { readonly: true });
		const versions = (
			database.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: string }>
		).map((row) => row.version);
		expect(versions).toContain(currentSchemaVersion);
		for (const dropped of droppedMigrationVersions) {
			expect(versions).toContain(dropped);
		}
		// the columns the older release did not have are back, with their defaults
		const collectionColumns = (
			database.prepare('PRAGMA table_info(collections)').all() as Array<{ name: string }>
		).map((column) => column.name);
		expect(collectionColumns).toContain('is_published');
		const marketDayColumns = (
			database.prepare('PRAGMA table_info(market_days)').all() as Array<{ name: string }>
		).map((column) => column.name);
		expect(marketDayColumns).toEqual(
			expect.arrayContaining(['latitude', 'longitude', 'location_released'])
		);
		// the legacy records survived the migration
		const item = database
			.prepare('SELECT title, price_cents FROM items WHERE title = ?')
			.get('Vase aus dem Altbestand') as { title: string; price_cents: number } | undefined;
		expect(item).toEqual({ title: 'Vase aus dem Altbestand', price_cents: 800 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM item_images').get()).toEqual({
			count: 1
		});
		database.close();

		// the owner account still works, and the media of the backup is in place
		const repository = createCollectionRepository({ databasePath: instance.databasePath });
		const account = repository.getUserForLogin('legacyowner');
		expect(await verifyPassword(legacyPassword, account?.passwordHash ?? null)).toBe(true);
		repository.close();
		expect(existsSync(join(instance.mediaRoot, 'legacy-vase.png'))).toBe(true);
	});

	it('revokes the sessions the legacy backup carried', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-legacy-target-'));
		temporaryDirectories.push(workspace);
		const instance = createRunningInstance(workspace);
		const archivePath = join(workspace, 'legacy-backup.zip');
		writeFileSync(archivePath, readFileSync(legacyBackupPath));

		// act
		const outcome = await restoreInstanceBackup({ archivePath, ...instance });

		// assume
		expect(outcome.restored).toBe(true);
		const database = new Database(instance.databasePath, { readonly: true });
		const activeSessions = database
			.prepare('SELECT COUNT(*) AS count FROM sessions WHERE revoked_at IS NULL')
			.get() as { count: number };
		database.close();
		expect(activeSessions.count).toBe(0);
	});

	it('refuses a backup of a newer schema and leaves the instance untouched', async () => {
		// arrange — a running instance with a known collection
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-legacy-target-'));
		temporaryDirectories.push(workspace);
		const instance = createRunningInstance(workspace);
		const liveRepository = createCollectionRepository({ databasePath: instance.databasePath });
		const scope: SessionScope = liveRepository.createInitialAdmin({
			username: 'liveowner',
			displayName: 'Live owner',
			passwordHash: 'scrypt$live$live'
		});
		liveRepository.createCollection({ name: 'Bleibt erhalten' }, scope);
		liveRepository.close();

		// act — the same archive, but its manifest claims a newer schema version
		const newerArchivePath = join(workspace, 'newer-backup.zip');
		writeFileSync(
			newerArchivePath,
			rewriteManifestSchemaVersion(readFileSync(legacyBackupPath), '9999999999_future')
		);
		const outcome = await restoreInstanceBackup({ archivePath: newerArchivePath, ...instance });

		// assume
		expect(outcome.restored).toBe(false);
		expect(outcome.reason).toMatch(/neueren Version/);
		const database = new Database(instance.databasePath, { readonly: true });
		const collections = database.prepare('SELECT name FROM collections').all() as Array<{
			name: string;
		}>;
		database.close();
		expect(collections).toEqual([{ name: 'Bleibt erhalten' }]);
	});
});

/**
 * Replace the claimed schema version of an archive, keeping every checksum valid.
 *
 * @param {Buffer} archive - Original archive bytes.
 * @param {string} schemaVersion - Version to claim.
 * @returns {Buffer} Rewritten archive bytes.
 */
function rewriteManifestSchemaVersion(archive: Buffer, schemaVersion: string): Buffer {
	const entries = parseZip(archive);
	const files: Array<[string, Buffer]> = [];
	for (const [name, entry] of entries) {
		files.push([name, archive.subarray(entry.payloadOffset, entry.payloadOffset + entry.size)]);
	}
	const manifestIndex = files.findIndex(([name]) => name === 'manifest.json');
	const manifest = JSON.parse(files[manifestIndex][1].toString('utf8')) as {
		schemaVersion: string;
	};
	manifest.schemaVersion = schemaVersion;
	files[manifestIndex] = [
		'manifest.json',
		Buffer.from(JSON.stringify(manifest, null, '\t'), 'utf8')
	];
	return buildZip(files);
}
