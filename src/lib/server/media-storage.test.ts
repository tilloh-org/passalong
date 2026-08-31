import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test, expect } from 'vitest';
import { saveUploadedImage, maximumImageBytes } from './media-storage';

const temporaryDirectories: string[] = [];

afterEach(async () => {
	// act
	const directories = temporaryDirectories.splice(0);
	await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));

	// assume
	expect(temporaryDirectories).toEqual([]);
});

test('saves a valid PNG under a content-derived deterministic key', async () => {
	// arrange
	const mediaRoot = await createMediaRoot();
	const pngPayload = buildMinimalPng();

	// act
	const storageKey = await saveUploadedImage(mediaRoot, 'image/png', pngPayload);
	const persisted = await readFile(join(mediaRoot, storageKey));

	// assume
	expect(storageKey).toMatch(/^[0-9a-f]{64}\.png$/);
	expect(persisted).toEqual(pngPayload);
});

test('derives identical storage keys from identical content and distinct keys from different content', async () => {
	// arrange
	const mediaRoot = await createMediaRoot();
	const pngPayload = buildMinimalPng();
	const alteredPayload = Buffer.concat([buildMinimalPng(), Buffer.from([0x00])]);

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

	// act
	const rejection = await captureRejection(() => saveUploadedImage(mediaRoot, 'application/pdf', buildMinimalPng()));

	// assume
	expect(rejection).toMatchObject({ message: 'upload is not a supported image type' });
});

test('rejects empty uploads', async () => {
	// arrange
	const mediaRoot = await createMediaRoot();

	// act
	const rejection = await captureRejection(() => saveUploadedImage(mediaRoot, 'image/png', Buffer.alloc(0)));

	// assume
	expect(rejection).toMatchObject({ message: 'upload is empty' });
});

test('rejects payloads that exceed the maximum image size', async () => {
	// arrange
	const mediaRoot = await createMediaRoot();
	const oversizedPayload = Buffer.alloc(maximumImageBytes + 1, 0x47);

	// act
	const rejection = await captureRejection(() => saveUploadedImage(mediaRoot, 'image/png', oversizedPayload));

	// assume
	expect(rejection).toMatchObject({ message: 'image exceeds the allowed size' });
});

test('rejects payloads whose bytes do not match the declared image type', async () => {
	// arrange
	const mediaRoot = await createMediaRoot();
	const textPayload = Buffer.from('not an image at all');

	// act
	const pngRejection = await captureRejection(() => saveUploadedImage(mediaRoot, 'image/png', textPayload));
	const jpegRejection = await captureRejection(() => saveUploadedImage(mediaRoot, 'image/jpeg', textPayload));
	const webpRejection = await captureRejection(() => saveUploadedImage(mediaRoot, 'image/webp', textPayload));

	// assume
	expect(pngRejection).toMatchObject({ message: 'upload is not a supported image' });
	expect(jpegRejection).toMatchObject({ message: 'upload is not a supported image' });
	expect(webpRejection).toMatchObject({ message: 'upload is not a supported image' });
});

test('accepts JPEG and WebP payloads with valid signatures', async () => {
	// arrange
	const mediaRoot = await createMediaRoot();
	const jpegPayload = buildMinimalJpeg();
	const webpPayload = buildMinimalWebp();

	// act
	const jpegKey = await saveUploadedImage(mediaRoot, 'image/jpeg', jpegPayload);
	const webpKey = await saveUploadedImage(mediaRoot, 'image/webp', webpPayload);

	// assume
	expect(jpegKey).toMatch(/^[0-9a-f]{64}\.jpg$/);
	expect(webpKey).toMatch(/^[0-9a-f]{64}\.webp$/);
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

function buildMinimalPng(): Buffer {
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		Buffer.from('minimal-png-content-for-tests')
	]);
}

function buildMinimalJpeg(): Buffer {
	return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('minimal-jpeg-content-for-tests')]);
}

function buildMinimalWebp(): Buffer {
	return Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0x00, 0x00, 0x00]), Buffer.from('WEBP'), Buffer.from('VP8 minimal-webp-content')]);
}