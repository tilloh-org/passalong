import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, test, expect } from 'vitest';
import { saveUploadedImage, maximumImageBytes } from './media-storage';

const temporaryDirectories: string[] = [];

afterEach(async () => {
	// act
	const directories = temporaryDirectories.splice(0);
	await Promise.all(
		directories.map((directory) => rm(directory, { recursive: true, force: true }))
	);

	// assume
	expect(temporaryDirectories).toEqual([]);
});

test('saves a valid PNG under a content-derived deterministic key', async () => {
	// arrange
	const mediaRoot = await createMediaRoot();
	const pngPayload = await buildRealPng();

	// act
	const storageKey = await saveUploadedImage(mediaRoot, 'image/png', pngPayload);
	const persisted = await readFile(join(mediaRoot, storageKey));

	// assume — an image without an orientation tag is stored byte-identical.
	expect(storageKey).toMatch(/^[0-9a-f]{64}\.png$/);
	expect(persisted).toEqual(pngPayload);
});

test('derives identical storage keys from identical content and distinct keys from different content', async () => {
	// arrange
	const mediaRoot = await createMediaRoot();
	const pngPayload = await buildRealPng();
	const alteredPayload = await buildRealPng(5, 5);

	// act
	const firstKey = await saveUploadedImage(mediaRoot, 'image/png', pngPayload);
	const duplicateKey = await saveUploadedImage(mediaRoot, 'image/png', pngPayload);
	const differentContentKey = await saveUploadedImage(mediaRoot, 'image/png', alteredPayload);

	// assume
	expect(duplicateKey).toBe(firstKey);
	expect(differentContentKey).not.toBe(firstKey);
});

test('rejects uploads that are not a supported image type', async () => {
	// arrange
	const mediaRoot = await createMediaRoot();
	const pngPayload = await buildRealPng();

	// act
	const rejection = await captureRejection(() =>
		saveUploadedImage(mediaRoot, 'application/pdf', pngPayload)
	);

	// assume
	expect(rejection).toMatchObject({ message: 'upload is not a supported image type' });
});

test('rejects empty uploads', async () => {
	// arrange
	const mediaRoot = await createMediaRoot();

	// act
	const rejection = await captureRejection(() =>
		saveUploadedImage(mediaRoot, 'image/png', Buffer.alloc(0))
	);

	// assume
	expect(rejection).toMatchObject({ message: 'upload is empty' });
});

test('rejects payloads that exceed the maximum image size', async () => {
	// arrange
	const mediaRoot = await createMediaRoot();
	const oversizedPayload = Buffer.alloc(maximumImageBytes + 1, 0x47);

	// act
	const rejection = await captureRejection(() =>
		saveUploadedImage(mediaRoot, 'image/png', oversizedPayload)
	);

	// assume
	expect(rejection).toMatchObject({ message: 'image exceeds the allowed size' });
});

test('rejects payloads whose bytes do not match the declared image type', async () => {
	// arrange
	const mediaRoot = await createMediaRoot();
	const textPayload = Buffer.from('not an image at all');

	// act
	const pngRejection = await captureRejection(() =>
		saveUploadedImage(mediaRoot, 'image/png', textPayload)
	);
	const jpegRejection = await captureRejection(() =>
		saveUploadedImage(mediaRoot, 'image/jpeg', textPayload)
	);
	const webpRejection = await captureRejection(() =>
		saveUploadedImage(mediaRoot, 'image/webp', textPayload)
	);

	// assume
	expect(pngRejection).toMatchObject({ message: 'upload is not a supported image' });
	expect(jpegRejection).toMatchObject({ message: 'upload is not a supported image' });
	expect(webpRejection).toMatchObject({ message: 'upload is not a supported image' });
});

test('accepts JPEG and WebP payloads with valid signatures', async () => {
	// arrange
	const mediaRoot = await createMediaRoot();
	const jpegPayload = await buildRealJpeg();
	const webpPayload = await buildRealWebp();

	// act
	const jpegKey = await saveUploadedImage(mediaRoot, 'image/jpeg', jpegPayload);
	const webpKey = await saveUploadedImage(mediaRoot, 'image/webp', webpPayload);

	// assume
	expect(jpegKey).toMatch(/^[0-9a-f]{64}\.jpg$/);
	expect(webpKey).toMatch(/^[0-9a-f]{64}\.webp$/);
});

test('rejects a payload that has a valid signature but is not a decodable image', async () => {
	// arrange
	const mediaRoot = await createMediaRoot();

	// act
	const pngRejection = await captureRejection(() =>
		saveUploadedImage(mediaRoot, 'image/png', buildPngSignatureOnly())
	);
	const jpegRejection = await captureRejection(() =>
		saveUploadedImage(mediaRoot, 'image/jpeg', buildJpegSignatureOnly())
	);

	// assume — the signature check alone is not proof that the bytes are an image.
	expect(pngRejection).toMatchObject({ message: 'image could not be read' });
	expect(jpegRejection).toMatchObject({ message: 'image could not be read' });
});

test('stores an uploaded photo upright and drops its EXIF block', async () => {
	// arrange — a camera JPEG: wide pixels plus an orientation tag that means "rotate 90°".
	const mediaRoot = await createMediaRoot();
	const pixels = Buffer.alloc(40 * 20 * 3, 90);
	const tagged = await sharp(pixels, { raw: { width: 40, height: 20, channels: 3 } })
		.jpeg()
		.withMetadata({ orientation: 6 })
		.toBuffer();

	// act
	const storageKey = await saveUploadedImage(mediaRoot, 'image/jpeg', tagged);
	const persisted = await readFile(join(mediaRoot, storageKey));
	const metadata = await sharp(persisted).metadata();

	// assume — stored pixels are upright and no orientation tag or EXIF survives.
	expect(metadata.orientation === undefined || metadata.orientation === 1).toBe(true);
	expect(metadata.width).toBe(20);
	expect(metadata.height).toBe(40);
	expect(metadata.exif).toBeUndefined();
	// the key describes the stored bytes, not the uploaded ones
	expect(storageKey).toMatch(/^[0-9a-f]{64}\.jpg$/);
	expect(storageKey.startsWith(createHash('sha256').update(persisted).digest('hex'))).toBe(true);
});

test('keeps the storage key stable for an image that needs no rotation', async () => {
	// arrange — the same content uploaded twice must not produce two files.
	const mediaRoot = await createMediaRoot();
	const pngPayload = await buildRealPng();

	// act
	const firstKey = await saveUploadedImage(mediaRoot, 'image/png', pngPayload);
	const secondKey = await saveUploadedImage(mediaRoot, 'image/png', pngPayload);

	// assume
	expect(secondKey).toBe(firstKey);
});

async function createMediaRoot(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), 'passalong-media-'));
	temporaryDirectories.push(directory);
	return join(directory, 'media');
}

async function captureRejection(operation: () => Promise<string>): Promise<unknown> {
	try {
		await operation();
		return null;
	} catch (error) {
		return error;
	}
}

/**
 * Build a real, decodable image so the stored file can also be normalized.
 *
 * @param {number} width - Image width in pixels.
 * @param {number} height - Image height in pixels.
 * @returns {Promise<Buffer>} Encoded PNG bytes.
 */
async function buildRealPng(width = 4, height = 4): Promise<Buffer> {
	return sharp({
		create: { width, height, channels: 3, background: { r: 20, g: 60, b: 120 } }
	})
		.png()
		.toBuffer();
}

/**
 * Build a real, decodable JPEG.
 *
 * @returns {Promise<Buffer>} Encoded JPEG bytes.
 */
async function buildRealJpeg(): Promise<Buffer> {
	return sharp({
		create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 30, b: 60 } }
	})
		.jpeg()
		.toBuffer();
}

/**
 * Build a real, decodable WebP.
 *
 * @returns {Promise<Buffer>} Encoded WebP bytes.
 */
async function buildRealWebp(): Promise<Buffer> {
	return sharp({
		create: { width: 4, height: 4, channels: 3, background: { r: 30, g: 200, b: 90 } }
	})
		.webp()
		.toBuffer();
}

/**
 * Sign a payload with the PNG signature so it passes the signature check without being decodable.
 *
 * @returns {Buffer} Signature followed by non-image bytes.
 */
function buildPngSignatureOnly(): Buffer {
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		Buffer.from('minimal-png-content-for-tests')
	]);
}

/**
 * Sign a payload with the JPEG signature so it passes the signature check without being decodable.
 *
 * @returns {Buffer} Signature followed by non-image bytes.
 */
function buildJpegSignatureOnly(): Buffer {
	return Buffer.concat([
		Buffer.from([0xff, 0xd8, 0xff]),
		Buffer.from('minimal-jpeg-content-for-tests')
	]);
}
