import { error, redirect } from '@sveltejs/kit';
import { getCollectionRepository } from '$lib/server/repository';
import { hashSessionToken } from '$lib/server/session-token';
import type { PageServerLoad } from './$types';

const sessionCookieName = 'passalong_session';
const seeOtherStatus = 303;
const notFoundStatus = 404;

/**
 * Resolve a session cookie to the active tenant and owner scope.
 *
 * @param {string | undefined} token - Raw session cookie value.
 * @returns {import('$lib/server/collection-repository').SessionScope | null} Active scope or null.
 */
function getSessionScope(token: string | undefined) {
	return token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
}

/**
 * Resolve a neutral QR-code route to the internal owner detail or public buyer detail.
 *
 * An authenticated owner can open the complete workflow for an unsold item.
 * Every other visitor is only redirected to that item's reduced public stand view.
 * Sold and unknown identifiers return a data-free 404 before owner lookup.
 *
 * @param {Parameters<PageServerLoad>[0]} event - Current route request event.
 * @throws {import('@sveltejs/kit').Redirect} To the applicable owner or public item page.
 * @throws {import('@sveltejs/kit').HttpError} 404 when no buyer-visible item exists.
 */
export const load: PageServerLoad = ({ cookies, params }) => {
	const repository = getCollectionRepository();
	const publicRoute = repository.getPublicStandItemRoute(params.id);
	if (!publicRoute) {
		throw error(notFoundStatus, 'Artikel nicht gefunden');
	}

	const scope = getSessionScope(cookies.get(sessionCookieName));
	const ownerItem = scope ? repository.getItemForOwner(params.id, scope) : null;
	if (ownerItem) {
		redirect(seeOtherStatus, `/items/${encodeURIComponent(ownerItem.id)}`);
	}

	redirect(
		seeOtherStatus,
		`/stand/${encodeURIComponent(publicRoute.collectionId)}/${encodeURIComponent(publicRoute.itemId)}`
	);
};
