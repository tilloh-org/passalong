import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCollectionRepository } from '$lib/server/repository';
import { hashSessionToken } from '$lib/server/session-token';

const sessionCookieName = 'passalong_session';
const httpStatusSeeOther = 303;

/**
 * Keep the seller scan view behind an authenticated session.
 *
 * @param {Parameters<PageServerLoad>[0]} event - The SvelteKit load event.
 * @returns {Record<string, never>} Empty page data for the client-only scanner UI.
 */
export const load: PageServerLoad = ({ cookies }) => {
	const token = cookies.get(sessionCookieName);
	const scope = token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
	if (!scope) {
		redirect(httpStatusSeeOther, '/');
	}
	return {};
};
