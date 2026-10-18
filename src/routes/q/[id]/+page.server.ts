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
 * An authenticated owner reaches the complete workflow of an unsold item of their own tenant, also
 * when its collection is not published yet: the label printed at the stall must stay usable. The
 * owner lookup only ever searches the data of the session's own tenant, so it cannot expose
 * anything to anybody else.
 *
 * Every other visitor is only redirected to that item's reduced public stand view, which exists for
 * published and unsold items. Sold and unknown identifiers therefore answer a data-free 404 — for
 * the owner as well, so a label that is already sold reveals no detail to anyone.
 *
 * @param {Parameters<PageServerLoad>[0]} event - Current route request event.
 * @throws {import('@sveltejs/kit').Redirect} To the applicable owner or public item page.
 * @throws {import('@sveltejs/kit').HttpError} 404 when no buyer-visible item exists.
 */
export const load: PageServerLoad = ({ cookies, params }) => {
	const repository = getCollectionRepository();
	const scope = getSessionScope(cookies.get(sessionCookieName));
	const ownerItem = scope ? repository.getItemForOwner(params.id, scope) : null;
	if (ownerItem && !ownerItem.soldAt) {
		redirect(seeOtherStatus, `/items/${encodeURIComponent(ownerItem.id)}`);
	}

	const publicRoute = repository.getPublicStandItemRoute(params.id);
	if (!publicRoute) {
		throw error(notFoundStatus, 'Artikel nicht gefunden');
	}

	redirect(
		seeOtherStatus,
		`/stand/${encodeURIComponent(publicRoute.collectionId)}/${encodeURIComponent(publicRoute.itemId)}`
	);
};
