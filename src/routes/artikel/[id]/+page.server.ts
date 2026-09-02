import { error, fail, redirect } from '@sveltejs/kit';
import {
	itemCategories,
	itemConditions,
	saleChannels,
	type Item,
	type ItemImage,
	type SaleChannel
} from '$lib/server/collection-repository';
import { getMediaRoot } from '$lib/server/media-root';
import { saveUploadedImage } from '$lib/server/media-storage';
import { getCollectionRepository } from '$lib/server/repository';
import { hasSameOrigin } from '$lib/server/csrf';
import { hashSessionToken } from '$lib/server/session-token';
import { Buffer } from 'node:buffer';
import QRCode from 'qrcode';
import type { Actions, PageServerLoad } from './$types';

const sessionCookieName = 'passalong_session';
const httpStatus = {
	seeOther: 303,
	badRequest: 400,
	unauthorized: 401,
	forbidden: 403,
	notFound: 404
} as const;
const csrfError = 'Diese Anfrage konnte nicht sicher verarbeitet werden.';
const wholeNumberPattern = /^\d+$/;
const maximumPriceCents = 10_000_000;
const qrCodeImageSizePixels = 240;
const maximumImagesPerUpload = 10;
const userFacingImageMessages = [
	'Das Bild entspricht nicht einem unterstützten Format.',
	'Das Bild ist zu groß.'
] as const;
const imageErrorMessage = 'Das Bild konnte nicht verarbeitet werden. Bitte prüfe Format und Größe.';
const saleStatusErrorByInternalMessage: Record<string, string> = {
	'item was not found': 'Der Artikel wurde nicht gefunden.',
	'channel is not a supported sale channel': 'Bitte wähle einen gültigen Verkaufskanal.',
	'soldAt must be a canonical UTC ISO timestamp': 'Bitte gib ein gültiges Verkaufsdatum an.'
};
const saleStatusGenericError =
	'Die Verkaufsinformation konnte nicht gespeichert werden. Bitte prüfe die Angaben.';

/**
 * Read a string value from form data and normalize absent values to an empty string.
 *
 * @param {FormData} formData - Submitted form values.
 * @param {string} field - Field name to read.
 * @returns {string} The trimmed value or an empty string.
 */
function getFormText(formData: FormData, field: string): string {
	const value = formData.get(field);
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resolve a cookie token to an active tenant/user scope.
 *
 * @param {string | undefined} token - Raw session cookie value.
 * @returns {import('$lib/server/collection-repository').SessionScope | null} Active scope or null.
 */
function getSessionScope(token: string | undefined) {
	return token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
}

/**
 * Map image-action failures to fixed user-facing messages without leaking internals.
 *
 * @param {unknown} error - The thrown value.
 * @returns {string} A safe user-facing message.
 */
function imageActionError(error: unknown): string {
	if (
		error instanceof Error &&
		(userFacingImageMessages as readonly string[]).includes(error.message)
	) {
		return error.message;
	}
	return imageErrorMessage;
}

/**
 * Map sale-status action failures to German user-facing messages without leaking internals.
 *
 * @param {unknown} error - The thrown value.
 * @returns {string} A safe user-facing message.
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
 * Parse the submitted sale proceeds as a non-negative integer.
 *
 * @param {FormData} formData - Submitted form values.
 * @returns {number} The sale proceeds in euro cents.
 * @throws {Error} When the submitted proceeds are missing or invalid.
 */
function getSaleProceedsCents(formData: FormData): number {
	const value = getFormText(formData, 'proceedsCents');
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
 */
function getSaleTimestamp(value: string): string {
	const trimmed = value.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		return `${trimmed}T00:00:00.000Z`;
	}
	return trimmed;
}

/**
 * Load the owner-scoped item with its images for the detail page.
 *
 * @param {Parameters<PageServerLoad>[0]} event - The SvelteKit load event.
 * @returns {{ item: Item; images: ItemImage[]; categoryOptions: string[]; saleChannelOptions: SaleChannel[] }} Detail data.
 * @throws {import('@sveltejs/kit').Redirect} To the login page for anonymous visitors.
 * @throws {import('@sveltejs/kit').HttpError} 404 when the item does not exist for the owner.
 */
export const load: PageServerLoad = async ({ cookies, params, url }) => {
	const scope = getSessionScope(cookies.get(sessionCookieName));
	if (!scope) {
		redirect(httpStatus.seeOther, '/');
	}
	const repository = getCollectionRepository();
	const item = repository.getItemForOwner(params.id, scope);
	if (!item) {
		throw error(httpStatus.notFound, 'Artikel nicht gefunden');
	}
	const itemUrl = new URL(`/artikel/${encodeURIComponent(item.id)}`, url.origin).toString();
	const qrCodeDataUrl = await QRCode.toDataURL(itemUrl, { width: qrCodeImageSizePixels, margin: 1 });
	return {
		item,
		images: repository.listItemImages(item.id, scope),
		categoryOptions: itemCategories,
		conditionOptions: itemConditions,
		saleChannelOptions: saleChannels,
		qrCodeDataUrl
	};
};

export const actions: Actions = {
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
		const uploads = formData.getAll('image').filter((entry): entry is File => entry instanceof File && entry.size > 0);
		if (uploads.length === 0) {
			return fail(httpStatus.badRequest, { uploadImageError: 'Bitte wähle mindestens ein Bild aus.' });
		}
		if (uploads.length > maximumImagesPerUpload) {
			return fail(httpStatus.badRequest, { uploadImageError: `Bitte wähle höchstens ${maximumImagesPerUpload} Bilder gleichzeitig aus.` });
		}

		try {
			for (const upload of uploads) {
				const payload = Buffer.from(await upload.arrayBuffer());
				const storageKey = await saveUploadedImage(getMediaRoot(), upload.type, payload);
				getCollectionRepository().addItemImage(itemId, storageKey, scope);
			}
		} catch (error) {
			return fail(httpStatus.badRequest, { uploadImageError: imageActionError(error) });
		}

		redirect(httpStatus.seeOther, `/artikel/${encodeURIComponent(itemId)}`);
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
		const itemId = getFormText(formData, 'itemId');
		try {
			getCollectionRepository().deleteItemImage(itemId, getFormText(formData, 'imageId'), scope);
		} catch (error) {
			return fail(httpStatus.badRequest, { removeImageError: imageActionError(error) });
		}

		redirect(httpStatus.seeOther, `/artikel/${encodeURIComponent(itemId)}`);
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
		const itemId = getFormText(formData, 'itemId');
		try {
			getCollectionRepository().markItemSold(
				itemId,
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

		redirect(httpStatus.seeOther, `/artikel/${encodeURIComponent(itemId)}`);
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
		const itemId = getFormText(formData, 'itemId');
		try {
			getCollectionRepository().unmarkItemSold(itemId, scope);
		} catch (error) {
			return fail(httpStatus.badRequest, { saleStatusError: saleStatusError(error) });
		}

		redirect(httpStatus.seeOther, `/artikel/${encodeURIComponent(itemId)}`);
	},
	setItemCover: async ({ cookies, request, url, params }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { coverError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}

		const formData = await request.formData();
		try {
			const itemId = getFormText(formData, 'itemId');
			getCollectionRepository().setItemCover(itemId, getFormText(formData, 'imageId'), scope);
		} catch (error) {
			return fail(httpStatus.badRequest, { coverError: imageActionError(error) });
		}

		redirect(httpStatus.seeOther, `/artikel/${encodeURIComponent(getFormText(formData, 'itemId'))}`);
	}
};
