import { getCollectionRepository } from '$lib/server/repository';
import { initializeRepository } from '$lib/server/startup';

/**
 * Complete database migration and bootstrap provisioning before accepting application requests.
 *
 * @returns {Promise<void>} A promise that resolves when startup initialization has completed.
 */
export async function init(): Promise<void> {
	await initializeRepository(getCollectionRepository(), process.env.PASSALONG_BOOTSTRAP);
}
