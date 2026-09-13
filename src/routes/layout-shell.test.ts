import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appStylesPath = resolve(process.cwd(), 'src/app.css');
const layoutPath = resolve(process.cwd(), 'src/routes/+layout.svelte');
const selectStylePaths = [
	'src/routes/+page.svelte',
	'src/routes/items/[id]/+page.svelte',
	'src/routes/sales/+page.svelte',
	'src/routes/market-days/[id]/+page.svelte',
	'src/lib/components/item-filter-form.svelte'
].map((path) => resolve(process.cwd(), path));

describe('global layout shell', () => {
	it('keeps header controls inside the viewport gutter', () => {
		// act
		const source = readFileSync(layoutPath, 'utf8');

		// assume
		expect(source).toMatch(/\.masthead\s*\{[\s\S]*?margin:\s*0 0 2rem;/);
		expect(source).not.toContain('margin: 0 -1.5rem 2rem;');
	});

	it('keeps the decorative background attached to the viewport on tall pages', () => {
		// act
		const source = readFileSync(appStylesPath, 'utf8');

		// assume
		expect(source).toMatch(/body\s*\{[\s\S]*?background-attachment:\s*fixed;/);
		expect(source).toMatch(
			/\[data-theme='dark'\]\s+body\s*\{[\s\S]*?background-attachment:\s*fixed;/
		);
	});

	it('reserves a shared inset for native select arrows', () => {
		// arrange
		const selectSources = selectStylePaths.map((path) => readFileSync(path, 'utf8'));

		// act
		const appStyles = readFileSync(appStylesPath, 'utf8');

		// assume
		expect(appStyles).toContain('--select-arrow-inset: 1rem;');
		expect(appStyles).toContain('--select-arrow-size: 0.75rem;');
		for (const source of selectSources) {
			expect(source).toContain('appearance: none;');
			expect(source).toContain('background-image: var(--select-arrow);');
			expect(source).toContain('background-position: right var(--select-arrow-inset) center;');
			expect(source).toContain('padding-right: var(--select-control-end-padding);');
		}
	});
});
