import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createCollectionRepository } from '$lib/server/collection-repository';
import { buildZip, createInstanceBackup, restoreInstanceBackup } from '$lib/server/backup';

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories) {
		rmSync(directory, { force: true, recursive: true });
	}
	temporaryDirectories.length = 0;
});

describe('instance backup and restore', () => {
	it('creates a zip archive with database, media, and a matching manifest', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-backup-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		const repository = createCollectionRepository({ databasePath });
		const scope = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const collection = repository.createCollection({ name: 'Flohmarkt' }, scope);
		repository.createItem(
			{
				collectionId: collection.id,
				title: 'Vase',
				priceCents: 800,
				category: 'decor',
				condition: 'good',
				internalNotes: '',
				externalDescription: '',
				isComplete: false,
				isFunctional: false
			},
			scope
		);
		mkdirSync(mediaRoot, { recursive: true });
		const mediaFile = join(mediaRoot, 'image.png');
		writeFileSync(mediaFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

		// act
		const archive = await createInstanceBackup({ databasePath, mediaRoot });

		// assume
		expect(archive.entries.has('manifest.json')).toBe(true);
		expect(archive.entries.has('database.sqlite')).toBe(true);
		expect(archive.entries.has('media/image.png')).toBe(true);
		const manifest = JSON.parse(archive.entries.get('manifest.json')!.toString('utf8'));
		expect(manifest.files['database.sqlite']).toMatchObject({ sha256: expect.any(String) });
		expect(manifest.files['media/image.png'].sha256).toHaveLength(64);
	});

	it('restores a valid archive replacing database and media atomically', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-backup-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		mkdirSync(mediaRoot, { recursive: true });
		const repository = createCollectionRepository({ databasePath });
		const scope = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const collection = repository.createCollection({ name: 'Flohmarkt' }, scope);
		repository.createItem(
			{
				collectionId: collection.id,
				title: 'Vase',
				priceCents: 800,
				category: 'decor',
				condition: 'good',
				internalNotes: '',
				externalDescription: '',
				isComplete: false,
				isFunctional: false
			},
			scope
		);
		const backup = await createInstanceBackup({ databasePath, mediaRoot });
		const archivePath = join(workspace, 'backup.zip');
		writeFileSync(archivePath, backup.zip);

		// act — mutate the live instance, then restore the snapshot
		repository.createCollection({ name: 'Extra' }, scope);
		const restoreOutcome = await restoreInstanceBackup({ archivePath, databasePath, mediaRoot });

		// assume
		expect(restoreOutcome).toMatchObject({ restored: true });
		const restoredRepository = createCollectionRepository({ databasePath });
		expect(restoredRepository.listCollectionsForOwner(scope).map((entry) => entry.name)).toEqual([
			'Flohmarkt'
		]);
	});

	it('rejects a tampered archive without touching the running instance', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-backup-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		mkdirSync(mediaRoot, { recursive: true });
		const repository = createCollectionRepository({ databasePath });
		const scope = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		repository.createCollection({ name: 'Flohmarkt' }, scope);
		const backup = await createInstanceBackup({ databasePath, mediaRoot });
		const archivePath = join(workspace, 'backup.zip');
		writeFileSync(archivePath, backup.zip);
		// tamper: append garbage
		writeFileSync(archivePath, Buffer.concat([backup.zip, Buffer.from('tampered')]));

		// act
		const outcome = await restoreInstanceBackup({ archivePath, databasePath, mediaRoot });

		// assume
		expect(outcome).toMatchObject({ restored: false });
		expect(repository.listCollectionsForOwner(scope).map((entry) => entry.name)).toEqual([
			'Flohmarkt'
		]);
		expect(repository.getSaleStatistics).toBeDefined();
	});

	it('revokes every session of the restored backup and reports the smoke test', async () => {
		// arrange — an instance with a signed-in administrator and a collection
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-backup-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		mkdirSync(mediaRoot, { recursive: true });
		const repository = createCollectionRepository({ databasePath });
		const scope = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		repository.createSessionForUser(scope, 'hash-of-the-administrator-session');
		repository.createCollection({ name: 'Flohmarkt' }, scope);
		const backup = await createInstanceBackup({ databasePath, mediaRoot });
		const archivePath = join(workspace, 'backup.zip');
		writeFileSync(archivePath, backup.zip);

		// act — the instance moves on, then the snapshot is restored
		repository.createCollection({ name: 'Später' }, scope);
		const outcome = await restoreInstanceBackup({ archivePath, databasePath, mediaRoot });

		// assume — the restore went through, the backed-up session is dead and every check passed
		expect(outcome.restored).toBe(true);
		expect(outcome.revokedSessions).toBe(1);
		expect(outcome.smokeChecks?.map((check) => [check.name, check.ok])).toEqual([
			['Datenbank ist unversehrt', true],
			['Das Schema ist vollständig', true],
			['Ein Konto kann sich anmelden', true],
			['Alte Sitzungen sind zurückgesetzt', true],
			['Alle Bilder sind vorhanden', true]
		]);
		const restoredDatabase = new Database(databasePath, { readonly: true });
		const activeSessions = restoredDatabase
			.prepare('SELECT COUNT(*) AS count FROM sessions WHERE revoked_at IS NULL')
			.get() as { count: number };
		restoredDatabase.close();
		expect(activeSessions.count).toBe(0);
		const restoredRepository = createCollectionRepository({ databasePath });
		expect(restoredRepository.listCollectionsForOwner(scope).map((entry) => entry.name)).toEqual([
			'Flohmarkt'
		]);
	});

	it('keeps the previous instance when the restored database misses media', async () => {
		// arrange — an instance whose item carries an image, and an archive that omits that image
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-backup-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		mkdirSync(mediaRoot, { recursive: true });
		const repository = createCollectionRepository({ databasePath });
		const scope = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const collection = repository.createCollection({ name: 'Flohmarkt' }, scope);
		const item = repository.createItem(
			{
				collectionId: collection.id,
				title: 'Vase',
				priceCents: 800,
				category: 'decor',
				condition: 'good',
				internalNotes: '',
				externalDescription: '',
				isComplete: false,
				isFunctional: false
			},
			scope
		);
		const storageKey = `${'a'.repeat(64)}.png`;
		repository.addItemImage(item.id, storageKey, scope);
		writeFileSync(join(mediaRoot, storageKey), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		const backup = await createInstanceBackup({ databasePath, mediaRoot });
		const databaseBytes = backup.entries.get('database.sqlite')!;
		const strippedArchive = buildZip([
			[
				'manifest.json',
				Buffer.from(
					JSON.stringify({
						createdAt: new Date().toISOString(),
						schemaVersion: backup.manifest.schemaVersion,
						files: {
							'database.sqlite': {
								sha256: createHash('sha256').update(databaseBytes).digest('hex'),
								bytes: databaseBytes.length
							}
						}
					})
				)
			],
			['database.sqlite', databaseBytes]
		]);
		const archivePath = join(workspace, 'incomplete.zip');
		writeFileSync(archivePath, strippedArchive);

		// act — the instance gained a collection since the snapshot, then the archive is restored
		repository.createCollection({ name: 'Später' }, scope);
		const outcome = await restoreInstanceBackup({ archivePath, databasePath, mediaRoot });

		// assume — only the media check failed and the previous instance is untouched
		expect(outcome.restored).toBe(false);
		expect(outcome.reason).toContain('Selbsttest');
		expect(outcome.smokeChecks?.filter((check) => !check.ok).map((check) => check.name)).toEqual([
			'Alle Bilder sind vorhanden'
		]);
		expect(
			repository
				.listCollectionsForOwner(scope)
				.map((entry) => entry.name)
				.sort()
		).toEqual(['Flohmarkt', 'Später']);
		expect(existsSync(join(mediaRoot, storageKey))).toBe(true);
		expect(existsSync(`${databasePath}.pre-restore`)).toBe(false);
		expect(existsSync(`${mediaRoot}.pre-restore`)).toBe(false);
	});
});
