import { expect, test } from '@playwright/test';

import { salesAccount } from './sales-instance-account';

/**
 * The stand-location proof runs on the sales instance: it needs market days, and the shared
 * instance must keep its market-day counts for the other specs. Each run removes the market days
 * of previous runs first, so the released day under test is always the only released day there is.
 */

/** Every market day of this proof carries this prefix, so leftovers are recognizable. */
const probeNamePrefix = 'Standortprobe';

/** A date far enough in the future that the "next released market day" is always this one. */
const probeDate = '2027-06-05';

/** The position the browser reports while the proof runs. */
const reportedPosition = { latitude: 52.5145, longitude: 13.3501 };

test.use({
	geolocation: reportedPosition,
	permissions: ['geolocation']
});

/**
 * Sign in with the account the sales proofs share, registering it on a fresh instance.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @returns {Promise<void>} Resolves once the owner is signed in.
 */
async function signIn(page) {
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
		}, salesAccount);
		await page.goto('/');
	} else {
		const loginForm = page.locator('form[action="?/login"]');
		await loginForm.getByLabel('Benutzername').fill(salesAccount.username);
		await loginForm.getByLabel('Passwort').fill(salesAccount.password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();
	}
	await page.waitForSelector('[data-testid="profile-avatar-link"]', { timeout: 20_000 });
}

/**
 * Post one form action from inside the signed-in page and return its JSON result.
 *
 * @param {import('@playwright/test').Page} page - Page of the signed-in owner.
 * @param {string} actionPath - Path and action name, e.g. `/market-days?/createMarketDay`.
 * @param {Record<string, string>} values - The form values.
 * @returns {Promise<void>} Resolves once the action succeeded.
 */
async function postAction(page, actionPath, values) {
	const result = await page.evaluate(
		async ({ actionPath: path, values: formValues }) => {
			const response = await fetch(path, {
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
	const parsed: { type?: string; data?: unknown } = JSON.parse(result.body);
	if (parsed.type === 'failure') {
		throw new Error(`${actionPath} failed: ${JSON.stringify(parsed.data)}`);
	}
}

/**
 * Make sure the active collection exists and is published for buyers.
 *
 * @param {import('@playwright/test').Page} page - Page of the signed-in owner.
 * @returns {Promise<void>} Resolves once the stand page is reachable.
 */
async function ensurePublishedCollection(page) {
	await page.goto('/');
	if ((await page.locator('input[name="collectionId"]').count()) === 0) {
		await postAction(page, '/?/createCollection', { collectionName: 'Flohmarkt' });
	}
	await page.goto('/profile');
	const publicationStatus = page.getByTestId('stand-publication-status');
	await expect(publicationStatus).toBeVisible();
	if (!(await publicationStatus.textContent())?.includes('ist veröffentlicht')) {
		await page.getByTestId('toggle-stand-publication').click();
		await expect(publicationStatus).toContainText('ist veröffentlicht');
	}
}

/**
 * List the market days this proof created in earlier runs.
 *
 * @param {import('@playwright/test').Page} page - Page of the signed-in owner.
 * @returns {Promise<{ id: string }[]>} Leftover probe days.
 */
async function listProbeDays(page) {
	await page.goto('/market-days');
	// Filter by text instead of reading textContent: the card markup starts with whitespace, so a
	// prefix check on the raw text silently finds nothing and leaves released days behind.
	const cards = page.getByTestId('market-day-item').filter({ hasText: probeNamePrefix });
	const leftovers: { id: string }[] = [];
	for (const card of await cards.all()) {
		const href = await card.getAttribute('href');
		const id = href?.split('/').pop();
		if (id) {
			leftovers.push({ id });
		}
	}
	return leftovers;
}

/**
 * Delete one market day.
 *
 * @param {import('@playwright/test').Page} page - Page of the signed-in owner.
 * @param {string} marketDayId - The day to remove.
 * @returns {Promise<void>} Resolves once the day is gone.
 */
async function deleteMarketDay(page, marketDayId) {
	await postAction(page, `/market-days/${marketDayId}?/deleteMarketDay`, {
		marketDayId,
		returnTo: '/market-days'
	});
}

/**
 * Create the probe market day without a position.
 *
 * @param {import('@playwright/test').Page} page - Page of the signed-in owner.
 * @param {string} name - Unique name of the day.
 * @returns {Promise<string>} The id of the created day.
 */
async function createProbeDay(page, name) {
	await postAction(page, '/market-days?/createMarketDay', {
		name,
		date: probeDate,
		startTime: '09:00',
		endTime: '15:00',
		location: 'Moorweg 7',
		notes: ''
	});
	await page.goto('/market-days');
	const card = page.getByTestId('market-day-item').filter({ hasText: name }).first();
	const href = await card.getAttribute('href');
	const id = href?.split('/').pop();
	if (!id) {
		throw new Error(`the created market day carries no id: ${href}`);
	}
	return id;
}

test('reveals a released stand position on the public stand page and hides it again', async ({
	page
}) => {
	// arrange — sign in, make sure the stand page is reachable, and clear earlier runs
	await signIn(page);
	await ensurePublishedCollection(page);
	for (const leftover of await listProbeDays(page)) {
		await deleteMarketDay(page, leftover.id);
	}
	const attemptSuffix = Date.now().toString().slice(-6);
	const marketDayName = `${probeNamePrefix} ${attemptSuffix}`;
	const marketDayId = await createProbeDay(page, marketDayName);
	const standHref = await page
		.goto('/profile')
		.then(() => page.getByTestId('open-stand-link').getAttribute('href'));
	if (!standHref) {
		throw new Error('the profile page carries no stand link');
	}

	// act — before the release the stand page carries no position at all. The count is read right
	// here: a locator re-resolves on every assertion, so keeping the locator and asserting after
	// the release would measure the state after the release.
	const standPage = await page.context().newPage();
	// The HTML of the stand page carries an ETag but no cache-control, so a cached copy would hide
	// the state change that this proof asserts.
	const standPageCdp = await standPage.context().newCDPSession(standPage);
	await standPageCdp.send('Network.setCacheDisabled', { cacheDisabled: true });
	await standPage.goto(standHref);
	await expect(standPage.getByTestId('stand-title')).toBeVisible();
	const locationBeforeRelease = await standPage.getByTestId('stand-location').count();

	// act — the owner takes the position with the device button and releases it
	await page.goto(`/market-days/${marketDayId}`);
	await page.getByTestId('market-days-edit-trigger').click();
	const dialog = page.getByTestId('market-days-edit-dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByTestId('market-day-use-position').click();
	await expect(dialog.getByTestId('market-day-latitude')).toHaveValue(
		String(reportedPosition.latitude)
	);
	await expect(dialog.getByTestId('market-day-longitude')).toHaveValue(
		String(reportedPosition.longitude)
	);
	await expect(dialog.getByTestId('market-day-position-hint')).toContainText('Position übernommen');
	await expect(dialog.getByTestId('market-day-position-preview')).toHaveAttribute(
		'src',
		/openstreetmap\.org\/export\/embed\.html\?bbox=/
	);
	await dialog.getByTestId('market-day-location-released').check();
	await dialog.getByRole('button', { name: 'Änderungen speichern' }).click();
	await expect(page).toHaveURL(new RegExp(`/market-days/${marketDayId}`));

	// act — the released position reaches the public stand page
	await standPage.goto(standHref);
	const locationAfterRelease = standPage.getByTestId('stand-location');

	// assume
	expect(locationBeforeRelease).toBe(0);
	await expect(locationAfterRelease).toBeVisible();
	await expect(standPage.getByTestId('stand-location-when')).toContainText(marketDayName);
	await expect(standPage.getByTestId('stand-location-when')).toContainText('Moorweg 7');
	await expect(standPage.getByTestId('stand-location-map')).toHaveCount(0);
	await expect(standPage.getByTestId('stand-location-open-map')).toHaveAttribute(
		'href',
		new RegExp(`mlat=${reportedPosition.latitude}.*mlon=${reportedPosition.longitude}`)
	);

	// act — the map is loaded only when the visitor asks for it
	await standPage.getByTestId('stand-location-load-map').click();

	// assume
	await expect(standPage.getByTestId('stand-location-map')).toHaveAttribute(
		'src',
		/marker=52\.5145,13\.3501/
	);

	// act — the owner takes the release back
	await postAction(page, `/market-days/${marketDayId}?/updateMarketDay`, {
		marketDayId,
		returnTo: `/market-days/${marketDayId}`,
		name: marketDayName,
		date: probeDate,
		startTime: '09:00',
		endTime: '15:00',
		location: 'Moorweg 7',
		latitude: String(reportedPosition.latitude),
		longitude: String(reportedPosition.longitude),
		notes: ''
	});
	await standPage.goto(standHref);

	// assume — the position disappears again
	await expect(standPage.getByTestId('stand-location')).toHaveCount(0);

	// tidy up so the next run starts from the same state
	await deleteMarketDay(page, marketDayId);
	await standPage.close();
});
