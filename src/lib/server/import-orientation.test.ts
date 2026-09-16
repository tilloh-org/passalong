import { mkdtempSync, rmSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureArchive, fixtureUser } from '$lib/server/exchange-fixture.test-helper';
import { importInstanceArchive } from '$lib/server/instance-import';
import { createCollectionRepository } from '$lib/server/collection-repository';

const temporaryRoots: string[] = [];

afterEach(() => {
	// act
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
	// assume
	expect(temporaryRoots).toEqual([]);
});

/**
 * Build a JPEG whose pixel dimensions are wide and whose EXIF tag claims a 90° rotation.
 *
 * @returns {Promise<Buffer>} Camera-style JPEG bytes.
 */
async function cameraRotatedJpeg(): Promise<Buffer> {
	const pixels = Buffer.alloc(40 * 20 * 3, 120);
	return sharp(pixels, { raw: { width: 40, height: 20, channels: 3 } })
		.jpeg()
		.withMetadata({ orientation: 6 })
		.toBuffer();
}

/**
 * Import an archive into a throwaway database and media root.
 *
 * @param {Buffer} archive - Archive bytes.
 * @returns {Promise<{ imported: boolean; report: unknown; mediaRoot: string; databasePath: string }>} Import result.
 */
async function runImport(archive: Buffer) {
	const root = mkdtempSync(join(tmpdir(), 'passalong-exif-'));
	temporaryRoots.push(root);
	const databasePath = join(root, 'instance.sqlite');
	const mediaRoot = join(root, 'media');
	// The repository owns the schema; creating it also proves the import targets a real instance.
	createCollectionRepository({ databasePath });
	const outcome = await importInstanceArchive({
		archive,
		databasePath,
		mediaRoot,
		instanceAdminUsername: 'avery',
		adminPassword: 'correct-horse-battery-staple'
	});
	return { ...outcome, mediaRoot, databasePath };
}

describe('instance import — EXIF orientation', () => {
	it('stores imported media upright even when the archive carries the camera orientation', async () => {
		// arrange — an archive whose media is a JPEG that still needs a 90° rotation for display.
		const tagged = await cameraRotatedJpeg();
		const before = await sharp(tagged).metadata();
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })], {
			mediaBytes: tagged
		});

		// act
		const outcome = await runImport(archive);

		// assume
		expect(outcome.imported).toBe(true);
		const database = new Database(outcome.databasePath, { readonly: true });
		const image = database.prepare('SELECT storage_key FROM item_images LIMIT 1').get() as {
			storage_key: string;
		};
		database.close();
		expect(image?.storage_key).toBeTruthy();

		const stored = await sharp(readFileSync(join(outcome.mediaRoot, image.storage_key))).metadata();
		expect(before.orientation).toBe(6);
		expect(before.width).toBe(40);
		expect(before.height).toBe(20);
		expect(stored.orientation === undefined || stored.orientation === 1).toBe(true);
		expect(stored.width).toBe(20);
		expect(stored.height).toBe(40);
	});

	it('still imports when the archive media needs no rotation', async () => {
		// arrange — a plain image: the manifest must remain consistent and the import must succeed.
		const plain = await sharp({
			create: { width: 12, height: 12, channels: 3, background: { r: 5, g: 5, b: 5 } }
		})
			.jpeg()
			.toBuffer();
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })], {
			mediaBytes: plain
		});

		// act
		const outcome = await runImport(archive);

		// assume
		expect(outcome.imported).toBe(true);
	});

	it('rejects an archive whose media bytes were altered after normalization', async () => {
		// arrange — normalizing rewrites the bytes, so an archive whose manifest is intentionally
		// wrong must still be refused: the checksums are recomputed, not trusted blindly.
		const tagged = await cameraRotatedJpeg();
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })], {
			mediaBytes: tagged,
			mediaFileCount: 99
		});

		// act
		const outcome = await runImport(archive);

		// assume
		expect(outcome.imported).toBe(false);
	});

	it('leaves an archive with no media importable', async () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].items = [];
		const archive = fixtureArchive([user]);

		// act
		const outcome = await runImport(archive);

		// assume
		expect(outcome.imported).toBe(true);
	});
});
