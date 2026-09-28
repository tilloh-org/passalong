#!/usr/bin/env node
/**
 * Regenerate the inline Tabler icon sprite in `src/app.html`.
 *
 * Source of truth for which icons ship is `src/lib/icons.ts` (the typed
 * registry) — the script parses that list so the sprite and the type contract
 * can never drift apart. Symbol geometry comes from the vendored sprite
 * `src/lib/assets/tabler-sprite.svg`; symbols the vendored copy does not carry
 * are read from `src/lib/assets/tabler-extra/`.
 *
 * Usage: node scripts/build-icon-sprite.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const registryPath = resolve(root, 'src/lib/icons.ts');
const spritePath = resolve(root, 'src/lib/assets/tabler-sprite.svg');
const extraDir = resolve(root, 'src/lib/assets/tabler-extra');
const appHtmlPath = resolve(root, 'src/app.html');

/** The 24x24 transparent backing path every Tabler icon carries; noise in a sprite. */
const backingPath = /<path\s+stroke="none"\s+d="M0 0h24v24H0z"\s+fill="none"\s*\/>/g;

/**
 * Read the ordered icon registry from the TypeScript source.
 *
 * @returns {string[]} Icon names in registry order.
 */
function readRegistry() {
	const source = readFileSync(registryPath, 'utf8');
	const list = source.match(/export const iconNames = \[([\s\S]*?)\] as const;/);
	if (!list) {
		throw new Error('Could not read iconNames from src/lib/icons.ts');
	}
	return [...list[1].matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);
}

/**
 * Normalise a Tabler icon body into the inner markup of a sprite symbol.
 *
 * @param {string} body - Inner markup of a Tabler `<svg>`.
 * @returns {string} Trimmed markup without the backing path.
 */
function normaliseBody(body) {
	return body
		.replace(backingPath, '')
		.replace(/\n\s*\n/g, '\n')
		.trim();
}

const names = readRegistry();
const sprite = readFileSync(spritePath, 'utf8');

/** @type {Map<string, string>} */
const symbols = new Map();
for (const match of sprite.matchAll(/<symbol id="i-([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/symbol>/g)) {
	symbols.set(match[1], normaliseBody(match[2]));
}

const missing = [];
for (const name of names) {
	if (symbols.has(name)) {
		continue;
	}
	let svg;
	try {
		svg = readFileSync(resolve(extraDir, `${name}.svg`), 'utf8');
	} catch {
		missing.push(name);
		continue;
	}
	const isFilled = /fill="currentColor"/.test(svg);
	const body = svg
		.replace(/^[\s\S]*?<svg[^>]*>/, '')
		.replace(/<\/svg>[\s\S]*$/, '')
		.trim();
	// Filled variants set the fill on the symbol root so it beats the inherited
	// `fill: none` of the global `.icon` class.
	const attributes = isFilled ? ' fill="currentColor" stroke="none"' : '';
	symbols.set(name, { body: normaliseBody(body), attributes });
}

if (missing.length > 0) {
	throw new Error(`No icon source for: ${missing.join(', ')}`);
}

const markup = names
	.map((name) => {
		const entry = symbols.get(name);
		const body = typeof entry === 'string' ? entry : entry.body;
		const attributes = typeof entry === 'string' ? '' : entry.attributes;
		return `\t\t\t\t<symbol id="i-${name}" viewBox="0 0 24 24"${attributes}>${body}</symbol>`;
	})
	.join('\n');

const appHtml = readFileSync(appHtmlPath, 'utf8');
const startMarker =
	'\t\t<svg xmlns="http://www.w3.org/2000/svg" style="display: none" aria-hidden="true">';
const endMarker = '\t\t</svg>';
const start = appHtml.indexOf(startMarker);
const end = appHtml.indexOf(endMarker, start);
if (start === -1 || end === -1) {
	throw new Error('Icon sprite markers not found in src/app.html');
}

const replacement = `${startMarker}\n\t\t\t<defs>\n${markup}\n\t\t\t</defs>\n${endMarker}`;
const next = appHtml.slice(0, start) + replacement + appHtml.slice(end + endMarker.length);
writeFileSync(appHtmlPath, next);
console.log(`Wrote ${names.length} symbols into src/app.html`);
