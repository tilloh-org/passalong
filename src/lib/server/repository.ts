import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createCollectionRepository, type CollectionRepository } from './collection-repository';

let repository: CollectionRepository | undefined;

/**
 * Get the process-wide repository backed by the configured persistent SQLite database.
 *
 * @returns {CollectionRepository} The core collection repository.
 */
export function getCollectionRepository(): CollectionRepository {
	if (!repository) {
		const databasePath = process.env.PASSALONG_DATABASE_PATH ?? join(process.cwd(), 'data', 'passalong.sqlite');
		mkdirSync(dirname(databasePath), { recursive: true });
		repository = createCollectionRepository({ databasePath });
	}
	return repository;
}
