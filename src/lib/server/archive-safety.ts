/**
 * Archive safety gate.
 *
 * Runs before any content parsing so a hostile archive is rejected on structure alone: traversal
 * paths, absolute paths, symlinks, duplicate names, oversized archives, oversized entries, an
 * oversized extracted total, and zip bombs (unusual compression ratios).
 */

/** Maximum accepted archive size in bytes. */
export const MAXIMUM_ARCHIVE_BYTES = 512 * 1024 * 1024;

/** Maximum accepted size of a single uncompressed entry in bytes. */
export const MAXIMUM_ENTRY_BYTES = 64 * 1024 * 1024;

/** Maximum accepted total of all uncompressed entries in bytes. */
export const MAXIMUM_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024;

/** Maximum accepted ratio of declared uncompressed to compressed size. */
export const MAXIMUM_COMPRESSION_RATIO = 200;

/** One archive entry as declared by the archive itself. */
export interface ArchiveSafetyEntry {
	name: string;
	size: number;
	compressedSize: number;
}

/** Safety gate result. */
export type ArchiveSafetyResult = { ok: true } | { ok: false; reason: string };

/** Optional gate overrides, used by callers and tests. */
export interface ArchiveSafetyOptions {
	maximumCompressionRatio?: number;
	isSymlink?: (name: string) => boolean;
}

/**
 * Reject unsafe archives before their contents are parsed.
 *
 * @param {ArchiveSafetyEntry[]} entries - Entries with their declared sizes.
 * @param {{ archiveBytes: number }} archive - Total archive size in bytes.
 * @param {ArchiveSafetyOptions} [options] - Compression-ratio and symlink overrides.
 * @returns {ArchiveSafetyResult} Whether the archive may be processed.
 */
export function assertArchiveWithinLimits(
	entries: ArchiveSafetyEntry[],
	archive: { archiveBytes: number },
	options: ArchiveSafetyOptions = {}
): ArchiveSafetyResult {
	const maximumRatio = options.maximumCompressionRatio ?? MAXIMUM_COMPRESSION_RATIO;
	if (archive.archiveBytes > MAXIMUM_ARCHIVE_BYTES) {
		return { ok: false, reason: 'archive exceeds the maximum archive size' };
	}

	const seen = new Set<string>();
	let extractedTotal = 0;
	for (const entry of entries) {
		if (entry.name === '') {
			return { ok: false, reason: 'archive contains an entry without a name' };
		}
		if (entry.name.endsWith('/')) {
			return { ok: false, reason: 'archive contains a directory style entry' };
		}
		if (seen.has(entry.name)) {
			return { ok: false, reason: `archive contains the duplicate entry ${entry.name}` };
		}
		seen.add(entry.name);
		if (!isSafeRelativePath(entry.name)) {
			return { ok: false, reason: `archive entry ${entry.name} escapes the target directory` };
		}
		if (options.isSymlink?.(entry.name)) {
			return { ok: false, reason: `archive entry ${entry.name} is a symbolic link` };
		}
		if (entry.size > MAXIMUM_ENTRY_BYTES) {
			return { ok: false, reason: `archive entry ${entry.name} exceeds the maximum file size` };
		}
		if (entry.compressedSize > 0 && entry.size / entry.compressedSize > maximumRatio) {
			return {
				ok: false,
				reason: `archive entry ${entry.name} has an implausible compression ratio`
			};
		}
		extractedTotal += entry.size;
		if (extractedTotal > MAXIMUM_EXTRACTED_BYTES) {
			return { ok: false, reason: 'archive exceeds the maximum extracted size' };
		}
	}
	return { ok: true };
}

/**
 * Check that a declared entry name stays inside the extraction directory.
 *
 * @param {string} name - Declared archive entry name.
 * @returns {boolean} Whether the name is a safe relative path.
 */
function isSafeRelativePath(name: string): boolean {
	const normalised = name.replace(/\\/g, '/');
	if (normalised.startsWith('/')) {
		return false;
	}
	if (/^[A-Za-z]:/.test(normalised)) {
		return false;
	}
	return normalised.split('/').every((segment) => segment !== '..' && segment !== '');
}
