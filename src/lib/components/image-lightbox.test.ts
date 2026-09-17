import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appStylesPath = resolve(process.cwd(), 'src/app.css');
const lightboxPath = resolve(process.cwd(), 'src/lib/components/image-lightbox.svelte');

describe('photo viewer chrome', () => {
	it('dims the page behind the viewer almost completely', () => {
		// arrange
		const source = readFileSync(lightboxPath, 'utf8');
		const tokens = readFileSync(appStylesPath, 'utf8');

		// act
		const backdropRule = /\.lightbox::backdrop\s*\{([\s\S]*?)\}/.exec(source)?.[1] ?? '';
		const scrimValue = /--scrim-viewer:\s*rgba\([^)]*?([\d.]+)\s*\);/.exec(tokens)?.[1];

		// assume — the viewer is the one surface where the page behind must be barely visible, so
		// its scrim is near-opaque and its own token. The shared `--scrim` is a mild dim meant for
		// the navigation drawer, where the page must stay readable.
		expect(backdropRule).toContain('background: var(--scrim-viewer);');
		expect(scrimValue, 'a --scrim-viewer token must exist').toBeDefined();
		expect(Number(scrimValue)).toBeGreaterThanOrEqual(0.9);
	});

	it('gives the controls an opaque background instead of a translucent one', () => {
		// arrange
		const source = readFileSync(lightboxPath, 'utf8');

		// act
		const controlRule =
			/\.lightbox-close,\s*\.lightbox-nav\s*\{([\s\S]*?)\}/.exec(source)?.[1] ?? '';

		// assume — a translucent control lets a bright photo show through the button, which reads
		// as a disabled or broken control. The arrow buttons overlay the photo, so this matters
		// most for them.
		expect(controlRule).toContain('background: var(--viewer-control-bg);');
		expect(controlRule).not.toMatch(/background:\s*rgba\(/);
		expect(controlRule).not.toMatch(/background:\s*transparent/);
	});

	it('keeps the controls visible without hover or focus', () => {
		// arrange
		const source = readFileSync(lightboxPath, 'utf8');

		// act
		const controlRule =
			/\.lightbox-close,\s*\.lightbox-nav\s*\{([\s\S]*?)\}/.exec(source)?.[1] ?? '';

		// assume — no rule may hide them behind a hover or a delay; they are the only way to move
		// through the gallery with a mouse, and a photo is exactly when they are needed.
		expect(controlRule).toMatch(/opacity:\s*1;/);
		expect(source).not.toMatch(/\.lightbox-(close|nav)[^{]*\{[^}]*opacity:\s*0/);
		expect(source).not.toMatch(/\.lightbox-(close|nav)[^{]*\{[^}]*visibility:\s*hidden/);
	});

	it('does not use a made-up colour token', () => {
		// arrange
		const source = readFileSync(lightboxPath, 'utf8');
		const tokens = readFileSync(appStylesPath, 'utf8');

		// act
		const usedTokens = [...source.matchAll(/var\((--[a-z-]+)/g)].map((match) => match[1]);
		const undefinedTokens = usedTokens.filter((token) => !tokens.includes(`${token}:`));

		// assume — `var(--typo, #fallback)` ships a real colour under a name that no theme defines,
		// so a later theme change silently has no effect on it.
		expect(undefinedTokens).toEqual([]);
	});

	it('hard-codes no colour, so both themes keep working', () => {
		// arrange
		const source = readFileSync(lightboxPath, 'utf8');
		const styleBlock = source.slice(source.indexOf('<style>'), source.indexOf('</style>'));

		// act
		const rawColours = styleBlock
			.split('\n')
			.filter((line) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(line));

		// assume — docs/DESIGN.md: scrim, surface and shadow colours are theme tokens, never
		// hard-coded, "because a dark scrim on a dark page is invisible". This component is the one
		// place where that mistake is easy to make, so it is asserted rather than remembered.
		expect(rawColours).toEqual([]);
	});
});
