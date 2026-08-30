import { parseBootstrapConfiguration, provisionBootstrapConfiguration } from './bootstrap';
import type { CollectionRepository } from './collection-repository';

/**
 * Parse and provision the bootstrap manifest after schema migration and before request handling.
 *
 * @param {CollectionRepository} repository - Repository whose constructor has completed migrations.
 * @param {string | undefined} bootstrapValue - Raw PASSALONG_BOOTSTRAP environment value.
 * @returns {Promise<void>} A promise that resolves only after provisioning commits.
 */
export async function initializeRepository(
	repository: CollectionRepository,
	bootstrapValue: string | undefined
): Promise<void> {
	await provisionBootstrapConfiguration(repository, parseBootstrapConfiguration(bootstrapValue));
}
