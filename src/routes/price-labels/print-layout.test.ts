import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const priceLabelsPagePath = resolve(process.cwd(), 'src/routes/price-labels/+page.svelte');

describe('price-label print layout', () => {
	it('declares a deterministic A4 sheet with 8mm margins', () => {
		// act
		const source = readFileSync(priceLabelsPagePath, 'utf8');

		// assume
		expect(source).toMatch(/@page\s*\{\s*size:\s*A4 portrait;\s*margin:\s*8mm;\s*\}/);
		expect(source).toContain('width: 194mm;');
		expect(source).toContain('height: 281mm;');
	});
});
