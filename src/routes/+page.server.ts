import { fail, redirect } from '@sveltejs/kit';
import { itemCategories, itemConditions, type ItemCategory, type ItemCondition } from '$lib/server/collection-repository';
import { getCollectionRepository } from '$lib/server/repository';
import type { Actions, PageServerLoad } from './$types';

/**
 * Load the selected collection and its items from the persistent repository.
 *
 * @param {Parameters<PageServerLoad>[0]} event - The SvelteKit load event.
 * @returns {ReturnType<PageServerLoad>} Collection data for the page.
 */
export const load: PageServerLoad = ({ url }) => {
	const repository = getCollectionRepository();
	const collectionId = url.searchParams.get('collection');
	const collection = collectionId ? repository.getCollection(collectionId) : null;

	return {
		collection,
		items: collection ? repository.listItems(collection.id) : [],
		categoryOptions: itemCategories,
		conditionOptions: itemConditions
	};
};

export const actions: Actions = {
	createCollection: async ({ request }) => {
		const formData = await request.formData();
		const repository = getCollectionRepository();

		let collection;
		try {
			collection = repository.createCollection({
				ownerName: getFormText(formData, 'ownerName'),
				name: getFormText(formData, 'collectionName')
			});
		} catch (error) {
			return fail(400, { createCollectionError: getErrorMessage(error) });
		}

		redirect(303, `/?collection=${encodeURIComponent(collection.id)}`);
	},

	addItem: async ({ request }) => {
		const formData = await request.formData();
		const repository = getCollectionRepository();
		const collectionId = getFormText(formData, 'collectionId');
		if (!repository.getCollection(collectionId)) {
			return fail(404, { addItemError: 'Die Sammlung wurde nicht gefunden.' });
		}

		try {
			repository.createItem({
				collectionId,
				title: getFormText(formData, 'title'),
				priceCents: Number(getFormText(formData, 'priceCents')),
				category: getFormText(formData, 'category') as ItemCategory,
				condition: getFormText(formData, 'condition') as ItemCondition,
				internalNotes: getFormText(formData, 'internalNotes')
			});
		} catch (error) {
			return fail(400, { addItemError: getErrorMessage(error) });
		}

		redirect(303, `/?collection=${encodeURIComponent(collectionId)}`);
	}
};

/**
 * Read a string value from form data and normalize absent values to an empty string.
 *
 * @param {FormData} formData - Submitted form values.
 * @param {string} name - The requested field name.
 * @returns {string} The field value.
 */
function getFormText(formData: FormData, name: string): string {
	const value = formData.get(name);
	return typeof value === 'string' ? value : '';
}

/**
 * Convert an unknown thrown value into a safe user-facing error message.
 *
 * @param {unknown} error - The thrown value.
 * @returns {string} A safe validation message.
 */
function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Die Eingabe konnte nicht gespeichert werden.';
}
