import { describe, expect, it } from 'vitest';
import { chunkIntoPages } from './chunk';

describe('chunkIntoPages', () => {
	it('splits seventeen labels into one full sheet and one remaining label', () => {
		// arrange
		const labels = Array.from({ length: 17 }, (_, index) => `label-${index + 1}`);

		// act
		const sheets = chunkIntoPages(labels, 16);

		// assume
		expect(sheets).toHaveLength(2);
		expect(sheets.map((sheet) => sheet)).toEqual([labels.slice(0, 16), labels.slice(16)]);
	});
});
