import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Identifiers of the application passalong replaces. They may appear where the repository records
 * provenance (design reference, icon source, a sample of a foreign hash format), but they must not
 * reach the product: not into the shipped copy, not into a route, not into the exchange contract.
 */
const sourceProductIdentifiers = [/marktbude/i, /flohmarkt\.tilloh\.dev/i];

/**
 * The only places allowed to name the source product, each for a documented reason.
 */
const provenanceAllowlist = [
	'app.css',
	'lib/assets/ICONS.md',
	'lib/server/imported-password.test.ts',
	'lib/server/product-identity.test.ts'
];

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const srcRoot = join(repositoryRoot, 'src');

/**
 * Collect every file below a directory.
 *
 * @param {string} directory - Directory to walk.
 * @returns {string[]} Absolute file paths.
 */
function walk(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

/**
 * List the source files that carry a source-product identifier.
 *
 * @returns {string[]} Repository-relative paths below `src`, sorted.
 */
function filesNamingTheSourceProduct(): string[] {
	return walk(srcRoot)
		.filter((path) => {
			const content = readFileSync(path, 'utf8');
			return sourceProductIdentifiers.some((pattern) => pattern.test(content));
		})
		.map((path) => relative(srcRoot, path).split('\\').join('/'))
		.sort();
}

describe('product identity', () => {
	it('names the source product only in documented provenance notes', () => {
		// act
		const namingFiles = filesNamingTheSourceProduct();

		// assume — a new occurrence inside product code fails this list, not a comment somewhere
		expect(namingFiles).toEqual(provenanceAllowlist);
	});

	it('keeps the source product out of the exchange contract and importer', () => {
		// arrange — the generic format must not branch on the tool that produced an archive
		const contractFiles = [
			'lib/server/exchange-format.ts',
			'lib/server/instance-import.ts',
			'lib/server/account-transfer.ts'
		];

		// act
		const findings = contractFiles.filter((path) =>
			sourceProductIdentifiers.some((pattern) =>
				pattern.test(readFileSync(join(srcRoot, path), 'utf8'))
			)
		);

		// assume
		expect(findings).toEqual([]);
	});
});
