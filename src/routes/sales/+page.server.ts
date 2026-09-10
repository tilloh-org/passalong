import { fail, redirect } from '@sveltejs/kit';
import {
	saleChannels,
	type SaleChannel,
	type SaleHistoryFilters,
	type SessionScope
} from '$lib/server/collection-repository';
import { getCollectionRepository } from '$lib/server/repository';
import { hasSameOrigin } from '$lib/server/csrf';
import { hashSessionToken } from '$lib/server/session-token';
import type { Actions, PageServerLoad } from './$types';

const sessionCookieName = 'passalong_session';
const maximumPriceCents = 10_000_000;
const euroAmountPattern = /^\d{1,7}([.,]\d{1,2})?$/;
const httpStatus = {
	seeOther: 303,
	badRequest: 400,
	unauthorized: 401,
	forbidden: 403
} as const;
const saleHistoryError = {
	csrf: 'csrf',
	sessionExpired: 'sessionExpired',
	invalid: 'invalid'
} as const;

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
 * Read and normalize one text value from submitted form data.
 *
 * @param {FormData} formData - Submitted form data.
 * @param {string} name - Field name to read.
 * @returns {string} The trimmed text or an empty string.
 */
function getFormText(formData: FormData, name: string): string {
	const value = formData.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * Convert a localized euro input into whole cents.
 *
 * @param {string} value - Decimal euro value using a comma or period separator.
 * @returns {number | null} The validated amount in cents or null.
 */
function parseEuroAmount(value: string): number | null {
	if (!euroAmountPattern.test(value)) {
		return null;
	}
	const euros = Number(value.replace(',', '.'));
	if (!Number.isFinite(euros)) {
		return null;
	}
	const cents = Math.round(euros * 100);
	return Number.isSafeInteger(cents) && cents <= maximumPriceCents ? cents : null;
}

/**
 * Load the authenticated owner's filtered sale history.
 *
 * @returns Sale history entries, filter options, and filtered summary values.
 */
export const load: PageServerLoad = ({ cookies, url }) => {
	const scope = getSessionScope(cookies.get(sessionCookieName));
	if (!scope) {
		redirect(httpStatus.seeOther, '/');
	}
	const repository = getCollectionRepository();
	const marketDays = repository.listMarketDays(scope);
	const requestedMarketDayId = url.searchParams.get('marketDayId');
	const requestedChannel = url.searchParams.get('channel');
	const filters: SaleHistoryFilters = {
		marketDayId: requestedMarketDayId && marketDays.some((marketDay) => marketDay.id === requestedMarketDayId)
			? requestedMarketDayId
			: null,
		channel: requestedChannel && (saleChannels as readonly string[]).includes(requestedChannel)
			? requestedChannel as SaleChannel
			: null
	};
	const sales = repository.getSaleHistory(scope, filters);
	return {
		sales,
		marketDays,
		filters,
		saleChannelOptions: saleChannels,
		summary: {
			soldItemCount: sales.length,
			totalProceedsCents: sales.reduce((total, sale) => total + sale.saleProceedsCents, 0)
		}
	};
};

export const actions: Actions = {
	/**
	 * Correct the channel, proceeds, and optional market day of an existing sale.
	 */
	updateSale: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { saleHistoryError: saleHistoryError.csrf });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { saleHistoryError: saleHistoryError.sessionExpired });
		}
		const formData = await request.formData();
		const proceedsCents = parseEuroAmount(getFormText(formData, 'proceedsEuros'));
		if (proceedsCents === null) {
			return fail(httpStatus.badRequest, { saleHistoryError: saleHistoryError.invalid });
		}
		try {
			getCollectionRepository().updateSale(
				getFormText(formData, 'itemId'),
				{
					channel: getFormText(formData, 'channel') as SaleChannel,
					proceedsCents,
					marketDayId: getFormText(formData, 'marketDayId') || null
				},
				scope
			);
		} catch {
			return fail(httpStatus.badRequest, { saleHistoryError: saleHistoryError.invalid });
		}
		redirect(httpStatus.seeOther, '/sales');
	},
	/**
	 * Undo an existing sale and return the item to the open state.
	 */
	reopenItem: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { saleHistoryError: saleHistoryError.csrf });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { saleHistoryError: saleHistoryError.sessionExpired });
		}
		const formData = await request.formData();
		try {
			getCollectionRepository().unmarkItemSold(getFormText(formData, 'itemId'), scope);
		} catch {
			return fail(httpStatus.badRequest, { saleHistoryError: saleHistoryError.invalid });
		}
		redirect(httpStatus.seeOther, '/sales');
	}
};
