import { redirect } from '@sveltejs/kit';
import QRCode from 'qrcode';
import { getCollectionRepository } from '$lib/server/repository';
import { hashSessionToken } from '$lib/server/session-token';
import { chunkIntoPages } from '$lib/utils/chunk';
import type { PageServerLoad } from './$types';

const sessionCookieName = 'passalong_session';
const seeOtherStatus = 303;
const labelsPerPage = 16;
const qrCodeImageSizePixels = 144;

/**
 * Resolve a session cookie to the active tenant and owner scope.
 *
 * @param {string | undefined} token - Raw session cookie value.
 * @returns {import('$lib/server/collection-repository').SessionScope | null} Active scope or null.
 */
function getSessionScope(token: string | undefined) {
	return token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
}

export const load: PageServerLoad = async ({ cookies, url }) => {
	const scope = getSessionScope(cookies.get(sessionCookieName));
	if (!scope) {
		redirect(seeOtherStatus, '/');
	}

	const items = getCollectionRepository().listItemsForPriceLabels(scope);
	const labels = await Promise.all(
		items.map(async (item) => {
			const itemUrl = new URL(`/items/${encodeURIComponent(item.id)}`, url.origin).toString();
			return {
				item,
				qrCodeDataUrl: await QRCode.toDataURL(itemUrl, {
					width: qrCodeImageSizePixels,
					margin: 1
				})
			};
		})
	);

	return {
		itemCount: items.length,
		labelPages: chunkIntoPages(labels, labelsPerPage)
	};
};
