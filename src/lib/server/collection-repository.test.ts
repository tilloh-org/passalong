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

	it('keeps items isolated to their collection', () => {
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const firstCollection = repository.createCollection({ ownerName: 'Avery', name: 'Books' });
		const secondCollection = repository.createCollection({ ownerName: 'Blake', name: 'Tools' });

		repository.createItem({
			collectionId: firstCollection.id,
			title: 'Novel',
			priceCents: 400,
			category: 'books',
			condition: 'good',
			internalNotes: ''
		});
		repository.createItem({
			collectionId: secondCollection.id,
			title: 'Hammer',
			priceCents: 900,
			category: 'tools',
			condition: 'fair',
			internalNotes: ''
		});

		expect(repository.listItems(firstCollection.id).map((item) => item.title)).toEqual(['Novel']);
		expect(repository.listItems(secondCollection.id).map((item) => item.title)).toEqual(['Hammer']);
	});

	it('rejects an item for an unknown collection', () => {
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });

		expect(() =>
			repository.createItem({
				collectionId: 'missing-collection',
				title: 'Orphaned item',
				priceCents: 100,
				category: 'other',
				condition: 'good',
				internalNotes: ''
			})
		).toThrow();
	});
});
