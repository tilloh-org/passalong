import { getCollectionRepository } from '$lib/server/repository';

/**
 * Complete database migration before accepting application requests.
 *
 * Instantiating the repository runs the additive schema migrations, so the first request already
 * sees the current schema. Accounts are created through the application: the first browser
 * registration becomes the instance administrator.
 *
 * @returns {Promise<void>} A promise that resolves when startup initialization has completed.
 */
export async function init(): Promise<void> {
	getCollectionRepository();
}
