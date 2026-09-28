import { describe, expect, it } from 'vitest';
import {
	CHECKSUM_ALGORITHM,
	DATA_ENTRY_NAME,
	EXCHANGE_FORMAT_NAME,
	EXCHANGE_FORMAT_VERSION,
	MANIFEST_ENTRY_NAME,
	MEDIA_ENTRY_PREFIX,
	parseExchangeManifest
} from '$lib/server/exchange-format';

/**
 * Build a minimal manifest object that satisfies the required fields.
 *
 * @param {Record<string, unknown>} overrides - Fields to overwrite.
 * @returns {Record<string, unknown>} Manifest candidate for the parser.
 */
function manifestCandidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		format: EXCHANGE_FORMAT_NAME,
		version: EXCHANGE_FORMAT_VERSION,
		archiveId: 'archive-1',
		createdAt: '2026-09-15T10:00:00.000Z',
		producerId: 'generic-exporter',
		counts: {
			users: 2,
			tenants: 2,
			collections: 2,
			items: 3,
			marketDays: 1,
			sales: 1,
			expenses: 0
		},
		media: { files: 3, bytes: 2048 },
		checksumAlgorithm: CHECKSUM_ALGORITHM,
		files: { [DATA_ENTRY_NAME]: { sha256: 'a'.repeat(64), bytes: 100 } },
		...overrides
	};
}

describe('exchange format contract', () => {
	it('exposes the documented entry names and checksum algorithm', () => {
		// act + assume
		expect(MANIFEST_ENTRY_NAME).toBe('manifest.json');
		expect(DATA_ENTRY_NAME).toBe('data.json');
		expect(MEDIA_ENTRY_PREFIX).toBe('media/');
		expect(CHECKSUM_ALGORITHM).toBe('sha256');
		expect(EXCHANGE_FORMAT_NAME).toBe('passalong-instance-exchange');
		expect(EXCHANGE_FORMAT_VERSION).toBe(1);
	});

	it('accepts a well formed version 1 manifest', () => {
		// act
		const result = parseExchangeManifest(JSON.stringify(manifestCandidate()));

		// assume
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.manifest.format).toBe(EXCHANGE_FORMAT_NAME);
			expect(result.manifest.version).toBe(EXCHANGE_FORMAT_VERSION);
			expect(result.manifest.counts.users).toBe(2);
			expect(result.manifest.files[DATA_ENTRY_NAME].bytes).toBe(100);
		}
	});

	it('rejects an unknown major format version', () => {
		// act
		const result = parseExchangeManifest(JSON.stringify(manifestCandidate({ version: 2 })));

		// assume
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toMatch(/version/i);
		}
	});

	it('rejects a manifest produced by a different format', () => {
		// act
		const result = parseExchangeManifest(
			JSON.stringify(manifestCandidate({ format: 'some-other-tool' }))
		);

		// assume
		expect(result.ok).toBe(false);
	});

	it('rejects a manifest that is missing required fields', () => {
		// act
		const result = parseExchangeManifest(JSON.stringify(manifestCandidate({ archiveId: '' })));

		// assume
		expect(result.ok).toBe(false);
	});

	it('rejects a manifest that is missing the checksum algorithm', () => {
		// act
		const result = parseExchangeManifest(
			JSON.stringify(manifestCandidate({ checksumAlgorithm: undefined }))
		);

		// assume
		expect(result.ok).toBe(false);
	});

	it('rejects malformed json without throwing', () => {
		// act
		const result = parseExchangeManifest('{not json');

		// assume
		expect(result.ok).toBe(false);
	});

	it('applies documented defaults to optional fields of older archives', () => {
		// arrange
		const candidate = manifestCandidate();
		delete (candidate.counts as Record<string, unknown>).expenses;
		delete (candidate.counts as Record<string, unknown>).sales;
		delete (candidate.counts as Record<string, unknown>).marketDays;

		// act
		const result = parseExchangeManifest(JSON.stringify(candidate));

		// assume
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.manifest.counts.expenses).toBe(0);
			expect(result.manifest.counts.sales).toBe(0);
			expect(result.manifest.counts.marketDays).toBe(0);
		}
	});

	it('does not invent required counts that the archive omits', () => {
		// arrange
		const candidate = manifestCandidate();
		delete (candidate.counts as Record<string, unknown>).items;

		// act
		const result = parseExchangeManifest(JSON.stringify(candidate));

		// assume
		expect(result.ok).toBe(false);
	});
});
