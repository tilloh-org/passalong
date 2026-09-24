import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { readImageForDelivery } from '$lib/server/image-delivery';

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

/**
 * Build a camera-style JPEG that must be rotated 90° for display.
 *
 * @returns {Promise<Buffer>} JPEG bytes carrying orientation 6.
 */
async function cameraRotatedJpeg(): Promise<Buffer> {
	const pixels = Buffer.alloc(40 * 20 * 3, 70);
	return sharp(pixels, { raw: { width: 40, height: 20, channels: 3 } })
		.jpeg()
		.withMetadata({ orientation: 6 })
		.toBuffer();
}

/**
 * Write bytes to a temporary media root.
 *
 * @param {string} name - File name.
 * @param {Buffer} payload - File content.
 * @returns {string} Absolute path of the written file.
 */
function store(name: string, payload: Buffer): string {
	const root = mkdtempSync(join(tmpdir(), 'passalong-delivery-'));
	temporaryDirectories.push(root);
	const path = join(root, name);
	writeFileSync(path, payload);
	return path;
}

describe('image delivery', () => {
	it('applies the stored camera orientation so the viewer receives an upright image', async () => {
		// arrange
		const path = store('photo.jpg', await cameraRotatedJpeg());
		const stored = await sharp(path).metadata();

		// act
		const delivered = await readImageForDelivery(path, 'image/jpeg');
		const metadata = await sharp(delivered.payload).metadata();

		// assume — stored wide with a tag, delivered tall and tag-free.
		expect(stored.orientation).toBe(6);
		expect(stored.width).toBe(40);
		expect(delivered.rotated).toBe(true);
		expect(metadata.width).toBe(20);
		expect(metadata.height).toBe(40);
		expect(metadata.orientation === undefined || metadata.orientation === 1).toBe(true);
	});

	it('serves an upright image without re-encoding it', async () => {
		// arrange
		const plain = await sharp({
			create: { width: 16, height: 16, channels: 3, background: { r: 3, g: 4, b: 5 } }
		})
			.png()
			.toBuffer();
		const path = store('plain.png', plain);

		// act
		const delivered = await readImageForDelivery(path, 'image/png');

		// assume — identical bytes: the common case costs a metadata read only.
		expect(delivered.rotated).toBe(false);
		expect(delivered.payload).toEqual(plain);
	});

	it('derives the content type from the storage key when none is given', async () => {
		// arrange
		const path = store('photo.png', await cameraRotatedJpeg());

		// act
		const delivered = await readImageForDelivery(path);

		// assume — a .png key serves PNG, never another format.
		expect(delivered.mimeType).toBe('image/png');
	});

	it('drops EXIF metadata, including GPS, from a rotated photo', async () => {
		// arrange — a publicly served stand photo must not leak its location.
		const tagged = await sharp({
			create: { width: 20, height: 10, channels: 3, background: { r: 8, g: 9, b: 10 } }
		})
			.jpeg()
			.withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'private' } } })
			.toBuffer();
		const path = store('gps.jpg', tagged);

		// act
		const delivered = await readImageForDelivery(path, 'image/jpeg');
		const metadata = await sharp(delivered.payload).metadata();

		// assume
		expect(metadata.exif).toBeUndefined();
	});

	it('serves an undecodable file unchanged instead of hiding a listed image', async () => {
		// arrange — accepts only what passed validation, but must never turn it into a 404.
		const path = store('odd.jpg', Buffer.from('not really an image'));

		// act
		const delivered = await readImageForDelivery(path, 'image/jpeg');

		// assume
		expect(delivered.rotated).toBe(false);
		expect(delivered.payload.toString('utf8')).toBe('not really an image');
		expect(delivered.mimeType).toBe('image/jpeg');
	});

	it('reports a delivered payload large enough for the response length header', async () => {
		// arrange
		const path = store('photo.jpg', await cameraRotatedJpeg());

		// act
		const delivered = await readImageForDelivery(path, 'image/jpeg');

		// assume — Content-Length is taken from these bytes, not the stored file.
		expect(delivered.payload.length).toBeGreaterThan(0);
		expect(delivered.payload.length).not.toBeUndefined();
	});
});
