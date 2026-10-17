import { expect, test } from '@playwright/test';

import { salesAccount } from './sales-instance-account';

test.setTimeout(120_000);

const assignedSaleEuros = '7,77';
const unassignedSaleEuros = '4,44';
const expenseEuros = '2,22';

/**
 * Sign the owner in, registering the first account of the fresh instance if it is still empty.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @returns {Promise<void>} Resolves once the owner is signed in.
 */
async function signInOnFreshInstance(page) {
	const account = salesAccount;
	await page.goto('/');
	const onboardingVisible = await page
		.getByRole('heading', { name: 'Ersten Zugang erstellen' })
		.isVisible()
		.catch(() => false);
	if (onboardingVisible) {
		await page.evaluate(async (registration) => {
			await fetch('/?/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams(registration),
				redirect: 'manual'
			});
		}, account);
		await page.goto('/');
	} else {
		const loginForm = page.locator('form[action="?/login"]');
		await loginForm.getByLabel('Benutzername').fill(account.username);
		await loginForm.getByLabel('Passwort').fill(account.password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();
	}
	await page.waitForSelector('[data-testid="profile-avatar-link"]', { timeout: 20_000 });
}

/**
 * Resolve the active collection, creating one when the owner has none yet.
 *
 * @param {import('@playwright/test').Page} page - Page of the signed-in owner.
 * @returns {Promise<string>} The id of the active collection.
 */
async function ensureCollection(page) {
	await page.goto('/');
	const collectionField = page.locator('input[name="collectionId"]').first();
	if ((await collectionField.count()) === 0) {
		await page.evaluate(async (collectionName) => {
			const response = await fetch('/?/createCollection', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ collectionName })
			});
			const result = await response.json();
			if (result.type === 'failure') {
				throw new Error(`creating the collection failed: ${JSON.stringify(result.data)}`);
			}
		}, 'Flohmarkt');
		await page.goto('/');
	}
	return collectionField.inputValue();
}

/**
 * Post one form action from inside the signed-in page and return its JSON result.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @param {string} actionPath - Path and action name, e.g. `/?/addItem`.
 * @param {Record<string, string>} values - The form values.
 * @returns {Promise<{ type?: string; location?: string; data?: unknown }>} The action result.
 */
async function postAction(page, actionPath, values) {
	const result = await page.evaluate(
		async ({ actionPath, values: formValues }) => {
			const response = await fetch(actionPath, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams(formValues),
				redirect: 'manual'
			});
			return { status: response.status, body: await response.text() };
		},
		{ actionPath, values }
	);
	if (result.status >= 400) {
		throw new Error(`${actionPath} answered ${result.status}: ${result.body.slice(0, 200)}`);
	}
	const parsed: { type?: string; location?: string; data?: unknown } = JSON.parse(result.body);
	if (parsed.type === 'failure') {
		throw new Error(`${actionPath} failed: ${JSON.stringify(parsed.data)}`);
	}
	return parsed;
}

/**
 * Create one item in the active collection and return its id.
 *
 * @param {import('@playwright/test').Page} page - Page of the signed-in owner.
 * @param {string} collectionId - The collection the item belongs to.
 * @param {string} title - The item title.
 * @returns {Promise<string>} The created item id.
 */
async function createItem(page, collectionId, title) {
	const result = await postAction(page, '/?/addItem', {
		collectionId,
		title,
		priceEuros: '12,00',
		category: 'home',
		condition: 'good'
	});
	const createdItemId = new URLSearchParams(result.location?.split('?')[1] ?? '').get('created');
	if (!createdItemId) {
		throw new Error(`the created item carries no id: ${JSON.stringify(result)}`);
	}
	return createdItemId;
}

/**
 * Create one market day and return its id.
 *
 * @param {import('@playwright/test').Page} page - Page of the signed-in owner.
 * @param {string} name - The market-day name.
 * @returns {Promise<string>} The created market-day id.
 */
async function createMarketDay(page, name) {
	await postAction(page, '/market-days?/createMarketDay', {
		name,
		date: '2026-10-17',
		startTime: '08:00',
		endTime: '16:00',
		location: 'Schulhof Moorweg',
		notes: ''
	});
	await page.goto('/market-days');
	const marketDayPath = await page
		.getByTestId('market-day-item')
		.filter({ hasText: name })
		.first()
		.getAttribute('href');
	const marketDayId = marketDayPath?.split('/').pop();
	if (!marketDayId) {
		throw new Error(`the created market day carries no id: ${marketDayPath}`);
	}
	return marketDayId;
}

/**
 * Turn a German amount label into cents.
 *
 * @param {string} label - An amount such as `1.234,56`.
 * @returns {number} The amount in cents.
 */
function centsFromLabel(label) {
	return Math.round(Number(label.replaceAll('.', '').replace(',', '.')) * 100);
}

/**
 * Read the amount one statistics card shows, in cents.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @param {string} testId - The test id of the card.
 * @returns {Promise<number>} The amount in cents.
 */
async function readCardCents(page, testId) {
	const text = await page.getByTestId(testId).innerText();
	const match = text.match(/(-?\d[\d.]*,\d{2})\s*€/);
	if (!match) {
		throw new Error(`the card ${testId} shows no amount: ${text}`);
	}
	return centsFromLabel(match[1]);
}

/**
 * Read the amount one breakdown bucket shows, in cents.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @param {string} testId - The test id of the breakdown.
 * @param {string} label - The label of the bucket.
 * @returns {Promise<number>} The amount in cents, zero when the bucket is absent.
 */
async function readBucketCents(page, testId, label) {
	const row = page.getByTestId(testId).locator('li').filter({ hasText: label }).first();
	if ((await row.count()) === 0) {
		return 0;
	}
	const match = (await row.innerText()).match(/(-?\d[\d.]*,\d{2})\s*€/);
	if (!match) {
		throw new Error(`the bucket ${label} shows no amount`);
	}
	return centsFromLabel(match[1]);
}

test('keeps the statistics in step with sales and expenses and follows a correction', async ({
	page
}) => {
	// arrange — one sale at a market day, one without a day, and a stand fee on the day
	await signInOnFreshInstance(page);
	const collectionId = await ensureCollection(page);
	const attemptSuffix = Date.now().toString().slice(-6);
	const marketDayName = `Statistiktag ${attemptSuffix}`;
	const assignedTitle = `Zimmerbrunnen ${attemptSuffix}`;
	const unassignedTitle = `Bücherkiste ${attemptSuffix}`;
	const assignedItemId = await createItem(page, collectionId, assignedTitle);
	const unassignedItemId = await createItem(page, collectionId, unassignedTitle);
	const marketDayId = await createMarketDay(page, marketDayName);
	await page.goto('/statistics');
	const grossBefore = await readCardCents(page, 'statistics-card-0');
	const expensesBefore = Math.abs(await readCardCents(page, 'statistics-card-1'));
	const netBefore = await readCardCents(page, 'statistics-card-2');
	const fleaMarketBefore = await readBucketCents(page, 'statistics-channels', 'Flohmarkt');
	const shopBefore = await readBucketCents(page, 'statistics-channels', 'Laden');
	const householdBefore = await readBucketCents(page, 'statistics-categories', 'Haushalt');
	const unassignedBefore = await readBucketCents(page, 'statistics-market-days', 'Ohne Markttag');
	await postAction(page, `/items/${assignedItemId}?/markItemSold`, {
		itemId: assignedItemId,
		channel: 'flea-market',
		proceedsEuros: assignedSaleEuros,
		marketDayId
	});
	await postAction(page, `/items/${unassignedItemId}?/markItemSold`, {
		itemId: unassignedItemId,
		channel: 'shop',
		proceedsEuros: unassignedSaleEuros
	});
	await postAction(page, `/market-days/${marketDayId}?/createExpense`, {
		marketDayId,
		label: 'Standgebühr',
		category: 'fee',
		amountEuros: expenseEuros,
		expenseDate: '2026-10-17'
	});

	// act — read the statistics page again
	await page.goto('/statistics');

	// assume — the totals grew by exactly the two sales and the expense
	const grossAfter = await readCardCents(page, 'statistics-card-0');
	const expensesAfter = Math.abs(await readCardCents(page, 'statistics-card-1'));
	const netAfter = await readCardCents(page, 'statistics-card-2');
	const assignedCents = centsFromLabel(assignedSaleEuros);
	const unassignedCents = centsFromLabel(unassignedSaleEuros);
	expect(grossAfter - grossBefore).toBe(assignedCents + unassignedCents);
	expect(expensesAfter - expensesBefore).toBe(centsFromLabel(expenseEuros));
	expect(netAfter - netBefore).toBe(assignedCents + unassignedCents - centsFromLabel(expenseEuros));

	// assume — every breakdown grew by exactly the sale it belongs to
	expect((await readBucketCents(page, 'statistics-channels', 'Flohmarkt')) - fleaMarketBefore).toBe(
		assignedCents
	);
	expect((await readBucketCents(page, 'statistics-channels', 'Laden')) - shopBefore).toBe(
		unassignedCents
	);
	expect((await readBucketCents(page, 'statistics-categories', 'Haushalt')) - householdBefore).toBe(
		assignedCents + unassignedCents
	);

	// assume — the day breakdown names the market day and keeps the sale without one apart
	await expect(page.getByTestId('statistics-market-days')).toContainText(marketDayName);
	expect(
		(await readBucketCents(page, 'statistics-market-days', 'Ohne Markttag')) - unassignedBefore
	).toBe(unassignedCents);

	// assume — a period without activity shows nothing
	await page.goto('/statistics?from=2000-01-01&to=2000-01-31');
	await expect(page.getByTestId('statistics-empty')).toBeVisible();

	// act — correct the assigned sale back to open
	await page.goto(`/items/${assignedItemId}`);
	await page.getByTestId('unmark-item-sold').click();
	await expect(page.getByTestId('item-sale-section')).toBeVisible();

	// assume — the sale is gone from the history and from the market-day detail
	await page.goto('/sales');
	await expect(
		page.getByTestId('sale-history-item').filter({ hasText: assignedTitle })
	).toHaveCount(0);
	await expect(
		page.getByTestId('sale-history-item').filter({ hasText: unassignedTitle })
	).toHaveCount(1);
	await page.goto(`/market-days/${marketDayId}`);
	await expect(page.getByTestId('market-day-sale-item')).toHaveCount(0);

	// assume — the statistics shrink by exactly the corrected sale
	await page.goto('/statistics');
	const grossAfterCorrection = await readCardCents(page, 'statistics-card-0');
	const netAfterCorrection = await readCardCents(page, 'statistics-card-2');
	expect(grossAfter - grossAfterCorrection).toBe(assignedCents);
	expect(netAfter - netAfterCorrection).toBe(assignedCents);
	await expect(page.getByTestId('statistics-market-days')).not.toContainText(marketDayName);
	expect(
		(await readBucketCents(page, 'statistics-market-days', 'Ohne Markttag')) - unassignedBefore
	).toBe(unassignedCents);
});
