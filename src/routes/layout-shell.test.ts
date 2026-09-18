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

	it('keeps the body box at least as tall as the viewport', () => {
		// act
		const source = readFileSync(appStylesPath, 'utf8');

		// assume — the decorative gradient is painted on `body`. A fixed attachment does not extend
		// the paint area beyond that box, so on a page whose body is shorter than the viewport the
		// gradient ends early and the flat html colour continues below it: a visible edge. Pages
		// with a tall body (portfolio, profile) hide the bug, which is why the fix has to be here.
		expect(source).toMatch(/body\s*\{[\s\S]*?min-height:\s*100(d)?vh;/);
	});

	it('paints the theme base colour behind the fixed background', () => {
		// act
		const source = readFileSync(appStylesPath, 'utf8');

		// assume — a fixed body background only covers the viewport, so `html` must paint the
		// gradient's final colour; otherwise everything below the first viewport stays white.
		expect(source).toMatch(/html\s*\{[\s\S]*?background-color:\s*var\(--color-bg-end\);/);
		expect(source).toMatch(/--color-bg-end:\s*#eef2f4;/);
		expect(source).toMatch(/\[data-theme='dark'\][\s\S]*?--color-bg-end:\s*#16242e;/);
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
