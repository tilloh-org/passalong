import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('portfolio select controls', () => {
	it('gives item-form selects a layered surface, custom arrow, and hover treatment', () => {
		// arrange
		const portfolioPagePath = resolve(process.cwd(), 'src/routes/+page.svelte');
		const appStylesPath = resolve(process.cwd(), 'src/app.css');

		// act
		const source = readFileSync(portfolioPagePath, 'utf8');
		const appStyles = readFileSync(appStylesPath, 'utf8');

		// assume
		expect(appStyles).toContain('--select-form-arrow: url(');
		expect(source).toMatch(
			/\.item-form select\s*\{[\s\S]*?background-image:\s*var\(--select-form-arrow\),[\s\S]*?linear-gradient\([\s\S]*?box-shadow:[\s\S]*?font-weight:\s*600;[\s\S]*?min-height:\s*2\.85rem;/
		);
		expect(source).toMatch(
			/\.item-form select:hover:not\(:disabled\)\s*\{[\s\S]*?border-color:\s*var\(--color-ice\);/
		);
	});

	it('keeps the focus ring on item-form selects', () => {
		// arrange
		const portfolioPagePath = resolve(process.cwd(), 'src/routes/+page.svelte');

		// act
		const source = readFileSync(portfolioPagePath, 'utf8');

		// assume — the select rules set box-shadow later in the sheet, so a
		// select-specific focus rule must restore the ring
		expect(source).toMatch(
			/\.item-form select:focus,\s*\n\s*\.item-form select:focus-visible\s*\{[\s\S]*?box-shadow:\s*0 0 0 4px var\(--focus-ring\);/
		);
	});
});
