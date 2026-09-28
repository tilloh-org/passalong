import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { iconNames } from '$lib/icons';

const appHtmlPath = resolve(process.cwd(), 'src/app.html');
const appStylesPath = resolve(process.cwd(), 'src/app.css');
const iconComponentPath = resolve(process.cwd(), 'src/lib/components/icon.svelte');

const appHtml = readFileSync(appHtmlPath, 'utf8');
const appStyles = readFileSync(appStylesPath, 'utf8');
const iconComponent = readFileSync(iconComponentPath, 'utf8');

/**
 * Assert that a component source references a given sprite symbol, either as a
 * JS string (`'scan'`) or as a markup attribute (`name="scan"`).
 *
 * @param {string} source - Component source text.
 * @param {string} name - Icon name without the `i-` prefix.
 * @returns {boolean} Whether the icon is referenced.
 */
const referencesIcon = (source: string, name: string) =>
	source.includes(`'${name}'`) || source.includes(`name="${name}"`);

describe('icon sprite infrastructure', () => {
	it('ships every registry icon as an inline sprite symbol', () => {
		// arrange
		const symbolNames = [...appHtml.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map(
			(match) => match[1]
		);

		// act
		const missing = iconNames.filter((name) => !symbolNames.includes(name));
		const unreferenced = symbolNames.filter((name) => !iconNames.includes(name as never));

		// assume
		expect(missing).toEqual([]);
		expect(unreferenced).toEqual([]);
		expect(symbolNames.length).toBe(iconNames.length);
	});

	it('vendors the icon set instead of loading it from a CDN', () => {
		// act
		const cdnReferences = [...appHtml.matchAll(/https?:\/\/[^"'\s]*tabler[^"'\s]*/gi)].map(
			(match) => match[0]
		);

		// assume
		expect(cdnReferences).toEqual([]);
		expect(iconComponent).toContain('href={`#i-${name}`}');
	});

	it('renders icons as decorative so controls keep a single accessible name', () => {
		// act
		const svgTag = iconComponent.match(/<svg[\s\S]*?>/)?.[0] ?? '';

		// assume
		expect(svgTag).toContain('class="icon');
		expect(svgTag).toContain('aria-hidden="true"');
		expect(svgTag).toContain('focusable="false"');
		expect(iconComponent).not.toContain('aria-label');
	});

	it('exposes shared size and tone classes in the global stylesheet', () => {
		// act
		const baseRule = appStyles.match(/\.icon\s*\{[\s\S]*?\}/)?.[0] ?? '';

		// assume
		expect(baseRule).toContain('stroke: currentColor;');
		expect(baseRule).toContain('stroke-width: 2;');
		expect(baseRule).toContain('fill: none;');
		for (const modifier of ['.icon-sm', '.icon-lg', '.icon-muted', '.icon-ok', '.icon-danger']) {
			expect(appStyles).toContain(`${modifier} {`);
		}
	});
});

describe('icon usage across the application', () => {
	const componentSources = {
		layout: readFileSync(resolve(process.cwd(), 'src/routes/+layout.svelte'), 'utf8'),
		portfolio: readFileSync(resolve(process.cwd(), 'src/routes/+page.svelte'), 'utf8'),
		item: readFileSync(resolve(process.cwd(), 'src/routes/items/[id]/+page.svelte'), 'utf8'),
		marketDays: readFileSync(resolve(process.cwd(), 'src/routes/market-days/+page.svelte'), 'utf8'),
		marketDay: readFileSync(
			resolve(process.cwd(), 'src/routes/market-days/[id]/+page.svelte'),
			'utf8'
		),
		scan: readFileSync(resolve(process.cwd(), 'src/routes/scan/+page.svelte'), 'utf8'),
		priceLabels: readFileSync(
			resolve(process.cwd(), 'src/routes/price-labels/+page.svelte'),
			'utf8'
		),
		sales: readFileSync(resolve(process.cwd(), 'src/routes/sales/+page.svelte'), 'utf8'),
		statistics: readFileSync(resolve(process.cwd(), 'src/routes/statistics/+page.svelte'), 'utf8'),
		profile: readFileSync(resolve(process.cwd(), 'src/routes/profile/+page.svelte'), 'utf8'),
		admin: readFileSync(resolve(process.cwd(), 'src/routes/admin/+page.svelte'), 'utf8'),
		stand: readFileSync(
			resolve(process.cwd(), 'src/routes/stand/[collectionId]/+page.svelte'),
			'utf8'
		),
		itemFilterForm: readFileSync(
			resolve(process.cwd(), 'src/lib/components/item-filter-form.svelte'),
			'utf8'
		),
		itemInfoBlock: readFileSync(
			resolve(process.cwd(), 'src/lib/components/item-info-block.svelte'),
			'utf8'
		),
		chartToggle: readFileSync(
			resolve(process.cwd(), 'src/lib/components/statistics/chart-toggle.svelte'),
			'utf8'
		)
	};

	it('gives every global navigation entry an icon', () => {
		// act
		const nav = componentSources.layout;

		// assume
		for (const name of [
			'plus',
			'scan',
			'calendar',
			'tag',
			'history',
			'chart-bar',
			'building-store',
			'world',
			'sun',
			'moon'
		]) {
			expect(referencesIcon(nav, name)).toBe(true);
		}
	});

	it('covers the portfolio, item, and market-day actions', () => {
		// act
		const portfolio = componentSources.portfolio;
		const item = componentSources.item;
		const marketDays = componentSources.marketDays;
		const marketDay = componentSources.marketDay;

		// assume
		for (const name of ['plus', 'euro', 'package', 'photo']) {
			expect(referencesIcon(portfolio, name)).toBe(true);
		}
		for (const name of ['trash', 'edit', 'bookmark', 'check', 'rotate', 'download', 'qrcode']) {
			expect(referencesIcon(item, name)).toBe(true);
		}
		expect(referencesIcon(marketDays, 'plus')).toBe(true);
		for (const name of ['arrow-left', 'trash', 'check', 'rotate', 'wallet', 'edit']) {
			expect(referencesIcon(marketDay, name)).toBe(true);
		}
	});

	it('covers scan, labels, sales, statistics, profile, and admin', () => {
		// act
		const sources = componentSources;

		// assume
		for (const name of ['camera', 'upload', 'x']) {
			expect(referencesIcon(sources.scan, name)).toBe(true);
		}
		for (const name of ['printer', 'tag']) {
			expect(referencesIcon(sources.priceLabels, name)).toBe(true);
		}
		for (const name of ['filter', 'history']) {
			expect(referencesIcon(sources.sales, name)).toBe(true);
		}
		for (const name of ['chart-bar', 'chart-pie', 'euro']) {
			expect(referencesIcon(sources.statistics, name)).toBe(true);
		}
		for (const name of ['download', 'upload', 'logout', 'link', 'external-link', 'key']) {
			expect(referencesIcon(sources.profile, name)).toBe(true);
		}
		for (const name of ['download', 'upload', 'key', 'alert-triangle']) {
			expect(referencesIcon(sources.admin, name)).toBe(true);
		}
	});

	it('covers shared components', () => {
		// act
		const sources = componentSources;

		// assume
		for (const name of ['search', 'filter']) {
			expect(referencesIcon(sources.itemFilterForm, name)).toBe(true);
		}
		for (const name of ['heart', 'heart-filled', 'photo']) {
			expect(referencesIcon(sources.stand, name)).toBe(true);
		}
		for (const name of ['chart-bar', 'chart-pie']) {
			expect(referencesIcon(sources.chartToggle, name)).toBe(true);
		}
		for (const name of ['check', 'settings', 'note', 'bookmark']) {
			expect(referencesIcon(sources.itemInfoBlock, name)).toBe(true);
		}
	});

	it('never doubles a glyph that the label already carries', () => {
		// arrange
		const dictionary = readFileSync(resolve(process.cwd(), 'src/lib/i18n/index.svelte.ts'), 'utf8');

		// act — labels that sit next to a plus icon must not repeat the plus as text
		const newItemLabels = [...dictionary.matchAll(/'nav\.newItem':\s*'([^']*)'/g)].map(
			(match) => match[1]
		);

		// assume
		expect(newItemLabels.length).toBe(2);
		for (const label of newItemLabels) {
			expect(label.startsWith('+')).toBe(false);
			expect(label).not.toContain('+');
		}
	});

	it('routes every component icon reference through the sprite', () => {
		// act
		const sources = Object.entries(componentSources);

		// assume
		for (const [label, source] of sources) {
			expect(source, `${label} must render icons via the Icon component`).not.toMatch(
				/<use\s+href="#icon-/
			);
		}
	});

	it('keeps the registry free of icons the app never renders', () => {
		// act
		const usedNames = new Set<string>();
		for (const source of Object.values(componentSources)) {
			// `name="x"` and `name={'x'}` forms, plus the branches of `name={a ? 'b' : 'c'}`.
			for (const match of source.matchAll(/\bname=(?:"([a-z0-9-]+)"|\{([^}]*)\})/g)) {
				if (match[1]) {
					usedNames.add(match[1]);
				}
				if (match[2]) {
					for (const branch of match[2].matchAll(/'([a-z0-9-]+)'/g)) {
						usedNames.add(branch[1]);
					}
				}
			}
		}

		// assume — an unused entry still ships its geometry in the sprite on every page load
		const unused = iconNames.filter((name) => !usedNames.has(name));
		expect(unused).toEqual([]);
	});
});
