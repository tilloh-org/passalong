import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionRepository, type SessionScope } from '$lib/server/collection-repository';
import { createAccountExport, importAccountExport } from '$lib/server/account-transfer';
import { saveUploadedImage } from '$lib/server/media-storage';
import { parseZip } from '$lib/server/backup';

const temporaryDirectories: string[] = [];
const testPngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Build a minimal valid PNG payload for transfer tests.
 *
 * @returns {Buffer} PNG bytes with a valid signature.
 */
function buildTestPng(): Buffer {
	return Buffer.concat([testPngHeader, Buffer.from('test-png-payload')]);
}

/**
 * Create an isolated repository/media pair for a transfer test.
 *
 * @returns {object} Repository fixture with isolated paths.
 */
function createTransferFixture(): {
	repository: ReturnType<typeof createCollectionRepository>;
	mediaRoot: string;
	scope: SessionScope;
} {
	const databaseDirectory = mkdtempSync(join(tmpdir(), 'passalong-transfer-db-'));
	const mediaDirectory = mkdtempSync(join(tmpdir(), 'passalong-transfer-media-'));
	temporaryDirectories.push(databaseDirectory, mediaDirectory);
	const mediaRoot = join(mediaDirectory, 'media');
	const repository = createCollectionRepository({
		databasePath: join(databaseDirectory, 'passalong.sqlite')
	});
	const scope = repository.createInitialAdmin({
		username: 'transfer-user',
		displayName: 'Transfer User',
		passwordHash: 'scrypt$test-salt$test-key'
	});
	return { repository, mediaRoot, scope };
}

afterEach(() => {
	vi.resetModules();
	delete process.env.PASSALONG_DATABASE_PATH;
	delete process.env.PASSALONG_MEDIA_ROOT;
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe('account transfer archives', () => {
	it('exports account data without database ids and imports it additively', async () => {
		// arrange
		const sourceFixture = createTransferFixture();
		const sourceCollection = sourceFixture.repository.createCollection(
			{ name: 'Garage' },
			sourceFixture.scope
		);
		sourceFixture.repository.updateStandIntro(
			sourceCollection.id,
			'Source intro',
			sourceFixture.scope
		);
		const sourceItem = sourceFixture.repository.createItem(
			{
				collectionId: sourceCollection.id,
				title: 'Bike bell',
				priceCents: 700,
				category: 'hobby',
				condition: 'good',
				internalNotes: 'source note',
				externalDescription: 'source description',
				isComplete: false,
				isFunctional: true
			},
			sourceFixture.scope
		);
		const sourceImageKey = await saveUploadedImage(
			sourceFixture.mediaRoot,
			'image/png',
			buildTestPng()
		);
		const sourceImage = sourceFixture.repository.addItemImage(
			sourceItem.id,
			sourceImageKey,
			sourceFixture.scope
		);
		sourceFixture.repository.setItemCover(sourceItem.id, sourceImage.id, sourceFixture.scope);

		const exportArchive = await createAccountExport(
			sourceFixture.repository,
			sourceFixture.scope,
			sourceFixture.mediaRoot
		);
		const zipEntries = parseZip(exportArchive.zip);
		expect(zipEntries.has('manifest.json')).toBe(true);
		const manifest = exportArchive.manifest;
		const manifestText = JSON.stringify(exportArchive.manifest);

		const targetFixture = createTransferFixture();
		const targetAvatarKey = await saveUploadedImage(
			targetFixture.mediaRoot,
			'image/png',
			buildTestPng()
		);
		targetFixture.repository.setProfileAvatar(targetFixture.scope, targetAvatarKey);
		const targetCollection = targetFixture.repository.createCollection(
			{ name: 'Existing collection' },
			targetFixture.scope
		);
		targetFixture.repository.createItem(
			{
				collectionId: targetCollection.id,
				title: 'Already there',
				priceCents: 1200,
				category: 'decor',
				condition: 'good',
				internalNotes: '',
				externalDescription: '',
				isComplete: false,
				isFunctional: false
			},
			targetFixture.scope
		);

		// act
		const importSummary = await importAccountExport({
			repository: targetFixture.repository,
			scope: targetFixture.scope,
			mediaRoot: targetFixture.mediaRoot,
			archive: exportArchive.zip
		});

		// assume
		expect(manifestText).not.toContain(sourceFixture.scope.userId);
		expect(manifestText).not.toContain(sourceCollection.id);
		expect(manifestText).not.toContain(sourceItem.id);
		expect(Object.hasOwn(manifest as object, 'source')).toBe(false);
		expect(Object.hasOwn(manifest as object, 'avatarFile')).toBe(false);
		expect(manifest.collections[0].key).toBe('collection-1');
		expect(manifest.collections[0].items[0].key).toBe('item-1-1');
		expect(manifest.collections[0].items[0].images[0].file).toContain('collection-1/item-1-1');
		expect(importSummary).toMatchObject({
			collectionsImported: 1,
			itemsImported: 1,
			imagesImported: 1
		});
		expect(targetFixture.repository.getProfile(targetFixture.scope)).toMatchObject({
			avatarStorageKey: targetAvatarKey
		});
		expect(targetFixture.repository.listCollectionsForOwner(targetFixture.scope)).toHaveLength(2);
		const importedCollection = targetFixture.repository
			.listCollectionsForOwner(targetFixture.scope)
			.find((collection) => collection.standIntro === 'Source intro');
		expect(importedCollection).toBeDefined();
		expect(importedCollection?.name).toBe('Garage');
		expect(
			targetFixture.repository.listItemsForOwner(importedCollection!.id, targetFixture.scope)
		).toHaveLength(1);
		const importedItem = targetFixture.repository.listItemsForOwner(
			importedCollection!.id,
			targetFixture.scope
		)[0];
		expect(importedItem).toMatchObject({
			title: 'Bike bell',
			internalNotes: 'source note',
			externalDescription: 'source description'
		});
		const importedImages = targetFixture.repository.listItemImages(
			importedItem.id,
			targetFixture.scope
		);
		expect(importedImages).toHaveLength(1);
		expect(importedImages[0].isCover).toBe(true);
		expect(existsSync(join(targetFixture.mediaRoot, importedImages[0].storageKey))).toBe(true);
	});
});
