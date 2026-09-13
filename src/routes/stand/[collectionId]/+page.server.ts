import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCollectionRepository } from '$lib/server/repository';
import {
	emptyItemFilters,
	itemCategories,
	itemConditions,
	type ItemFilters,
	type ItemCategory,
	type ItemCondition,
	type ItemStatusFilter
} from '$lib/server/collection-repository';

const httpStatusNotFound = 404;

const itemStatusFilters: ItemStatusFilter[] = ['open', 'reserved'];

/**
 * Parse public stand filter values from the URL search parameters.
 *
 * Unknown or malformed values are ignored so the page still renders with the
 * remaining filters and never fails on hand-edited URLs. Unlike the owner
 * portfolio, 'sold' is not a public status: sold items are never listed.
 *
 * @param {URLSearchParams} searchParams - The current request search parameters.
 * @returns {ItemFilters} Normalized active filters (query trims blank to null).
 */
function parseItemFilters(searchParams: URLSearchParams): ItemFilters {
	const query = searchParams.get('q')?.trim() || null;
	const categoryParam = searchParams.get('category');
	const conditionParam = searchParams.get('condition');
	const statusParam = searchParams.get('status');
	const category =
		categoryParam && (itemCategories as readonly string[]).includes(categoryParam)
			? (categoryParam as ItemCategory)
			: null;
	const condition =
		conditionParam && (itemConditions as readonly string[]).includes(conditionParam)
			? (conditionParam as ItemCondition)
			: null;
	const status =
		statusParam && (itemStatusFilters as readonly string[]).includes(statusParam)
			? (statusParam as ItemStatusFilter)
			: null;
	return { ...emptyItemFilters, query, category, condition, status };
}

/**
 * Determine whether at least one public stand filter is active.
 *
 * @param {ItemFilters} filters - The parsed filter state.
 * @returns {boolean} True when any filter restricts the item list.
 */
function hasActiveFilters(filters: ItemFilters): boolean {
	return Boolean(filters.query || filters.category || filters.condition || filters.status);
}

/**
 * Load the reduced public stand view for one collection, honoring the
 * buyer-facing search and filter parameters.
 *
 * @param {Parameters<import('./$types').PageServerLoad>[0]['params']} params - Route parameters.
 * @param {URLSearchParams} searchParams - Buyer filters from the URL.
 * @returns {{ stand: PublicStandView; appliedFilters: ItemFilters; hasActiveFilters: boolean }} Public stand data.
 * @throws {Error} 404 when the collection does not exist.
 */
export const load: PageServerLoad = ({ params, url }) => {
	const repository = getCollectionRepository();
	const standView = repository.getPublicStandView(params.collectionId);
	if (!standView) {
		throw error(httpStatusNotFound, 'Standseite nicht gefunden');
	}
	const appliedFilters = parseItemFilters(url.searchParams);
	const items = hasActiveFilters(appliedFilters)
		? repository.searchPublicStandItems(params.collectionId, appliedFilters)
		: standView.items;
	return {
		stand: { ...standView, items },
		appliedFilters,
		hasActiveFilters: hasActiveFilters(appliedFilters),
		categoryOptions: itemCategories,
		conditionOptions: itemConditions
	};
};
