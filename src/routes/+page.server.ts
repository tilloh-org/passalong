import { timingSafeEqual } from 'node:crypto';
import { fail, redirect } from '@sveltejs/kit';
import { itemCategories, itemConditions, type ItemCategory, type ItemCondition } from '$lib/server/collection-repository';
import { getCollectionRepository } from '$lib/server/repository';
import { createSessionToken, hashSessionToken } from '$lib/server/session-token';
import type { Actions, PageServerLoad } from './$types';

const sessionCookieName = 'passalong_session';

/**
 * Load only the collection owned by the authenticated session.
 *
 * @param {Parameters<PageServerLoad>[0]} event - The SvelteKit load event.
 * @returns {ReturnType<PageServerLoad>} Tenant-scoped page data.
 */
export const load: PageServerLoad = ({ cookies, url }) => {
	const repository = getCollectionRepository();
	const scope = getSessionScope(cookies.get(sessionCookieName));
	const collectionId = url.searchParams.get('collection');
	const collection = scope && collectionId ? repository.getCollectionForOwner(collectionId, scope) : null;

	return {
		collection,
		items: collection && scope ? repository.listItemsForOwner(collection.id, scope) : [],
		categoryOptions: itemCategories,
		conditionOptions: itemConditions,
		isAuthenticated: Boolean(scope)
	};
};

export const actions: Actions = {
	createCollection: async ({ cookies, request }) => {
		const formData = await request.formData();
		if (!isValidAccessToken(getFormText(formData, 'accessToken'))) {
			return fail(403, { createCollectionError: 'Der Zugangs-Code ist ungültig.' });
		}

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

		setSessionCookie(cookies, collection.id);
		redirect(303, `/?collection=${encodeURIComponent(collection.id)}`);
	},

	addItem: async ({ cookies, request }) => {
		const formData = await request.formData();
		const repository = getCollectionRepository();
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(401, { addItemError: 'Deine Sitzung ist abgelaufen. Bitte richte den Zugang erneut ein.' });
		}

		const collectionId = getFormText(formData, 'collectionId');
		if (!repository.getCollectionForOwner(collectionId, scope)) {
			return fail(404, { addItemError: 'Die Sammlung wurde nicht gefunden.' });
		}

		try {
			repository.createItem({
				collectionId,
				title: getFormText(formData, 'title'),
				priceCents: getPriceCents(formData),
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
 * Parse the required non-negative integer price submitted by the item form.
 *
 * @param {FormData} formData - Submitted form values.
 * @returns {number} The price in euro cents.
 * @throws {Error} When the submitted price is missing or invalid.
 */
function getPriceCents(formData: FormData): number {
	const value = getFormText(formData, 'priceCents').trim();
	if (!/^\d+$/.test(value)) {
		throw new Error('Bitte gib einen Preis in Cent als ganze Zahl ein.');
	}
	const priceCents = Number(value);
	if (!Number.isSafeInteger(priceCents) || priceCents > 10_000_000) {
		throw new Error('Der Preis liegt außerhalb des erlaubten Bereichs.');
	}
	return priceCents;
}

/**
 * Resolve a cookie token to an active tenant/user scope.
 *
 * @param {string | undefined} token - Raw session cookie value.
 * @returns {ReturnType<ReturnType<typeof getCollectionRepository>['getSession']>} Active scope or null.
 */
function getSessionScope(token: string | undefined) {
	return token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
}

/**
 * Validate the bootstrap token without exposing its value through timing differences.
 *
 * @param {string} suppliedToken - Untrusted submitted token.
 * @returns {boolean} Whether the configured access token matches.
 */
function isValidAccessToken(suppliedToken: string): boolean {
	const configuredToken = process.env.PASSALONG_SETUP_TOKEN;
	if (!configuredToken) {
		return false;
	}
	const supplied = Buffer.from(suppliedToken);
	const configured = Buffer.from(configuredToken);
	return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

/**
 * Persist a server-side session and set the hardened browser cookie.
 *
 * @param {Parameters<Actions['createCollection']>[0]['cookies']} cookies - SvelteKit cookie helper.
 * @param {string} collectionId - Collection whose owner receives the session.
 * @returns {void}
 */
function setSessionCookie(cookies: Parameters<Actions['createCollection']>[0]['cookies'], collectionId: string): void {
	const token = createSessionToken();
	getCollectionRepository().createSessionForCollection(collectionId, hashSessionToken(token));
	cookies.set(sessionCookieName, token, {
		httpOnly: true,
		path: '/',
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: 60 * 60 * 24 * 30
	});
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
