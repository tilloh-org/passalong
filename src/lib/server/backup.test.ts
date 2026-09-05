import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionRepository } from '$lib/server/collection-repository';
import { createInstanceBackup, restoreInstanceBackup } from '$lib/server/backup';

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
		const scope = repository.createInitialAdmin({ username: 'avery', displayName: 'Avery', passwordHash: 'scrypt$test-salt$test-key' });
		const collection = repository.createCollection({ name: 'Flohmarkt' }, scope);
		repository.createItem({ collectionId: collection.id, title: 'Vase', priceCents: 800, category: 'decor', condition: 'good', internalNotes: '', externalDescription: '', isComplete: false, isFunctional: false }, scope);
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
		const scope = repository.createInitialAdmin({ username: 'avery', displayName: 'Avery', passwordHash: 'scrypt$test-salt$test-key' });
		const collection = repository.createCollection({ name: 'Flohmarkt' }, scope);
		repository.createItem({ collectionId: collection.id, title: 'Vase', priceCents: 800, category: 'decor', condition: 'good', internalNotes: '', externalDescription: '', isComplete: false, isFunctional: false }, scope);
		const backup = await createInstanceBackup({ databasePath, mediaRoot });
		const archivePath = join(workspace, 'backup.zip');
		writeFileSync(archivePath, backup.zip);

		// act — mutate the live instance, then restore the snapshot
		const secondCollection = repository.createCollection({ name: 'Extra' }, scope);
		const restoreOutcome = await restoreInstanceBackup({ archivePath, databasePath, mediaRoot });

		// assume
		expect(restoreOutcome).toMatchObject({ restored: true });
		const restoredRepository = createCollectionRepository({ databasePath });
		expect(restoredRepository.listCollectionsForOwner(scope).map((entry) => entry.name)).toEqual(['Flohmarkt']);
	});

	it('rejects a tampered archive without touching the running instance', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-backup-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		mkdirSync(mediaRoot, { recursive: true });
		const repository = createCollectionRepository({ databasePath });
		const scope = repository.createInitialAdmin({ username: 'avery', displayName: 'Avery', passwordHash: 'scrypt$test-salt$test-key' });
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
		expect(repository.listCollectionsForOwner(scope).map((entry) => entry.name)).toEqual(['Flohmarkt']);
		expect(repository.getSaleStatistics).toBeDefined();
	});
});