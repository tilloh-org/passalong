import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCollectionRepository } from '$lib/server/repository';

const httpStatusNotFound = 404;

/**
 * Load the reduced public stand view for one collection.
 *
 * @param {Parameters<import('./$types').PageServerLoad>[0]['params']} params - Route parameters.
 * @returns {Promise<{ stand: PublicStandView }>} Public stand data.
 * @throws {Error} 404 when the collection does not exist.
 */
export const load: PageServerLoad = async ({ params }) => {
	const standView = getCollectionRepository().getPublicStandView(params.collectionId);
	if (!standView) {
		throw error(httpStatusNotFound, 'Standseite nicht gefunden');
	}
	return { stand: standView };
};
