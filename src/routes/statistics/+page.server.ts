import { redirect } from '@sveltejs/kit';
import type { SaleStatisticsPeriod, SessionScope } from '$lib/server/collection-repository';
import { getCollectionRepository } from '$lib/server/repository';
import { hashSessionToken } from '$lib/server/session-token';
import type { PageServerLoad } from './$types';

const sessionCookieName = 'passalong_session';
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolve an authenticated owner scope from a raw session cookie.
 *
 * @param {string | undefined} token - Raw session cookie value.
 * @returns {SessionScope | null} The authenticated scope or null.
 */
function getSessionScope(token: string | undefined): SessionScope | null {
	return token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
}

/**
 * Read an optional ISO calendar-date bound from the query string.
 *
 * @param {URLSearchParams} params - The request query parameters.
 * @param {string} name - Query parameter name to read.
 * @returns {string | null} The validated date or null when unset/invalid.
 */
function parseDateBound(params: URLSearchParams, name: string): string | null {
	const raw = params.get(name);
	return raw && isoDatePattern.test(raw) ? raw : null;
}

/**
 * Load the authenticated owner's statistics with an optional period filter.
 *
 * @returns Statistics, daily proceeds series, and the applied period.
 */
export const load: PageServerLoad = ({ cookies, url }) => {
	const scope = getSessionScope(cookies.get(sessionCookieName));
	if (!scope) {
		redirect(303, '/');
	}
	const repository = getCollectionRepository();
	const period: SaleStatisticsPeriod = {
		fromInclusive: parseDateBound(url.searchParams, 'from'),
		toInclusive: parseDateBound(url.searchParams, 'to')
	};
	return {
		statistics: repository.getSaleStatistics(scope, period),
		proceedsByDay: repository.getProceedsByDay(scope, period),
		period
	};
};
