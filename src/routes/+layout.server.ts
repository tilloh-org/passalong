import { hashSessionToken } from '$lib/server/session-token';
import { getCollectionRepository } from '$lib/server/repository';
import type { LayoutServerLoad } from './$types';

const sessionCookieName = 'passalong_session';

/**
 * Resolve the authenticated visitor for the global header on every page.
 *
 * Public stand pages stay anonymous: without a session cookie the header payload is empty and
 * no account data is resolved or leaked.
 *
 * @param cookies - Cookie store holding the session token.
 * @returns The header context (authentication flag, admin flag, profile).
 */
export const load: LayoutServerLoad = ({ cookies }) => {
	const token = cookies.get(sessionCookieName);
	const scope = token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
	return {
		header: {
			isAuthenticated: Boolean(scope),
			isInstanceAdmin: scope ? getCollectionRepository().isInstanceAdmin(scope) : false,
			profile: scope ? getCollectionRepository().getProfile(scope) : null
		}
	};
};