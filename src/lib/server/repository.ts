import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createCollectionRepository, type CollectionRepository } from './collection-repository';

let repository: CollectionRepository | undefined;
let databasePath: string | undefined;

/**
 * Get the process-wide repository backed by the configured persistent SQLite database.
 *
 * @returns {CollectionRepository} The core collection repository.
 */
export function getCollectionRepository(): CollectionRepository {
	if (!repository) {
		const resolvedPath =
			process.env.PASSALONG_DATABASE_PATH ?? join(process.cwd(), 'data', 'passalong.sqlite');
		databasePath = resolvedPath;
		mkdirSync(dirname(resolvedPath), { recursive: true });
		repository = createCollectionRepository({ databasePath: resolvedPath });
	}
	return repository;
}

/**
 * Get the configured SQLite database file path.
 *
 * @returns {string} Absolute database path.
 */
export function getDatabasePath(): string {
	if (!databasePath) {
		databasePath =
			process.env.PASSALONG_DATABASE_PATH ?? join(process.cwd(), 'data', 'passalong.sqlite');
	}
	return databasePath;
}

/**
 * Drop the process-wide repository so the next request opens the database file again.
 *
 * A restore replaces the database file while the process keeps a handle on the previous one; the
 * running instance would keep serving the old data. Closing the handle and re-creating the
 * repository on the next call is what makes the restored database the live one.
 *
 * @returns {void}
 */
export function reloadCollectionRepository(): void {
	if (!repository) {
		return;
	}
	repository.close();
	repository = undefined;
}
