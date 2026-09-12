import { fail, redirect } from '@sveltejs/kit';
import {
	itemCategories,
	saleChannels,
	type ItemCategory,
	type SaleChannel,
	type SaleHistoryFilters,
	type SessionScope
} from '$lib/server/collection-repository';
import { getCollectionRepository } from '$lib/server/repository';
import { hashSessionToken } from '$lib/server/session-token';
import type { Actions, PageServerLoad } from './$types';

const sessionCookieName = 'passalong_session';
const maximumPriceCents = 10_000_000;
const euroAmountPattern = /^\d{1,7}([.,]\d{1,2})?$/;
const httpStatus = {
	seeOther: 303,
	badRequest: 400
} as const;
const invalidFilterError = 'invalid';

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
 * Read an optional euro range bound from the filter form.
 *
 * @param {URLSearchParams} params - The request query parameters.
 * @param {string} name - Query parameter name to read.
 * @returns {number | null | 'invalid'} The validated bound, null when unset, or 'invalid'.
 */
function parseProceedsBound(params: URLSearchParams, name: string): number | null | 'invalid' {
	const raw = params.get(name);
	if (raw === null || raw === '') {
		return null;
	}
	return parseEuroAmount(raw) ?? 'invalid';
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
	const requestedChannel = url.searchParams.get('channel');
	const requestedCategory = url.searchParams.get('category');
	const proceedsMin = parseProceedsBound(url.searchParams, 'proceedsMin');
	const proceedsMax = parseProceedsBound(url.searchParams, 'proceedsMax');
	const invalidRange =
		proceedsMin === 'invalid' ||
		proceedsMax === 'invalid' ||
		(proceedsMin !== null && proceedsMax !== null && proceedsMin > proceedsMax);
	const filters: SaleHistoryFilters = {
		channel:
			requestedChannel && (saleChannels as readonly string[]).includes(requestedChannel)
				? (requestedChannel as SaleChannel)
				: null,
		category:
			requestedCategory && (itemCategories as readonly string[]).includes(requestedCategory)
				? (requestedCategory as ItemCategory)
				: null,
		proceedsMinCents: proceedsMin === 'invalid' ? null : proceedsMin,
		proceedsMaxCents: proceedsMax === 'invalid' ? null : proceedsMax
	};
	const sales = invalidRange ? [] : repository.getSaleHistory(scope, filters);
	return {
		sales,
		filters,
		saleChannelOptions: saleChannels,
		categoryOptions: itemCategories,
		invalidRange,
		summary: {
			soldItemCount: sales.length,
			totalProceedsCents: sales.reduce((total, sale) => total + sale.saleProceedsCents, 0)
		}
	};
};

export const actions: Actions = {};
