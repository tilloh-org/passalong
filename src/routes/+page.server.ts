import { fail, redirect, type Cookies } from '@sveltejs/kit';
import {
	itemCategories,
	itemConditions,
	type ItemCategory,
	type ItemCondition,
	type SessionScope
} from '$lib/server/collection-repository';
import { hashPassword, verifyPassword } from '$lib/server/password';
import { getCollectionRepository } from '$lib/server/repository';
import { createSessionToken, hashSessionToken } from '$lib/server/session-token';
import type { Actions, PageServerLoad } from './$types';

const sessionCookieName = 'passalong_session';

/**
 * Load account-aware and tenant-scoped collection data.
 *
 * @param {Parameters<PageServerLoad>[0]} event - The SvelteKit load event.
 * @returns {ReturnType<PageServerLoad>} Tenant-scoped page data.
 */
export const load: PageServerLoad = ({ cookies, url }) => {
	const repository = getCollectionRepository();
	const scope = getSessionScope(cookies.get(sessionCookieName));
	const collections = scope ? repository.listCollectionsForOwner(scope) : [];
	const requestedCollectionId = url.searchParams.get('collection');
	const collectionId = requestedCollectionId ?? collections[0]?.id;
	const collection = scope && collectionId ? repository.getCollectionForOwner(collectionId, scope) : null;

	return {
		collection,
		collections,
		items: collection && scope ? repository.listItemsForOwner(collection.id, scope) : [],
		categoryOptions: itemCategories,
		conditionOptions: itemConditions,
		isAuthenticated: Boolean(scope),
		isInitialSetup: !repository.hasAdminAccount()
	};
};

export const actions: Actions = {
	register: async ({ cookies, request }) => {
		const repository = getCollectionRepository();
		if (repository.hasAdminAccount()) {
			return fail(409, { registerError: 'Der erste Zugang wurde bereits erstellt. Bitte melde dich an.' });
		}

		const formData = await request.formData();
		const password = getFormText(formData, 'password');
		try {
			validatePassword(password);
			const admin = repository.createInitialAdmin({
				username: getFormText(formData, 'username'),
				displayName: getFormText(formData, 'displayName'),
				passwordHash: await hashPassword(password)
			});
			setSessionCookie(cookies, admin);
		} catch (error) {
			return fail(400, { registerError: getErrorMessage(error) });
		}

		redirect(303, '/');
	},

	login: async ({ cookies, request }) => {
		const formData = await request.formData();
		let user;
		try {
			user = getCollectionRepository().getUserForLogin(getFormText(formData, 'username'));
		} catch {
			return fail(401, { loginError: 'Benutzername oder Passwort ist nicht korrekt.' });
		}
		if (!user || !(await verifyPassword(getFormText(formData, 'password'), user.passwordHash))) {
			return fail(401, { loginError: 'Benutzername oder Passwort ist nicht korrekt.' });
		}

		setSessionCookie(cookies, user);
		redirect(303, '/');
	},

	logout: ({ cookies }) => {
		cookies.delete(sessionCookieName, { path: '/' });
		redirect(303, '/');
	},

	createCollection: async ({ cookies, request }) => {
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(401, { createCollectionError: 'Bitte melde dich zuerst an.' });
		}

		const formData = await request.formData();
		let collection;
		try {
			collection = getCollectionRepository().createCollection(
				{ name: getFormText(formData, 'collectionName') },
				scope
			);
		} catch (error) {
			return fail(400, { createCollectionError: getErrorMessage(error) });
		}

		redirect(303, `/?collection=${encodeURIComponent(collection.id)}`);
	},

	addItem: async ({ cookies, request }) => {
		const formData = await request.formData();
		const repository = getCollectionRepository();
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(401, { addItemError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}

		const collectionId = getFormText(formData, 'collectionId');
		if (!repository.getCollectionForOwner(collectionId, scope)) {
			return fail(404, { addItemError: 'Die Sammlung wurde nicht gefunden.' });
		}

		try {
			repository.createItem(
				{
					collectionId,
					title: getFormText(formData, 'title'),
					priceCents: getPriceCents(formData),
					category: getFormText(formData, 'category') as ItemCategory,
					condition: getFormText(formData, 'condition') as ItemCondition,
					internalNotes: getFormText(formData, 'internalNotes')
				},
				scope
			);
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
 * Reject passwords that are too short or expensive to process safely.
 *
 * @param {string} password - The submitted plaintext password.
 * @returns {void}
 * @throws {Error} If the password does not meet the policy.
 */
function validatePassword(password: string): void {
	if (password.length < 12 || password.length > 128) {
		throw new Error('Das Passwort muss 12 bis 128 Zeichen lang sein.');
	}
}

/**
 * Resolve a cookie token to an active tenant/user scope.
 *
 * @param {string | undefined} token - Raw session cookie value.
 * @returns {SessionScope | null} Active scope or null.
 */
function getSessionScope(token: string | undefined): SessionScope | null {
	return token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
}

/**
 * Persist a server-side session hash and set the hardened browser cookie.
 *
 * @param {Cookies} cookies - SvelteKit cookie helper.
 * @param {SessionScope} scope - Authenticated user and tenant scope.
 * @returns {void}
 */
function setSessionCookie(cookies: Cookies, scope: SessionScope): void {
	const token = createSessionToken();
	getCollectionRepository().createSessionForUser(scope, hashSessionToken(token));
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
