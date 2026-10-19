import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import {
	parseThumbnailName,
	thumbnailKeyFor,
	thumbnailRootFor,
	writeThumbnail,
	readThumbnail,
	maximumThumbnailEdge
} from '$lib/server/thumbnails';

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

/**
 * Create an isolated media root.
 *
 * @returns {string} Absolute media root path.
 */
function createMediaRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'passalong-thumbnails-'));
	temporaryDirectories.push(root);
	return join(root, 'media');
}

/**
 * Build a real JPEG of the given size.
 *
 * @param {number} width - Pixel width.
 * @param {number} height - Pixel height.
 * @returns {Promise<Buffer>} JPEG bytes.
 */
async function buildImage(width: number, height: number): Promise<Buffer> {
	return sharp({
		create: { width, height, channels: 3, background: { r: 30, g: 90, b: 160 } }
	})
		.jpeg()
		.toBuffer();
}

describe('thumbnail keys', () => {
	it('derives a key that keeps the original name and adds a size suffix', () => {
		// act
		const key = thumbnailKeyFor('abc123.jpg', 480);

		// assume
		expect(key).toMatch(/^abc123-480w\.jpg$/);
	});

	it('keeps a distinct key per size', () => {
		// act + assume
		expect(thumbnailKeyFor('abc123.jpg', 480)).not.toBe(thumbnailKeyFor('abc123.jpg', 1920));
	});

	it('rejects a key that would escape the thumbnail root', () => {
		// act + assume
		expect(() => thumbnailKeyFor('../escape.jpg', 480)).toThrow();
		expect(() => thumbnailKeyFor('nested/dir.jpg', 480)).toThrow();
	});

	it('rejects an unsupported extension', () => {
		// act + assume
		expect(() => thumbnailKeyFor('notes.txt', 480)).toThrow();
	});

	it('places thumbnails in a subdirectory of the media root', () => {
		// act
		const root = thumbnailRootFor('/data/media');

		// assume — inside the media root, so the backup walk picks them up.
		expect(root).toBe('/data/media/.thumbs');
	});
});

describe('thumbnail name round trip', () => {
	it('recovers the original key and edge from a generated name', () => {
		// arrange
		const key = 'abc123.jpg';

		// act
		const parsed = parseThumbnailName(thumbnailKeyFor(key, 480));

		// assume — this is what makes the route unable to accept a path it did not produce.
		expect(parsed).toEqual({ storageKey: 'abc123.jpg', edge: 480 });
	});

	it('round-trips every supported extension', () => {
		// act + assume
		for (const extension of ['jpg', 'png', 'webp']) {
			const key = `abc123.${extension}`;
			expect(parseThumbnailName(thumbnailKeyFor(key, 512))).toEqual({
				storageKey: key,
				edge: 512
			});
		}
	});

	it('refuses a name that is not a thumbnail name', () => {
		// act + assume
		expect(parseThumbnailName('abc123.jpg')).toBeNull();
		expect(parseThumbnailName('abc123-480w')).toBeNull();
		expect(parseThumbnailName('abc123-480w.txt')).toBeNull();
		expect(parseThumbnailName('abc123-0w.jpg')).toBeNull();
		expect(parseThumbnailName('../escape-480w.jpg')).toBeNull();
	});

	it('refuses a name whose base still carries a separator', () => {
		// act + assume — a name that would resolve outside the thumbnail root must never parse.
		expect(parseThumbnailName('nested/dir-480w.jpg')).toBeNull();
	});
});

describe('thumbnail persistence', () => {
	it('writes a thumbnail that survives independently of the original', async () => {
		// arrange
		const mediaRoot = createMediaRoot();
		const original = await buildImage(1200, 800);

		// act
		const key = await writeThumbnail(mediaRoot, 'original.jpg', 480, original);
		const stored = await readThumbnail(mediaRoot, 'original.jpg', 480);

		// assume
		expect(key).toBe('original-480w.jpg');
		expect(stored).not.toBeNull();
		const metadata = await sharp(stored!).metadata();
		expect(metadata.width).toBe(480);
		expect(metadata.format).toBe('jpeg');
	});

	it('keeps the aspect ratio and never enlarges a small image', async () => {
		// arrange
		const mediaRoot = createMediaRoot();
		const small = await buildImage(200, 100);

		// act
		await writeThumbnail(mediaRoot, 'small.jpg', 480, small);
		const stored = await readThumbnail(mediaRoot, 'small.jpg', 480);
		const metadata = await sharp(stored!).metadata();

		// assume — 200x100 stays as it is; upscaling would only waste bytes.
		expect(metadata.width).toBe(200);
		expect(metadata.height).toBe(100);
	});

	it('writes the thumbnail under the thumbnail root, not beside the original', async () => {
		// arrange
		const mediaRoot = createMediaRoot();
		mkdirSync(mediaRoot, { recursive: true });

		// act
		await writeThumbnail(mediaRoot, 'original.jpg', 480, await buildImage(900, 600));

		// assume
		const entries = readdirSync(mediaRoot);
		expect(entries).toContain('.thumbs');
		expect(entries.filter((entry) => entry.startsWith('original'))).toEqual([]);
		expect(readdirSync(join(mediaRoot, '.thumbs'))).toEqual(['original-480w.jpg']);
	});

	it('removes EXIF metadata from the thumbnail', async () => {
		// arrange
		const mediaRoot = createMediaRoot();
		const tagged = await sharp({
			create: { width: 900, height: 600, channels: 3, background: { r: 1, g: 2, b: 3 } }
		})
			.jpeg()
			.withMetadata({ exif: { IFD0: { Copyright: 'private' } } })
			.toBuffer();

		// act
		await writeThumbnail(mediaRoot, 'tagged.jpg', 480, tagged);
		const stored = await readThumbnail(mediaRoot, 'tagged.jpg', 480);

		// assume
		const metadata = await sharp(stored!).metadata();
		expect(metadata.exif).toBeUndefined();
	});

	it('reports a missing thumbnail instead of throwing', async () => {
		// arrange
		const mediaRoot = createMediaRoot();

		// act
		const stored = await readThumbnail(mediaRoot, 'never-written.jpg', 480);

		// assume
		expect(stored).toBeNull();
	});

	it('is small enough to be a real thumbnail', async () => {
		// arrange
		const mediaRoot = createMediaRoot();
		const original = await buildImage(1600, 1200);

		// act
		await writeThumbnail(mediaRoot, 'big.jpg', 480, original);
		const stored = await readThumbnail(mediaRoot, 'big.jpg', 480);

		// assume — the grid renders tiles around 185 px wide, so 480 px is generous.
		expect(stored!.length).toBeLessThan(original.length);
		expect(statSync(join(mediaRoot, '.thumbs', 'big-480w.jpg')).size).toBe(stored!.length);
	});

	it('writes the same thumbnail only once for repeated requests', async () => {
		// arrange
		const mediaRoot = createMediaRoot();
		const original = await buildImage(1000, 1000);

		// act
		await writeThumbnail(mediaRoot, 'repeat.jpg', 480, original);
		const first = statSync(join(mediaRoot, '.thumbs', 'repeat-480w.jpg')).mtimeMs;
		const cached = await readThumbnail(mediaRoot, 'repeat.jpg', 480);
		const second = statSync(join(mediaRoot, '.thumbs', 'repeat-480w.jpg')).mtimeMs;

		// assume — reading an existing thumbnail must not rewrite it.
		expect(cached).not.toBeNull();
		expect(second).toBe(first);
	});

	it('derives the thumbnail size ceiling from the constant', () => {
		// act + assume — the ceiling is what the caller clamps a requested size to.
		expect(maximumThumbnailEdge).toBeGreaterThanOrEqual(480);
	});

	it('produces a key whose name stays stable for the same input', async () => {
		// arrange
		const mediaRoot = createMediaRoot();
		const original = await buildImage(700, 500);
		const digest = createHash('sha256').update(original).digest('hex');

		// act
		const key = await writeThumbnail(mediaRoot, `${digest}.jpg`, 480, original);

		// assume
		expect(key).toBe(`${digest}-480w.jpg`);
	});
});
