import { hashSessionToken } from '$lib/server/session-token';
import { getCollectionRepository } from '$lib/server/repository';
import type { LayoutServerLoad } from './$types';

const sessionCookieName = 'passalong_session';
const firstCollectionIndex = 0;

/**
 * Resolve the authenticated visitor for the global header on every page.
 *
 * Public stand pages stay anonymous: without a session cookie the header payload is empty and
 * no account data is resolved or leaked.
 *
 * @param cookies - Cookie store holding the session token.
 * @returns The header context (authentication flag, admin flag, profile).
 */
export const load: LayoutServerLoad = ({ cookies, url }) => {
	const token = cookies.get(sessionCookieName);
	const scope = token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
	const collections = scope ? getCollectionRepository().listCollectionsForOwner(scope) : [];
	const requestedCollectionId = url.searchParams.get('collection');
	const activeCollection =
		(requestedCollectionId
			? collections.find((collection) => collection.id === requestedCollectionId)
			: null) ??
		collections[firstCollectionIndex] ??
		null;
	return {
		header: {
			isAuthenticated: Boolean(scope),
			isInstanceAdmin: scope ? getCollectionRepository().isInstanceAdmin(scope) : false,
			profile: scope ? getCollectionRepository().getProfile(scope) : null,
			standPath: activeCollection ? `/stand/${encodeURIComponent(activeCollection.id)}` : null
		}
	};
};
