/**
 * Client-side favorites ("Merkliste") for one public stand page.
 *
 * Favorites live entirely in the buyer's browser: no account, no server
 * roundtrip. Each stand page scopes its own list under a dedicated
 * localStorage key. Sold items disappear from the public view, so IDs
 * that are no longer rendered are pruned on initialization.
 */

import { SvelteSet } from 'svelte/reactivity';

const favoritesKeyPrefix = 'passalong-favorites-';

/**
 * Build the storage key for one collection.
 *
 * @param {string} collectionId - Public collection identifier.
 * @returns {string} localStorage key for this stand page.
 */
function storageKeyFor(collectionId: string): string {
	return `${favoritesKeyPrefix}${collectionId}`;
}

/**
 * Read the favorite item IDs of one stand page.
 *
 * @param {string} collectionId - Public collection identifier.
 * @returns {string[]} Stored item IDs in insertion order.
 */
export function getFavorites(collectionId: string): string[] {
	if (typeof window === 'undefined') {
		return [];
	}
	try {
		const raw = window.localStorage.getItem(storageKeyFor(collectionId));
		if (!raw) {
			return [];
		}
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return [];
		}
		return parsed.filter((entry): entry is string => typeof entry === 'string');
	} catch {
		// A corrupt entry must never break the stand page; start fresh.
		return [];
	}
}

/**
 * Persist the favorite item IDs of one stand page.
 *
 * @param {string} collectionId - Public collection identifier.
 * @param {string[]} itemIds - Item IDs in insertion order.
 * @returns {void}
 */
function writeFavorites(collectionId: string, itemIds: string[]): void {
	if (typeof window === 'undefined') {
		return;
	}
	if (itemIds.length === 0) {
		window.localStorage.removeItem(storageKeyFor(collectionId));
		return;
	}
	window.localStorage.setItem(storageKeyFor(collectionId), JSON.stringify(itemIds));
}

/**
 * Toggle one item in the favorites list and persist the result.
 *
 * @param {string} collectionId - Public collection identifier.
 * @param {string} itemId - Public item identifier.
 * @returns {boolean} True when the item is now a favorite.
 */
export function toggleFavorite(collectionId: string, itemId: string): boolean {
	const favorites = getFavorites(collectionId);
	const index = favorites.indexOf(itemId);
	if (index >= 0) {
		favorites.splice(index, 1);
	} else {
		favorites.push(itemId);
	}
	writeFavorites(collectionId, favorites);
	return index < 0;
}

/**
 * Drop stored IDs that are no longer rendered on the stand page.
 *
 * Sold items disappear from the public view; their stale IDs must not
 * accumulate in the visitor's storage.
 *
 * @param {string} collectionId - Public collection identifier.
 * @param {string[]} visibleItemIds - Item IDs currently rendered server-side.
 * @returns {string[]} The pruned favorites list after persistence.
 */
export function pruneFavorites(collectionId: string, visibleItemIds: string[]): string[] {
	const visible = new SvelteSet(visibleItemIds);
	const favorites = getFavorites(collectionId).filter((itemId) => visible.has(itemId));
	writeFavorites(collectionId, favorites);
	return favorites;
}
