import { describe, expect, it } from 'vitest';
import { resolveArticleDetailPath } from './scan';

describe('resolveArticleDetailPath', () => {
	it('normalizes a full article URL', () => {
		// arrange
		const scannedValue = 'https://example.com/items/abc-123';

		// act
		const targetPath = resolveArticleDetailPath(scannedValue, 'https://example.com');

		// assume
		expect(targetPath).toBe('/items/abc-123');
	});

	it('normalizes a relative article path', () => {
		// arrange
		const scannedValue = '/items/abc-123/';

		// act
		const targetPath = resolveArticleDetailPath(scannedValue, 'https://example.com');

		// assume
		expect(targetPath).toBe('/items/abc-123');
	});

	it('converts a bare article id to the neutral QR route', () => {
		// arrange
		const scannedValue = 'abc-123';

		// act
		const targetPath = resolveArticleDetailPath(scannedValue, 'https://example.com');

		// assume
		expect(targetPath).toBe('/q/abc-123');
	});

	it('accepts a shorthand article path without a leading slash', () => {
		// arrange
		const scannedValue = 'items/abc-123';

		// act
		const targetPath = resolveArticleDetailPath(scannedValue, 'https://example.com');

		// assume
		expect(targetPath).toBe('/items/abc-123');
	});

	it('normalizes a neutral QR URL', () => {
		// arrange
		const scannedValue = 'https://example.com/q/abc-123';

		// act
		const targetPath = resolveArticleDetailPath(scannedValue, 'https://example.com');

		// assume
		expect(targetPath).toBe('/q/abc-123');
	});

	it('rejects values that do not point to an article', () => {
		// arrange
		const scannedValue = 'https://example.com/stand/abc-123';

		// act
		const targetPath = resolveArticleDetailPath(scannedValue, 'https://example.com');

		// assume
		expect(targetPath).toBeNull();
	});

	it('rejects empty values', () => {
		// arrange
		const scannedValue = '   ';

		// act
		const targetPath = resolveArticleDetailPath(scannedValue, 'https://example.com');

		// assume
		expect(targetPath).toBeNull();
	});
});
