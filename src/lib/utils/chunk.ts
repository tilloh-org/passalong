/**
 * Divide a list into fixed-size, consecutive pages.
 *
 * @template T
 * @param {readonly T[]} values - Values to split into pages.
 * @param {number} pageSize - Maximum number of values per page.
 * @returns {T[][]} Consecutive pages of values.
 * @throws {RangeError} When the requested page size is not a positive integer.
 */
export function chunkIntoPages<T>(values: readonly T[], pageSize: number): T[][] {
	if (!Number.isInteger(pageSize) || pageSize < 1) {
		throw new RangeError('pageSize must be a positive integer');
	}

	const pages: T[][] = [];
	for (let index = 0; index < values.length; index += pageSize) {
		pages.push(values.slice(index, index + pageSize));
	}
	return pages;
}
