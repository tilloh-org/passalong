import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

const marketDayNamePrefix = 'Flohmarkt am See';
const emptyDayNamePrefix = 'Leerer Stand';
const firstSaleProceedsEuros = '5,00';
const formulaSaleProceedsEuros = '3,00';
const standFeeEuros = '15,00';
const expectedProceeds = '8,00';
const expectedExpenses = '-15,00';
const expectedNet = '-7,00';
const saleTimePattern = '\\d{2}\\.\\d{2}\\.\\d{4} \\d{2}:\\d{2}';

/**
 * Sign the owner in, registering the first account of the fresh instance if it is still empty.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @returns {Promise<void>} Resolves once the owner is signed in.
 */
async function signInOnFreshInstance(page) {
	const account = {
		username: 'csvexport',
		displayName: 'CSV Export',
		password: 'correct-horse-battery-staple'
	};
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
 * @returns {Promise<import('@playwright/test').APIResponse>} The action result as JSON.
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
	const dayCard = page.getByTestId('market-day-item').filter({ hasText: name }).first();
	const marketDayPath = await dayCard.getAttribute('href');
	const marketDayId = marketDayPath?.split('/').pop();
	if (!marketDayId) {
		throw new Error(`the created market day carries no id: ${marketDayPath}`);
	}
	return marketDayId;
}

/**
 * Sell one item at a market day with a fixed proceeds value.
 *
 * @param {import('@playwright/test').Page} page - Page of the signed-in owner.
 * @param {string} itemId - The item to sell.
 * @param {string} marketDayId - The market day the sale belongs to.
 * @param {string} proceedsEuros - The proceeds as typed into the sale form.
 * @returns {Promise<void>} Resolves once the sale is recorded.
 */
async function sellItemAtMarketDay(page, itemId, marketDayId, proceedsEuros) {
	await postAction(page, `/items/${itemId}?/markItemSold`, {
		itemId,
		channel: 'flea-market',
		proceedsEuros,
		marketDayId
	});
}

test('downloads the reconciliation of one market day as CSV', async ({ page }) => {
	// arrange — one owner, two sold items, a market day of its own and a stand fee
	await signInOnFreshInstance(page);
	const collectionId = await ensureCollection(page);
	const attemptSuffix = Date.now().toString().slice(-6);
	const marketDayName = `${marketDayNamePrefix} ${attemptSuffix}`;
	const firstSaleTitle = `Zimmerbrunnen ${attemptSuffix}`;
	const formulaSaleTitle = `=1+1 ${attemptSuffix}`;
	const firstItemId = await createItem(page, collectionId, firstSaleTitle);
	const formulaItemId = await createItem(page, collectionId, formulaSaleTitle);
	const marketDayId = await createMarketDay(page, marketDayName);
	await sellItemAtMarketDay(page, firstItemId, marketDayId, firstSaleProceedsEuros);
	await sellItemAtMarketDay(page, formulaItemId, marketDayId, formulaSaleProceedsEuros);
	await postAction(page, `/market-days/${marketDayId}?/createExpense`, {
		marketDayId,
		label: 'Standgebühr',
		category: 'fee',
		amountEuros: standFeeEuros,
		expenseDate: '2026-10-17'
	});

	// act — open the day and download its reconciliation
	await page.goto(`/market-days/${marketDayId}`);
	await expect(page.getByTestId('market-day-csv-download')).toBeVisible();
	const download = await page.request.get(`/market-days/${marketDayId}/reconciliation.csv`);

	// assume — the file is a CSV attachment named after the day
	expect(download.status()).toBe(200);
	expect(download.headers()['content-type']).toContain('text/csv');
	expect(download.headers()['content-disposition']).toContain('abrechnung-flohmarkt-am-see');
	expect(download.headers()['content-disposition']).toContain('.csv');

	// assume — one row per sale, then the totals of the day
	const rows = (await download.text()).split('\r\n').filter(Boolean);
	expect(rows).toHaveLength(6);
	expect(rows[0]).toBe('Zeit,Artikel,Preis (€)');
	const saleRows = rows.slice(1, 3).sort();
	expect(saleRows[0]).toMatch(new RegExp(`^${saleTimePattern},'=1\\+1 ${attemptSuffix},"3,00"$`));
	expect(saleRows[1]).toMatch(new RegExp(`^${saleTimePattern},${firstSaleTitle},"5,00"$`));
	expect(rows[3]).toBe(`,Summe,"${expectedProceeds}"`);
	expect(rows[4]).toBe(`,Ausgaben,"${expectedExpenses}"`);
	expect(rows[5]).toBe(`,Netto,"${expectedNet}"`);

	// assume — an anonymous visitor is sent to the start page without any file
	const anonymousContext = await page.context().browser()?.newContext();
	const anonymousResponse = await anonymousContext?.request.get(
		new URL(`/market-days/${marketDayId}/reconciliation.csv`, page.url()).toString()
	);
	expect(new URL(anonymousResponse?.url() ?? page.url()).pathname).toBe('/');
	expect(await anonymousResponse?.text()).not.toContain('Artikel');
	await anonymousContext?.close();

	// assume — an unknown market day answers 404 instead of an empty file
	const unknownDay = await page.request.get('/market-days/unknown-market-day/reconciliation.csv');
	expect(unknownDay.status()).toBe(404);

	// assume — a day without sales offers no download
	const emptyDayId = await createMarketDay(page, `${emptyDayNamePrefix} ${attemptSuffix}`);
	await page.goto(`/market-days/${emptyDayId}`);
	await expect(page.getByTestId('market-day-csv-download')).toHaveCount(0);
});
