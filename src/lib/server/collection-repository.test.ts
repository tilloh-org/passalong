import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCollectionRepository } from './collection-repository';

const temporaryDirectories: string[] = [];

/**
 * Create an isolated SQLite database path for a repository test.
 *
 * @returns {string} The temporary database file path.
 */
function createDatabasePath(): string {
	const directory = mkdtempSync(join(tmpdir(), 'passalong-collection-'));
	temporaryDirectories.push(directory);
	return join(directory, 'passalong.sqlite');
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe('collection repository', () => {
	it('persists an item in its own collection', () => {
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const collection = repository.createCollection({
			ownerName: 'Avery',
			name: 'Living room clear-out'
		});

		const item = repository.createItem({
			collectionId: collection.id,
			title: 'Reading lamp',
			priceCents: 1200,
			category: 'home',
			condition: 'good',
			internalNotes: 'Replace the bulb before listing.'
		});

		expect(repository.listItems(collection.id)).toEqual([
			expect.objectContaining({
				id: item.id,
				title: 'Reading lamp',
				priceCents: 1200,
				category: 'home',
				condition: 'good',
				internalNotes: 'Replace the bulb before listing.'
			})
		]);
	});
});
