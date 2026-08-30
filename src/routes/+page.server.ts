import { fail, redirect, type Cookies } from '@sveltejs/kit';
import {
	itemCategories,
	itemConditions,
	type ItemCategory,
	type ItemCondition,
	type SessionScope
} from '$lib/server/collection-repository';
import { hasSameOrigin } from '$lib/server/csrf';
import { hashPassword, needsPasswordRehash, validatePassword, verifyPassword } from '$lib/server/password';
import { getCollectionRepository } from '$lib/server/repository';
import { createSessionToken, hashSessionToken } from '$lib/server/session-token';
import type { Actions, PageServerLoad } from './$types';

const sessionCookieName = 'passalong_session';
const csrfError = 'Diese Anfrage konnte nicht sicher verarbeitet werden.';
const invalidCredentialsError = 'Benutzername oder Passwort ist nicht korrekt.';

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
		isInitialSetup: !repository.hasAccounts()
	};
};

export const actions: Actions = {
	register: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(403, { csrfError });
		}
		const repository = getCollectionRepository();
		if (repository.hasAccounts()) {
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
			setSessionCookie(cookies, admin, url);
		} catch (error) {
			return fail(400, { registerError: getErrorMessage(error) });
		}

		redirect(303, '/');
	},

	login: async ({ cookies, getClientAddress, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(403, { csrfError });
		}
		const formData = await request.formData();
		const username = getFormText(formData, 'username');
		const password = getFormText(formData, 'password');
		const repository = getCollectionRepository();
		const requestIp = getClientAddress();
		try {
			const rateLimit = repository.getLoginAttemptStatus(username, requestIp);
			if (rateLimit.blocked) {
				return fail(429, { loginError: `Zu viele Anmeldeversuche. Bitte warte ${rateLimit.retryAfterSeconds} Sekunden.` });
			}
			const user = repository.getUserForLogin(username);
			if (!user || !(await verifyPassword(password, user.passwordHash)) || user.passwordResetRequired) {
				repository.recordLoginFailure(username, requestIp);
				return fail(401, { loginError: invalidCredentialsError });
			}
			if (needsPasswordRehash(user.passwordHash)) {
				repository.updatePassword(user, await hashPassword(password));
			}
			repository.clearLoginFailures(username, requestIp);
			setSessionCookie(cookies, user, url);
		} catch {
			return fail(401, { loginError: invalidCredentialsError });
		}

		redirect(303, '/');
	},

	logout: ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(403, { csrfError });
		}
		const token = cookies.get(sessionCookieName);
		if (token) {
			getCollectionRepository().revokeSession(hashSessionToken(token));
		}
		cookies.delete(sessionCookieName, { path: '/' });
		redirect(303, '/');
	},

	resetPassword: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(403, { csrfError });
		}
		const formData = await request.formData();
		try {
			const password = getFormText(formData, 'password');
			validatePassword(password);
			const scope = getCollectionRepository().consumePasswordReset(
				getFormText(formData, 'username'),
				hashSessionToken(getFormText(formData, 'resetSecret')),
				await hashPassword(password)
			);
			if (!scope) {
				return fail(400, { resetError: 'Der Zurücksetzungscode ist ungültig oder abgelaufen.' });
			}
			setSessionCookie(cookies, scope, url);
		} catch {
			return fail(400, { resetError: 'Der Zurücksetzungscode ist ungültig oder abgelaufen.' });
		}
		redirect(303, '/');
	},

	changePassword: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(403, { csrfError });
		}
		const token = cookies.get(sessionCookieName);
		const scope = getSessionScope(token);
		if (!scope) {
			return fail(401, { changePasswordError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}
		const formData = await request.formData();
		try {
			const currentPasswordHash = getCollectionRepository().getPasswordHashForScope(scope);
			if (!currentPasswordHash || !(await verifyPassword(getFormText(formData, 'currentPassword'), currentPasswordHash))) {
				return fail(400, { changePasswordError: invalidCredentialsError });
			}
			const password = getFormText(formData, 'password');
			validatePassword(password);
			const repository = getCollectionRepository();
			repository.updatePassword(scope, await hashPassword(password));
			repository.revokeSessionsForUser(scope);
			setSessionCookie(cookies, scope, url);
		} catch (error) {
			return fail(400, { changePasswordError: getErrorMessage(error) });
		}
		redirect(303, '/');
	},

	createCollection: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(403, { csrfError });
		}
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

	addItem: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(403, { csrfError });
		}
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
 * @param {URL} url - Resolved application request URL.
 * @returns {void}
 */
function setSessionCookie(cookies: Cookies, scope: SessionScope, url: URL): void {
	const token = createSessionToken();
	getCollectionRepository().createSessionForUser(scope, hashSessionToken(token));
	cookies.set(sessionCookieName, token, {
		httpOnly: true,
		path: '/',
		sameSite: 'lax',
		secure: url.protocol === 'https:' || process.env.NODE_ENV === 'production',
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
