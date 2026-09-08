import { fail, redirect } from '@sveltejs/kit';
import { hasSameOrigin } from '$lib/server/csrf';
import { getCollectionRepository } from '$lib/server/repository';
import { hashSessionToken } from '$lib/server/session-token';
import type { Actions } from './$types';

const sessionCookieName = 'passalong_session';
const httpStatus = {
	forbidden: 403,
	seeOther: 303
};
const csrfError = 'Die Anfrage konnte nicht verifiziert werden. Bitte versuche es erneut.';

export const actions: Actions = {
	/**
	 * Revoke the current session and clear the cookie — the logout target for the global header.
	 */
	logout: ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const token = cookies.get(sessionCookieName);
		if (token) {
			getCollectionRepository().revokeSession(hashSessionToken(token));
		}
		cookies.delete(sessionCookieName, { path: '/' });
		throw redirect(httpStatus.seeOther, '/');
	}
};