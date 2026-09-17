import { describe, expect, it } from 'vitest';
import { defaultThumbnailEdge, thumbnailUrl } from '$lib/thumbnails';
import { thumbnailKeyFor } from '$lib/server/thumbnails';

describe('thumbnail url', () => {
	it('builds the route the delivery handler reverses', () => {
		// act
		const url = thumbnailUrl('abc123.jpg');

		// assume
		expect(url).toBe('/thumb/abc123-480w.jpg');
		expect(decodeURIComponent(url.replace('/thumb/', ''))).toBe(
			thumbnailKeyFor('abc123.jpg', defaultThumbnailEdge)
		);
	});

	it('uses the requested edge', () => {
		// act + assume
		expect(thumbnailUrl('abc123.jpg', 240)).toBe('/thumb/abc123-240w.jpg');
	});

	it('agrees with the server key naming for every supported extension', () => {
		// act + assume
		for (const extension of ['jpg', 'png', 'webp']) {
			const key = `abc123.${extension}`;
			expect(decodeURIComponent(thumbnailUrl(key, 512).replace('/thumb/', ''))).toBe(
				thumbnailKeyFor(key, 512)
			);
		}
	});

	it('keeps the extension so the delivery route serves the right content type', () => {
		// act + assume
		expect(thumbnailUrl('abc123.png')).toMatch(/\.png$/);
		expect(thumbnailUrl('abc123.webp')).toMatch(/\.webp$/);
	});

	it('falls back to the original for a key that has no supported extension', () => {
		// act
		const url = thumbnailUrl('notes.txt');

		// assume — a broken thumbnail URL would be worse than the full-size image.
		expect(url).toBe('/media/notes.txt');
	});

	it('falls back for a key with no extension at all', () => {
		// act + assume
		expect(thumbnailUrl('noextension')).toBe('/media/noextension');
	});

	it('encodes a key so the URL stays valid', () => {
		// act
		const url = thumbnailUrl('a b.jpg', 480);

		// assume
		expect(url).not.toContain(' ');
		expect(decodeURIComponent(url)).toBe('/thumb/a b-480w.jpg');
	});
});
