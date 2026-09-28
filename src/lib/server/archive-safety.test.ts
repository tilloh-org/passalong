import { describe, expect, it } from 'vitest';
import {
	MAXIMUM_ARCHIVE_BYTES,
	MAXIMUM_COMPRESSION_RATIO,
	MAXIMUM_ENTRY_BYTES,
	MAXIMUM_EXTRACTED_BYTES,
	assertArchiveWithinLimits
} from '$lib/server/archive-safety';

/**
 * Build a safe archive entry list for the given sizes.
 *
 * @param {Array<{ name: string; size: number; compressedSize?: number }>} entries - Entry descriptors.
 * @returns {Array<{ name: string; size: number; compressedSize: number }>} Entries with declared sizes.
 */
function entriesFor(
	entries: Array<{ name: string; size: number; compressedSize?: number }>
): Array<{ name: string; size: number; compressedSize: number }> {
	return entries.map((entry) => ({
		name: entry.name,
		size: entry.size,
		compressedSize: entry.compressedSize ?? entry.size
	}));
}

describe('archive safety gate', () => {
	it('accepts a clean archive', () => {
		// act
		const result = assertArchiveWithinLimits(
			entriesFor([
				{ name: 'manifest.json', size: 400 },
				{ name: 'data.json', size: 2048 },
				{ name: 'media/photo.jpg', size: 8192 }
			]),
			{ archiveBytes: 10_000 }
		);

		// assume
		expect(result.ok).toBe(true);
	});

	it('rejects a traversal path', () => {
		// act
		const result = assertArchiveWithinLimits(entriesFor([{ name: '../escape.txt', size: 10 }]), {
			archiveBytes: 1000
		});

		// assume
		expect(result.ok).toBe(false);
	});

	it('rejects a nested traversal path', () => {
		// act
		const result = assertArchiveWithinLimits(
			entriesFor([{ name: 'media/../../escape.txt', size: 10 }]),
			{ archiveBytes: 1000 }
		);

		// assume
		expect(result.ok).toBe(false);
	});

	it('rejects an absolute path', () => {
		// act
		const result = assertArchiveWithinLimits(entriesFor([{ name: '/etc/passwd', size: 10 }]), {
			archiveBytes: 1000
		});

		// assume
		expect(result.ok).toBe(false);
	});

	it('rejects a windows style absolute path', () => {
		// act
		const result = assertArchiveWithinLimits(
			entriesFor([{ name: 'C:\\windows\\system32', size: 10 }]),
			{
				archiveBytes: 1000
			}
		);

		// assume
		expect(result.ok).toBe(false);
	});

	it('rejects a backslash separated traversal', () => {
		// act
		const result = assertArchiveWithinLimits(
			entriesFor([{ name: 'media\\..\\escape.txt', size: 10 }]),
			{
				archiveBytes: 1000
			}
		);

		// assume
		expect(result.ok).toBe(false);
	});

	it('rejects a symlink entry', () => {
		// act
		const result = assertArchiveWithinLimits(
			entriesFor([{ name: 'media/link', size: 10 }]),
			{ archiveBytes: 1000 },
			{ isSymlink: (name) => name === 'media/link' }
		);

		// assume
		expect(result.ok).toBe(false);
	});

	it('rejects an empty entry name', () => {
		// act
		const result = assertArchiveWithinLimits(entriesFor([{ name: '', size: 10 }]), {
			archiveBytes: 1000
		});

		// assume
		expect(result.ok).toBe(false);
	});

	it('rejects an archive that exceeds the maximum archive size', () => {
		// act
		const result = assertArchiveWithinLimits(entriesFor([{ name: 'data.json', size: 10 }]), {
			archiveBytes: MAXIMUM_ARCHIVE_BYTES + 1
		});

		// assume
		expect(result.ok).toBe(false);
	});

	it('rejects a single entry that exceeds the maximum entry size', () => {
		// act
		const result = assertArchiveWithinLimits(
			entriesFor([{ name: 'media/huge.jpg', size: MAXIMUM_ENTRY_BYTES + 1 }]),
			{
				archiveBytes: 1000
			}
		);

		// assume
		expect(result.ok).toBe(false);
	});

	it('rejects a set of entries whose extracted total exceeds the limit', () => {
		// arrange
		const size = Math.floor(MAXIMUM_EXTRACTED_BYTES / 2) + 1024;

		// act
		const result = assertArchiveWithinLimits(
			entriesFor([
				{ name: 'media/one.jpg', size },
				{ name: 'media/two.jpg', size },
				{ name: 'media/three.jpg', size }
			]),
			{ archiveBytes: 1000 }
		);

		// assume
		expect(result.ok).toBe(false);
	});

	it('rejects a compression ratio that indicates a zip bomb', () => {
		// act
		const result = assertArchiveWithinLimits(
			entriesFor([
				{
					name: 'media/bomb.bin',
					size: (MAXIMUM_COMPRESSION_RATIO + 1) * 1024,
					compressedSize: 1024
				}
			]),
			{ archiveBytes: 2000 }
		);

		// assume
		expect(result.ok).toBe(false);
	});

	it('accepts a ratio at the documented boundary', () => {
		// act
		const result = assertArchiveWithinLimits(
			entriesFor([
				{
					name: 'media/repetitive.bin',
					size: MAXIMUM_COMPRESSION_RATIO * 1024,
					compressedSize: 1024
				}
			]),
			{ archiveBytes: 2000 }
		);

		// assume
		expect(result.ok).toBe(true);
	});

	it('rejects a duplicated entry name', () => {
		// act
		const result = assertArchiveWithinLimits(
			entriesFor([
				{ name: 'data.json', size: 10 },
				{ name: 'data.json', size: 10 }
			]),
			{ archiveBytes: 1000 }
		);

		// assume
		expect(result.ok).toBe(false);
	});

	it('rejects a directory style entry with a trailing separator', () => {
		// act
		const result = assertArchiveWithinLimits(entriesFor([{ name: 'media/', size: 0 }]), {
			archiveBytes: 1000
		});

		// assume
		expect(result.ok).toBe(false);
	});
});
