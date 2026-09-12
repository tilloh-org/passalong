import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCollectionRepository } from '$lib/server/repository';

const httpStatusNotFound = 404;

/**
 * Load the reduced public stand item view for one collection item.
 *
 * @param {Parameters<import('./$types').PageServerLoad>[0]['params']} params - Route parameters.
 * @returns {Promise<{ standCollectionId: string; item: PublicStandItem; collectionName: string }>} Public item data.
 * @throws {Error} 404 when the collection or the item does not exist.
 */
export const load: PageServerLoad = async ({ params }) => {
	const repository = getCollectionRepository();
	const standView = repository.getPublicStandView(params.collectionId);
	const item = standView ? repository.getPublicStandItem(params.collectionId, params.itemId) : null;
	if (!standView || !item) {
		throw error(httpStatusNotFound, 'Artikel nicht gefunden');
	}
	return {
		standCollectionId: standView.collectionId,
		collectionName: standView.collectionName,
		item
	};
};
