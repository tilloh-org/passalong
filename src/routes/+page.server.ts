import { fail, redirect, type Cookies } from '@sveltejs/kit';
import {
	itemCategories,
	itemConditions,
	type Item,
	type ItemCategory,
	type ItemCondition,
	type ItemImage,
	type SaleChannel,
	type SessionScope
} from '$lib/server/collection-repository';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { hasSameOrigin } from '$lib/server/csrf';
import { maximumPasswordLength, minimumPasswordLength } from '$lib/password-policy';
import { getMediaRoot } from '$lib/server/media-root';
import { saveUploadedImage } from '$lib/server/media-storage';
import { hashPassword, needsPasswordRehash, validatePassword, verifyPassword } from '$lib/server/password';
import { getCollectionRepository } from '$lib/server/repository';
import { createSessionToken, hashSessionToken } from '$lib/server/session-token';
import type { Actions, PageServerLoad } from './$types';

const sessionCookieName = 'passalong_session';
const millisecondsPerSecond = 1000;
const secondsPerMinute = 60;
const minutesPerHour = 60;
const hoursPerDay = 24;
const passwordResetLifetimeHours = 1;
const sessionLifetimeDays = 30;
const firstCollectionIndex = 0;
const maximumPriceCents = 10_000_000;
const wholeNumberPattern = /^\d+$/;
const httpStatus = {
	seeOther: 303,
	badRequest: 400,
	unauthorized: 401,
	forbidden: 403,
	notFound: 404,
	conflict: 409,
	tooManyRequests: 429
} as const;
const passwordResetLifetimeMilliseconds = passwordResetLifetimeHours * minutesPerHour * secondsPerMinute * millisecondsPerSecond;
const sessionMaxAgeSeconds = sessionLifetimeDays * hoursPerDay * minutesPerHour * secondsPerMinute;
const csrfError = 'Diese Anfrage konnte nicht sicher verarbeitet werden.';
const invalidCredentialsError = 'Benutzername oder Passwort ist nicht korrekt.';
const pngFileExtension = '.png';
const jpegFileExtension = '.jpg';
const pngMimeType = 'image/png';
const jpegMimeType = 'image/jpeg';
const webpMimeType = 'image/webp';

interface ItemWithImages extends Item {
	images: ItemImage[];
	coverImageKey: string | null;
}

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
	const isInstanceAdmin = scope ? repository.isInstanceAdmin(scope) : false;
	const requestedCollectionId = url.searchParams.get('collection');
	const collectionId = requestedCollectionId ?? collections[firstCollectionIndex]?.id;
	const collection = scope && collectionId ? repository.getCollectionForOwner(collectionId, scope) : null;
	const items = collection && scope ? repository.listItemsForOwner(collection.id, scope).map(enrichItemWithImages(scope)) : [];

	return {
		collection,
		collections,
		items,
		categoryOptions: itemCategories,
		conditionOptions: itemConditions,
		isAuthenticated: Boolean(scope),
		isInitialSetup: !repository.hasAccounts(),
		isInstanceAdmin,
		saleStatistics: scope ? repository.getSaleStatistics(scope) : undefined
	};
};

export const actions: Actions = {
	register: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const repository = getCollectionRepository();
		if (repository.hasAccounts()) {
			return fail(httpStatus.conflict, { registerError: 'Der erste Zugang wurde bereits erstellt. Bitte melde dich an.' });
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
			return fail(httpStatus.badRequest, { registerError: getErrorMessage(error) });
		}

		redirect(httpStatus.seeOther, '/');
	},

	login: async ({ cookies, getClientAddress, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const formData = await request.formData();
		const username = getFormText(formData, 'username');
		const password = getFormText(formData, 'password');
		const repository = getCollectionRepository();
		const requestIp = getClientAddress();
		try {
			const rateLimit = repository.getLoginAttemptStatus(username, requestIp);
			if (rateLimit.blocked) {
				return fail(httpStatus.tooManyRequests, { loginError: `Zu viele Anmeldeversuche. Bitte warte ${rateLimit.retryAfterSeconds} Sekunden.` });
			}
			let user;
			try {
				user = repository.getUserForLogin(username);
			} catch {
				user = null;
			}
			if (!user || !(await verifyPassword(password, user.passwordHash)) || user.passwordResetRequired) {
				repository.recordLoginFailure(username, requestIp);
				return fail(httpStatus.unauthorized, { loginError: invalidCredentialsError });
			}
			if (needsPasswordRehash(user.passwordHash)) {
				repository.updatePassword(user, await hashPassword(password));
			}
			repository.clearLoginFailures(username, requestIp);
			setSessionCookie(cookies, user, url);
		} catch {
			return fail(httpStatus.unauthorized, { loginError: invalidCredentialsError });
		}

		redirect(httpStatus.seeOther, '/');
	},

	logout: ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const token = cookies.get(sessionCookieName);
		if (token) {
			getCollectionRepository().revokeSession(hashSessionToken(token));
		}
		cookies.delete(sessionCookieName, { path: '/' });
		redirect(httpStatus.seeOther, '/');
	},

	createPasswordReset: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { passwordResetIssueError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}
		const repository = getCollectionRepository();
		if (!repository.isInstanceAdmin(scope)) {
			return fail(httpStatus.forbidden, { passwordResetIssueError: 'Du bist nicht für die Instanzverwaltung berechtigt.' });
		}

		try {
			const resetSecret = createSessionToken();
			const resetCreated = repository.createPasswordResetForUsername(
				getFormText(await request.formData(), 'username'),
				hashSessionToken(resetSecret),
				new Date(Date.now() + passwordResetLifetimeMilliseconds).toISOString()
			);
			if (!resetCreated) {
				return fail(httpStatus.notFound, { passwordResetIssueError: 'Das angegebene Konto wurde nicht gefunden.' });
			}
			return { passwordResetSecret: resetSecret };
		} catch (error) {
			return fail(httpStatus.badRequest, { passwordResetIssueError: getErrorMessage(error) });
		}
	},

	resetPassword: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
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
				return fail(httpStatus.badRequest, { resetError: 'Der Zurücksetzungscode ist ungültig oder abgelaufen.' });
			}
			setSessionCookie(cookies, scope, url);
		} catch {
			return fail(httpStatus.badRequest, { resetError: 'Der Zurücksetzungscode ist ungültig oder abgelaufen.' });
		}
		redirect(httpStatus.seeOther, '/');
	},

	changePassword: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const token = cookies.get(sessionCookieName);
		const scope = getSessionScope(token);
		if (!scope) {
			return fail(httpStatus.unauthorized, { changePasswordError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}
		const formData = await request.formData();
		try {
			const currentPasswordHash = getCollectionRepository().getPasswordHashForScope(scope);
			if (!currentPasswordHash || !(await verifyPassword(getFormText(formData, 'currentPassword'), currentPasswordHash))) {
				return fail(httpStatus.badRequest, { changePasswordError: invalidCredentialsError });
			}
			const password = getFormText(formData, 'password');
			validatePassword(password);
			const repository = getCollectionRepository();
			repository.updatePassword(scope, await hashPassword(password));
			repository.revokeSessionsForUser(scope);
			setSessionCookie(cookies, scope, url);
		} catch (error) {
			return fail(httpStatus.badRequest, { changePasswordError: getErrorMessage(error) });
		}
		redirect(httpStatus.seeOther, '/');
	},

	createCollection: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { createCollectionError: 'Bitte melde dich zuerst an.' });
		}

		const formData = await request.formData();
		let collection;
		try {
			collection = getCollectionRepository().createCollection(
				{ name: getFormText(formData, 'collectionName') },
				scope
			);
		} catch (error) {
			return fail(httpStatus.badRequest, { createCollectionError: getErrorMessage(error) });
		}

		redirect(httpStatus.seeOther, `/?collection=${encodeURIComponent(collection.id)}`);
	},

	addItem: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const formData = await request.formData();
		const repository = getCollectionRepository();
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { addItemError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}

		const collectionId = getFormText(formData, 'collectionId');
		if (!repository.getCollectionForOwner(collectionId, scope)) {
			return fail(httpStatus.notFound, { addItemError: 'Die Sammlung wurde nicht gefunden.' });
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
			return fail(httpStatus.badRequest, { addItemError: getErrorMessage(error) });
		}

		redirect(httpStatus.seeOther, `/?collection=${encodeURIComponent(collectionId)}`);
	},

	uploadItemImage: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { uploadImageError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}

		const formData = await request.formData();
		const itemId = getFormText(formData, 'itemId');
		const upload = formData.get('image');
		if (!(upload instanceof File) || upload.size === 0) {
			return fail(httpStatus.badRequest, { uploadImageError: 'Bitte wähle ein Bild aus.' });
		}

		try {
			const payload = Buffer.from(await upload.arrayBuffer());
			const storageKey = await saveUploadedImage(getMediaRoot(), upload.type, payload);
			getCollectionRepository().addItemImage(itemId, storageKey, scope);
		} catch (error) {
			return fail(httpStatus.badRequest, { uploadImageError: imageActionError(error) });
		}

		redirect(httpStatus.seeOther, '/');
	},

	removeItemImage: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { removeImageError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}

		const formData = await request.formData();
		try {
			getCollectionRepository().deleteItemImage(
				getFormText(formData, 'itemId'),
				getFormText(formData, 'imageId'),
				scope
			);
		} catch (error) {
			return fail(httpStatus.badRequest, { removeImageError: imageActionError(error) });
		}

		redirect(httpStatus.seeOther, '/');
	},

	markItemSold: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { saleStatusError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}

		const formData = await request.formData();
		try {
			getCollectionRepository().markItemSold(
				getFormText(formData, 'itemId'),
				{
					channel: getFormText(formData, 'channel') as SaleChannel,
					soldAt: getSaleTimestamp(getFormText(formData, 'soldAt')),
					proceedsCents: getSaleProceedsCents(formData)
				},
				scope
			);
		} catch (error) {
			return fail(httpStatus.badRequest, { saleStatusError: saleStatusError(error) });
		}

		redirect(httpStatus.seeOther, '/');
	},

	unmarkItemSold: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { saleStatusError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}

		const formData = await request.formData();
		try {
			getCollectionRepository().unmarkItemSold(getFormText(formData, 'itemId'), scope);
		} catch (error) {
			return fail(httpStatus.badRequest, { saleStatusError: saleStatusError(error) });
		}

		redirect(httpStatus.seeOther, '/');
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
	if (!wholeNumberPattern.test(value)) {
		throw new Error('Bitte gib einen Preis in Cent als ganze Zahl ein.');
	}
	const priceCents = Number(value);
	if (!Number.isSafeInteger(priceCents) || priceCents > maximumPriceCents) {
		throw new Error('Der Preis liegt außerhalb des erlaubten Bereichs.');
	}
	return priceCents;
}

/**
 * Parse the submitted sale proceeds submitted as a non-negative integer.
 *
 * @param {FormData} formData - Submitted form values.
 * @returns {number} The sale proceeds in euro cents.
 * @throws {Error} When the submitted proceeds are missing or invalid.
 */
function getSaleProceedsCents(formData: FormData): number {
	const value = getFormText(formData, 'proceedsCents').trim();
	if (!wholeNumberPattern.test(value)) {
		throw new Error('proceedsCents must be a non-negative integer');
	}
	const proceedsCents = Number(value);
	if (!Number.isSafeInteger(proceedsCents) || proceedsCents > maximumPriceCents) {
		throw new Error('proceedsCents must be a non-negative integer');
	}
	return proceedsCents;
}


/**
 * Normalize a date-only form value to a canonical UTC ISO timestamp at midnight.
 *
 * @param {string} value - Date string from the form input (YYYY-MM-DD or full ISO).
 * @returns {string} A canonical UTC ISO timestamp.
 * @throws {Error} If the value is neither a date nor a canonical ISO timestamp.
 */
function getSaleTimestamp(value: string): string {
	const trimmed = value.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		return `${trimmed}T00:00:00.000Z`;
	}
	return trimmed;
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
		maxAge: sessionMaxAgeSeconds
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

const imageErrorMessage = 'Das Bild konnte nicht verarbeitet werden. Bitte prüfe Format und Größe.';
const imageRemoveErrorMessage = 'Das Bild konnte nicht entfernt werden.';
const userFacingImageMessages = [
	'upload is not a supported image type',
	'upload is empty',
	'image exceeds the allowed size',
	'upload is not a supported image',
	'image was not found',
	'item was not found'
] as const;

/**
 * Map image-action failures to fixed user-facing messages without leaking
 * internal storage or SQLite details.
 *
 * @param {unknown} error - The thrown value.
 * @returns {string} A safe, fixed user-facing message.
 */
function imageActionError(error: unknown): string {
	if (error instanceof Error && (userFacingImageMessages as readonly string[]).includes(error.message)) {
		return error.message;
	}
	return imageErrorMessage;
}

const saleStatusErrorByInternalMessage: Record<string, string> = {
	'item was not found': 'Der Artikel wurde nicht gefunden.',
	'channel is not a supported sale channel': 'Bitte wähle einen gültigen Verkaufskanal.',
	'soldAt must be a canonical UTC ISO timestamp': 'Bitte gib ein gültiges Verkaufsdatum an.'
};
const saleStatusGenericError =
	'Die Verkaufsinformation konnte nicht gespeichert werden. Bitte prüfe die Angaben.';

/**
 * Map sale-status action failures to German user-facing messages without leaking
 * internal error details.
 *
 * @param {unknown} error - The thrown value.
 * @returns {string} A safe, fixed user-facing message.
 */
function saleStatusError(error: unknown): string {
	if (error instanceof Error && error.message in saleStatusErrorByInternalMessage) {
		return saleStatusErrorByInternalMessage[error.message];
	}
	if (error instanceof Error && error.message.includes('proceedsCents')) {
		return 'Bitte gib einen gültigen Erlös in Cent als ganze Zahl ein.';
	}
	return saleStatusGenericError;
}

/**
 * Enrich every item with its tenant-scoped image metadata.
 *
 * @param {SessionScope} scope - Authenticated user and tenant scope.
 * @returns {(item: Item) => ItemWithImages} Item mapper including image metadata.
 */
function enrichItemWithImages(scope: SessionScope): (item: Item) => ItemWithImages {
	return (item) => {
		const images = getCollectionRepository().listItemImages(item.id, scope);
		const coverImage = images.find((image) => image.isCover);
		return { ...item, images, coverImageKey: coverImage?.storageKey ?? null };
	};
}
