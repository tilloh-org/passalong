import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { hasSameOrigin } from '$lib/server/csrf';
import { hashSessionToken } from '$lib/server/session-token';
import { getCollectionRepository } from '$lib/server/repository';
import type {
	CreateMarketDayInput,
	Expense,
	ExpenseCategory,
	MarketDay,
	MarketDaySettlement,
	SessionScope
} from '$lib/server/collection-repository';

const sessionCookieName = 'passalong_session';
const httpStatus = {
	seeOther: 303,
	badRequest: 400,
	unauthorized: 401,
	forbidden: 403,
	notFound: 404
} as const;
const csrfError = 'Diese Anfrage konnte nicht sicher verarbeitet werden.';
const sessionExpiredError = 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.';
const marketDayInputError = 'Bitte prüfe Name, Datum und Zeiten.';
const expenseCategories: ExpenseCategory[] = ['fee', 'supplies', 'transport', 'purchase', 'other'];
const maximumExpenseCents = 10_000_000;
const euroAmountPattern = /^\d{1,7}([.,]\d{1,2})?$/;
const marketDayNotFoundError = 'Markttag nicht gefunden.';
const expenseError = {
	csrf: 'csrf',
	sessionExpired: 'sessionExpired',
	invalid: 'invalid',
	notFound: 'notFound'
} as const;

/**
 * Resolve the authenticated owner for the market-days page.
 *
 * @param {import('./$types').Cookies} cookies - The request cookie store.
 * @returns {SessionScope | null} The session scope or null when unauthenticated.
 */
function getSessionScope(token: string | undefined): SessionScope | null {
	const scope = token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
	return scope ? { userId: scope.userId, tenantId: scope.tenantId } : null;
}

/**
 * Load the authenticated owner's market days, open ones first.
 *
 * @param {Parameters<PageServerLoad>[0]} event - The SvelteKit load event.
 * @returns {{ marketDays: MarketDay[] }} The owner's market days.
 */
export const load: PageServerLoad = ({ cookies }) => {
	const scope = getSessionScope(cookies.get(sessionCookieName));
	if (!scope) {
		redirect(httpStatus.seeOther, '/');
	}
	const repository = getCollectionRepository();
	const marketDays: MarketDay[] = repository.listMarketDays(scope);
	const expenses: Expense[] = repository.listExpenses(scope);
	const settlements: MarketDaySettlement[] = marketDays
		.map((marketDay) => repository.getMarketDaySettlement(marketDay.id, scope))
		.filter((settlement): settlement is MarketDaySettlement => settlement !== null);
	return { marketDays, expenses, settlements };
};

/**
 * Read a text form field as a trimmed string.
 *
 * @param {FormData} formData - The submitted form data.
 * @param {string} name - The field name.
 * @returns {string} The trimmed value or an empty string.
 */
function getFormText(formData: FormData, name: string): string {
	const value = formData.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * Read an optional form field as a nullable trimmed string.
 *
 * @param {FormData} formData - The submitted form data.
 * @param {string} name - The field name.
 * @returns {string | null} The trimmed value or null when blank.
 */
/**
 * Convert a localized euro input into whole cents.
 *
 * @param {string} value - Decimal euro value using a comma or period separator.
 * @returns {number | null} The validated amount in cents or null when invalid.
 */
function parseEuroCents(value: string): number | null {
	if (!/^[0-9]{1,7}([.,][0-9]{1,2})?$/.test(value)) {
		return null;
	}
	const euros = Number(value.replace(',', '.'));
	if (!Number.isFinite(euros)) {
		return null;
	}
	const cents = Math.round(euros * 100);
	return Number.isSafeInteger(cents) && cents <= maximumExpenseCents ? cents : null;
}

/**
 * Read an optional form field as a nullable trimmed string.
 *
 * @param {FormData} formData - The submitted form data.
 * @param {string} name - The field name.
 * @returns {string | null} The trimmed value or null when blank.
 */
function getOptionalFormText(formData: FormData, name: string): string | null {
	const value = getFormText(formData, name);
	return value.length > 0 ? value : null;
}

/**
 * Build a market-day input from form fields, treating blanks as null.
 *
 * @param {FormData} formData - The submitted form data.
 * @returns {CreateMarketDayInput} The parsed input.
 */
function parseMarketDayInput(formData: FormData): CreateMarketDayInput {
	return {
		name: getFormText(formData, 'name'),
		date: getOptionalFormText(formData, 'date'),
		startTime: getOptionalFormText(formData, 'startTime'),
		endTime: getOptionalFormText(formData, 'endTime'),
		location: getFormText(formData, 'location'),
		notes: getFormText(formData, 'notes')
	};
}

export const actions: Actions = {
	createMarketDay: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { marketDayError: csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { marketDayError: sessionExpiredError });
		}
		const formData = await request.formData();
		try {
			getCollectionRepository().createMarketDay(parseMarketDayInput(formData), scope);
		} catch {
			return fail(httpStatus.badRequest, { marketDayError: marketDayInputError });
		}
		redirect(httpStatus.seeOther, '/market-days');
	},
	updateMarketDay: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { marketDayError: csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { marketDayError: sessionExpiredError });
		}
		const formData = await request.formData();
		try {
			getCollectionRepository().updateMarketDay(getFormText(formData, 'marketDayId'), parseMarketDayInput(formData), scope);
		} catch {
			return fail(httpStatus.badRequest, { marketDayError: marketDayInputError });
		}
		redirect(httpStatus.seeOther, '/market-days');
	},
	deleteMarketDay: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { marketDayError: csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { marketDayError: sessionExpiredError });
		}
		const formData = await request.formData();
		try {
			getCollectionRepository().deleteMarketDay(getFormText(formData, 'marketDayId'), scope);
		} catch {
			return fail(httpStatus.notFound, { marketDayError: 'Markttag nicht gefunden.' });
		}
		redirect(httpStatus.seeOther, '/market-days');
	},
	closeMarketDay: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { marketDayError: csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { marketDayError: sessionExpiredError });
		}
		const formData = await request.formData();
		try {
			getCollectionRepository().closeMarketDay(getFormText(formData, 'marketDayId'), scope);
		} catch {
			return fail(httpStatus.notFound, { marketDayError: 'Markttag nicht gefunden.' });
		}
		redirect(httpStatus.seeOther, '/market-days');
	},
	reopenMarketDay: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { marketDayError: csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { marketDayError: sessionExpiredError });
		}
		const formData = await request.formData();
		try {
			getCollectionRepository().reopenMarketDay(getFormText(formData, 'marketDayId'), scope);
		} catch {
			return fail(httpStatus.notFound, { marketDayError: 'Markttag nicht gefunden.' });
		}
		redirect(httpStatus.seeOther, '/market-days');
	},
	createExpense: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { expenseError: expenseError.csrf });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { expenseError: expenseError.sessionExpired });
		}
		const formData = await request.formData();
		const amountCents = parseEuroCents(getFormText(formData, 'amountEuros'));
		const categoryText = getFormText(formData, 'category');
		if (amountCents === null || !(expenseCategories as string[]).includes(categoryText)) {
			return fail(httpStatus.badRequest, { expenseError: expenseError.invalid });
		}
		try {
			getCollectionRepository().createExpense(
				{
					label: getFormText(formData, 'label'),
					category: categoryText as ExpenseCategory,
					amountCents,
					expenseDate: getOptionalFormText(formData, 'expenseDate') ?? new Date().toISOString().slice(0, 10),
					marketDayId: getOptionalFormText(formData, 'marketDayId')
				},
				scope
			);
		} catch {
			return fail(httpStatus.badRequest, { expenseError: expenseError.invalid });
		}
		redirect(httpStatus.seeOther, '/market-days');
	},
	updateExpense: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { expenseError: expenseError.csrf });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { expenseError: expenseError.sessionExpired });
		}
		const formData = await request.formData();
		const amountCents = parseEuroCents(getFormText(formData, 'amountEuros'));
		const categoryText = getFormText(formData, 'category');
		if (amountCents === null || !(expenseCategories as string[]).includes(categoryText)) {
			return fail(httpStatus.badRequest, { expenseError: expenseError.invalid });
		}
		try {
			getCollectionRepository().updateExpense(
				getFormText(formData, 'expenseId'),
				{
					label: getFormText(formData, 'label'),
					category: categoryText as ExpenseCategory,
					amountCents,
					expenseDate: getOptionalFormText(formData, 'expenseDate') ?? new Date().toISOString().slice(0, 10),
					marketDayId: getOptionalFormText(formData, 'marketDayId')
				},
				scope
			);
		} catch {
			return fail(httpStatus.badRequest, { expenseError: expenseError.invalid });
		}
		redirect(httpStatus.seeOther, '/market-days');
	},
	deleteExpense: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { expenseError: expenseError.csrf });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { expenseError: expenseError.sessionExpired });
		}
		const formData = await request.formData();
		try {
			getCollectionRepository().deleteExpense(getFormText(formData, 'expenseId'), scope);
		} catch {
			return fail(httpStatus.notFound, { expenseError: expenseError.notFound });
		}
		redirect(httpStatus.seeOther, '/market-days');
	}
};