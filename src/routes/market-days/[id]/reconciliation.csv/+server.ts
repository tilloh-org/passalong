import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCollectionRepository } from '$lib/server/repository';
import { hashSessionToken } from '$lib/server/session-token';
import type { SessionScope } from '$lib/server/collection-repository';
import { buildMarketDayCsv, buildReconciliationFileName } from '$lib/utils/market-day-csv';

const sessionCookieName = 'passalong_session';
const httpStatus = {
	seeOther: 303,
	notFound: 404
} as const;
const csvContentType = 'text/csv; charset=utf-8';
const marketDayNotFoundMessage = 'Markttag nicht gefunden.';

/**
 * Resolve the authenticated owner for a market-day export request.
 *
 * @param {string | undefined} token - The opaque session token from the request cookie.
 * @returns {SessionScope | null} The owner scope or null when the session is absent.
 */
function getSessionScope(token: string | undefined): SessionScope | null {
	const scope = token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
	return scope ? { userId: scope.userId, tenantId: scope.tenantId } : null;
}

/** Download the reconciliation of one owner-scoped market day as CSV. */
export const GET: RequestHandler = ({ cookies, params }) => {
	const scope = getSessionScope(cookies.get(sessionCookieName));
	if (!scope) {
		redirect(httpStatus.seeOther, '/');
	}
	const repository = getCollectionRepository();
	const marketDay = repository.getMarketDay(params.id, scope);
	const settlement = marketDay ? repository.getMarketDaySettlement(marketDay.id, scope) : null;
	if (!marketDay || !settlement) {
		error(httpStatus.notFound, marketDayNotFoundMessage);
	}
	const csv = buildMarketDayCsv({
		sales: repository.listSoldItemsForMarketDay(marketDay.id, scope).map((item) => ({
			soldAt: item.soldAt,
			title: item.title,
			proceedsCents: item.saleProceedsCents
		})),
		settlement
	});
	return new Response(csv, {
		headers: {
			'Content-Type': csvContentType,
			'Content-Disposition': `attachment; filename="${buildReconciliationFileName(marketDay.name)}"`
		}
	});
};
