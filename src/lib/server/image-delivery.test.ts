import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { normalizeImageOrientation } from '$lib/server/image-delivery';

/**
 * Build a JPEG whose pixels are a wide gradient and whose EXIF tag claims orientation 6
 * (rotate 90° clockwise on display).
 *
 * @returns {Promise<Buffer>} JPEG bytes carrying the orientation tag.
 */
async function wideImageWithOrientationSix(): Promise<Buffer> {
	// arrange — a 40x20 image is clearly wider than tall; after the 90° rotation it must be taller.
	const pixels = Buffer.alloc(40 * 20 * 3);
	for (let y = 0; y < 20; y += 1) {
		for (let x = 0; x < 40; x += 1) {
			const offset = (y * 40 + x) * 3;
			pixels[offset] = x * 6;
			pixels[offset + 1] = y * 12;
			pixels[offset + 2] = 128;
		}
	}
	return sharp(pixels, { raw: { width: 40, height: 20, channels: 3 } })
		.jpeg()
		.withMetadata({ orientation: 6 })
		.toBuffer();
}

describe('image orientation normalization (delivery)', () => {
	it('bakes the EXIF orientation into the pixels so the stored image is upright', async () => {
		// arrange
		const tagged = await wideImageWithOrientationSix();
		const before = await sharp(tagged).metadata();

		// act
		const normalized = await normalizeImageOrientation(tagged, 'image/jpeg');
		const after = await sharp(normalized.payload).metadata();

		// assume — the tag is gone and the stored pixels are rotated: tall instead of wide.
		expect(before.orientation).toBe(6);
		expect(before.width).toBe(40);
		expect(before.height).toBe(20);
		expect(after.orientation === undefined || after.orientation === 1).toBe(true);
		expect(after.width).toBe(20);
		expect(after.height).toBe(40);
	});

	it('leaves an image without an orientation tag byte-identical', async () => {
		// arrange
		const plain = await sharp({
			create: { width: 30, height: 30, channels: 3, background: { r: 10, g: 40, b: 90 } }
		})
			.png()
			.toBuffer();

		// act
		const normalized = await normalizeImageOrientation(plain, 'image/png');

		// assume — content-derived storage keys must stay stable, so a correct image is untouched.
		expect(normalized.rotated).toBe(false);
		expect(createHash('sha256').update(normalized.payload).digest('hex')).toBe(
			createHash('sha256').update(plain).digest('hex')
		);
	});

	it('leaves an image whose orientation tag is already 1 untouched', async () => {
		// arrange
		const alreadyUpright = await sharp({
			create: { width: 24, height: 24, channels: 3, background: { r: 0, g: 0, b: 0 } }
		})
			.jpeg()
			.withMetadata({ orientation: 1 })
			.toBuffer();

		// act
		const normalized = await normalizeImageOrientation(alreadyUpright, 'image/jpeg');

		// assume
		expect(normalized.rotated).toBe(false);
	});

	it('bakes the mirrored orientations rather than rotating them', async () => {
		// arrange — orientation 2 is a horizontal mirror, not a rotation.
		const pixels = Buffer.alloc(4 * 2 * 3);
		for (let y = 0; y < 2; y += 1) {
			for (let x = 0; x < 4; x += 1) {
				const offset = (y * 4 + x) * 3;
				pixels[offset] = x === 0 ? 255 : 0;
				pixels[offset + 1] = 0;
				pixels[offset + 2] = 0;
			}
		}
		const mirrored = await sharp(pixels, { raw: { width: 4, height: 2, channels: 3 } })
			.png()
			.withMetadata({ orientation: 2 })
			.toBuffer();

		// act
		const normalized = await normalizeImageOrientation(mirrored, 'image/png');
		const { data } = await sharp(normalized.payload).raw().toBuffer({ resolveWithObject: true });

		// assume — the red column moved from the left edge to the right edge.
		expect(normalized.rotated).toBe(true);
		expect(data[0]).toBe(0);
		expect(data[3 * 3]).toBe(255);
	});

	it('keeps the declared mime type and extension family', async () => {
		// arrange
		const tagged = await wideImageWithOrientationSix();

		// act
		const normalized = await normalizeImageOrientation(tagged, 'image/jpeg');

		// assume
		expect(normalized.mimeType).toBe('image/jpeg');
		expect(normalized.payload.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
	});

	it('strips other metadata while normalizing', async () => {
		// arrange — a GPS position must not survive into a publicly served image.
		const withGps = await sharp({
			create: { width: 20, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } }
		})
			.jpeg()
			.withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'private' } } })
			.toBuffer();

		// act
		const normalized = await normalizeImageOrientation(withGps, 'image/jpeg');
		const after = await sharp(normalized.payload).metadata();

		// assume
		expect(after.exif).toBeUndefined();
	});

	it('rejects a payload that is not a decodable image', async () => {
		// arrange
		const notAnImage = Buffer.from('this is not an image at all');

		// act + assume
		await expect(normalizeImageOrientation(notAnImage, 'image/jpeg')).rejects.toThrow();
	});

	it('accepts an image with no orientation tag and reports it as unchanged even when large', async () => {
		// arrange
		const wide = await sharp({
			create: { width: 800, height: 200, channels: 3, background: { r: 200, g: 100, b: 50 } }
		})
			.jpeg()
			.toBuffer();

		// act
		const normalized = await normalizeImageOrientation(wide, 'image/jpeg');

		// assume
		expect(normalized.rotated).toBe(false);
	});
});
