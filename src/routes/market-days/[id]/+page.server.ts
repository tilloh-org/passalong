import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { actions as marketDayActions } from '../+page.server';
import { getCollectionRepository } from '$lib/server/repository';
import { hashSessionToken } from '$lib/server/session-token';
import type { SessionScope } from '$lib/server/collection-repository';

const sessionCookieName = 'passalong_session';
const httpStatus = {
	seeOther: 303,
	notFound: 404
} as const;

/**
 * Resolve the authenticated owner for a market-day detail request.
 *
 * @param {string | undefined} token - The opaque session token from the request cookie.
 * @returns {SessionScope | null} The owner scope or null when the session is absent.
 */
function getSessionScope(token: string | undefined): SessionScope | null {
	const scope = token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
	return scope ? { userId: scope.userId, tenantId: scope.tenantId } : null;
}

/** Load only one owner-scoped market-day detail view. */
export const load: PageServerLoad = ({ cookies, params }) => {
	const scope = getSessionScope(cookies.get(sessionCookieName));
	if (!scope) {
		redirect(httpStatus.seeOther, '/');
	}
	const repository = getCollectionRepository();
	const marketDay = repository.getMarketDay(params.id, scope);
	if (!marketDay) {
		error(httpStatus.notFound, 'Markttag nicht gefunden.');
	}
	const settlement = repository.getMarketDaySettlement(marketDay.id, scope);
	if (!settlement) {
		error(httpStatus.notFound, 'Markttag nicht gefunden.');
	}
	return {
		marketDay,
		settlement,
		soldItems: repository.listSoldItemsForMarketDay(marketDay.id, scope),
		expenses: repository
			.listExpenses(scope)
			.filter((expense) => expense.marketDayId === marketDay.id)
	};
};

/** Reuse the parent market-day mutations while running them at the detail route. */
export const actions: Actions = {
	updateMarketDay: (event) => marketDayActions.updateMarketDay(event as never),
	deleteMarketDay: (event) => marketDayActions.deleteMarketDay(event as never),
	closeMarketDay: (event) => marketDayActions.closeMarketDay(event as never),
	reopenMarketDay: (event) => marketDayActions.reopenMarketDay(event as never),
	createExpense: (event) => marketDayActions.createExpense(event as never),
	updateExpense: (event) => marketDayActions.updateExpense(event as never),
	deleteExpense: (event) => marketDayActions.deleteExpense(event as never)
};
