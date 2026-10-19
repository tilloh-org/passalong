import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shellPath = 'src/lib/components/dialog-shell.svelte';
const appCssPath = 'src/app.css';
const designPath = 'docs/DESIGN.md';

const shellSource = readFileSync(shellPath, 'utf8');
const appCss = readFileSync(appCssPath, 'utf8');
const design = readFileSync(designPath, 'utf8');

/**
 * Extract the contents of the component's `<style>` block.
 *
 * @returns {string} The stylesheet text without the surrounding tags.
 */
function styleBlock() {
	return shellSource.slice(shellSource.indexOf('<style>'), shellSource.indexOf('</style>'));
}

describe('dialog shell', () => {
	it('declares both dialog variants', () => {
		// arrange — the component is the single place that owns dialog chrome
		const markup = shellSource.slice(0, shellSource.indexOf('<style>'));

		// act
		const variantProp = /variant\s*=\s*'modal'/.test(markup);
		const fullscreenVariant = /'fullscreen'/.test(markup);

		// assume
		expect(variantProp).toBe(true);
		expect(fullscreenVariant).toBe(true);
	});

	it('spaces its internals with the shared dialog tokens, never with ad-hoc values', () => {
		// arrange
		const style = styleBlock();

		// act — the three rhythm tokens are referenced
		const usedTokens = ['--gap-dialog-head', '--gap-dialog-block', '--gap-dialog-field'].filter(
			(token) => style.includes(token)
		);

		// assume
		expect(usedTokens).toHaveLength(3);
	});

	it('hard-codes no colour, so both themes keep working', () => {
		// arrange
		const style = styleBlock();

		// act
		const rawColours = style.split('\n').filter((line) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(line));

		// assume
		expect(rawColours).toEqual([]);
	});

	it('uses only colour tokens that the theme actually defines', () => {
		// arrange — a made-up token name with a fallback is a hard-coded colour in disguise
		const usedNames = [...styleBlock().matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
		const definedNames = new Set([...appCss.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

		// act
		const undefinedNames = [...new Set(usedNames)].filter((name) => !definedNames.has(name));

		// assume
		expect(undefinedNames).toEqual([]);
	});

	it('keeps the close control reachable and labelled', () => {
		// arrange
		const markup = shellSource.slice(0, shellSource.indexOf('<style>'));

		// act — a close button exists and carries the translated label
		const hasCloseButton = /onclick=\{\(\) => dialog\?\.close\(\)\}/.test(markup);
		const usesTranslation = /t\(/.test(markup);

		// assume
		expect(hasCloseButton).toBe(true);
		expect(usesTranslation).toBe(true);
	});

	it('exposes open and close for its callers', () => {
		// arrange
		const markup = shellSource.slice(0, shellSource.indexOf('<style>'));

		// act
		const exportsOpen = /export function open\(/.test(markup);
		const exportsClose = /export function close\(/.test(markup);

		// assume
		expect(exportsOpen).toBe(true);
		expect(exportsClose).toBe(true);
	});

	it('is documented as the binding rule in DESIGN.md', () => {
		// arrange — the doc must name the component, or the next screen re-declares the chrome
		const mentionsComponent = design.includes('dialog-shell.svelte');
		const mentionsSpacingTokens =
			design.includes('--gap-dialog-head') && design.includes('--gap-dialog-block');

		// assume
		expect(mentionsComponent).toBe(true);
		expect(mentionsSpacingTokens).toBe(true);
	});
});
