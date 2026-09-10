// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getFavorites, pruneFavorites, toggleFavorite } from './stand-favorites.svelte';

const collectionId = 'collection-1';

describe('stand favorites', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	afterEach(() => {
		window.localStorage.clear();
	});

	it('starts with an empty list when nothing is stored', () => {
		// assume
		expect(getFavorites(collectionId)).toEqual([]);
	});

	it('scopes favorites per collection', () => {
		// act
		toggleFavorite(collectionId, 'item-1');
		toggleFavorite('collection-2', 'item-9');

		// assume
		expect(getFavorites(collectionId)).toEqual(['item-1']);
		expect(getFavorites('collection-2')).toEqual(['item-9']);
	});

	it('adds an item on the first toggle and persists it', () => {
		// act
		const nowFavorite = toggleFavorite(collectionId, 'item-1');

		// assume
		expect(nowFavorite).toBe(true);
		expect(getFavorites(collectionId)).toEqual(['item-1']);
	});

	it('removes an item on the second toggle', () => {
		// arrange
		toggleFavorite(collectionId, 'item-1');

		// act
		const stillFavorite = toggleFavorite(collectionId, 'item-1');

		// assume
		expect(stillFavorite).toBe(false);
		expect(getFavorites(collectionId)).toEqual([]);
	});

	it('prunes stored IDs that are no longer visible on the stand page', () => {
		// arrange
		toggleFavorite(collectionId, 'item-1');
		toggleFavorite(collectionId, 'item-2');
		toggleFavorite(collectionId, 'item-3');

		// act — item-2 was sold and is no longer rendered
		const pruned = pruneFavorites(collectionId, ['item-1', 'item-3']);

		// assume
		expect(pruned).toEqual(['item-1', 'item-3']);
		expect(getFavorites(collectionId)).toEqual(['item-1', 'item-3']);
	});

	it('removes the storage key entirely when the last favorite is pruned', () => {
		// arrange
		toggleFavorite(collectionId, 'item-1');

		// act
		pruneFavorites(collectionId, []);

		// assume
		expect(getFavorites(collectionId)).toEqual([]);
		expect(window.localStorage.getItem(`passalong-favorites-${collectionId}`)).toBeNull();
	});

	it('recovers from a corrupt storage entry by starting fresh', () => {
		// arrange
		window.localStorage.setItem(`passalong-favorites-${collectionId}`, 'not-json{');

		// act
		const favorites = getFavorites(collectionId);

		// assume
		expect(favorites).toEqual([]);
	});
});