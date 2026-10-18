import { expect, test } from '@playwright/test';
import { rmSync, writeFileSync } from 'node:fs';

import {
	restoreInstanceAccount,
	restoreInstanceMaintenanceMarker as maintenanceMarkerPath
} from './restore-instance';

test.setTimeout(180_000);

/**
 * Sign the restore account in, registering it when the instance is still empty.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @returns {Promise<void>} Resolves once the account is signed in.
 */
async function signInOnFreshInstance(page) {
	await page.goto('/');
	// Wait for whichever state the instance is in: isVisible() alone does not wait, so a check
	// right after the navigation can pick the login branch on an instance that still needs its
	// first account.
	await page
		.locator('form[action="?/register"], [data-testid="profile-avatar-link"]')
		.first()
		.waitFor({ state: 'visible', timeout: 20_000 });
	const onboardingVisible = (await page.locator('form[action="?/register"]').count()) > 0;
	if (onboardingVisible) {
		// The first registration signs the account in, so there is no login form to fill.
		await page.evaluate(async (registration) => {
			await fetch('/?/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams(registration),
				redirect: 'manual'
			});
		}, restoreInstanceAccount);
		// A plain navigation back to "/" can be served from the browser cache (the HTML carries an
		// ETag but no cache-control), so this waits on the profile page instead.
		await page.goto('/profile');
		await page.waitForSelector('[data-testid="profile-avatar-link"]', { timeout: 20_000 });
		return;
	}
	await signIn(page);
}

/**
 * Sign in with the restore account.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @returns {Promise<void>} Resolves once the owner is signed in.
 */
async function signIn(page) {
	await page.goto('/');
	const loginForm = page.locator('form[action="?/login"]');
	await loginForm.getByLabel('Benutzername').fill(restoreInstanceAccount.username);
	await loginForm.getByLabel('Passwort').fill(restoreInstanceAccount.password);
	await loginForm.getByRole('button', { name: 'Anmelden' }).click();
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
 * @returns {Promise<{ location?: string }>} The action result.
 */
async function postAction(page, actionPath, values) {
	const body = await page.evaluate(
		async ({ actionPath, values: formValues }) => {
			const response = await fetch(actionPath, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams(formValues),
				redirect: 'manual'
			});
			return response.text();
		},
		{ actionPath, values }
	);
	const parsed: { type?: string; data?: unknown; location?: string } = JSON.parse(body);
	if (parsed.type === 'failure') {
		throw new Error(`${actionPath} failed: ${JSON.stringify(parsed.data)}`);
	}
	return parsed;
}

/**
 * Create one item in the active collection.
 *
 * @param {import('@playwright/test').Page} page - Page of the signed-in owner.
 * @param {string} collectionId - The collection the item belongs to.
 * @param {string} title - The item title.
 * @returns {Promise<void>} Resolves once the item exists.
 */
async function createItem(page, collectionId, title) {
	await postAction(page, '/?/addItem', {
		collectionId,
		title,
		priceEuros: '12,00',
		category: 'home',
		condition: 'good'
	});
}

test('closes the instance during a restore, drops the old sessions and brings the data back', async ({
	page,
	browser
}) => {
	// arrange — an administrator with a collection, an item and a public stand
	await signInOnFreshInstance(page);
	const attemptSuffix = Date.now().toString().slice(-6);
	const restoredItemTitle = `Zimmerbrunnen ${attemptSuffix}`;
	const laterItemTitle = `Nach der Sicherung ${attemptSuffix}`;
	const collectionId = await ensureCollection(page);
	await createItem(page, collectionId, restoredItemTitle);
	// act — the public stand page of this instance opens only once the collection is published
	const publicationResponse = await page.request.post('/profile?/setCollectionPublication', {
		form: { collectionId, published: 'true' },
		headers: { Origin: 'http://localhost:4179' }
	});
	expect(publicationResponse.status()).toBe(200);
	await page.goto('/');
	const standPath = await page.getByTestId('nav-stand-link').getAttribute('href');

	// act — the administrator downloads the backup of this state
	const backupResponse = await page.request.get('/profile/backup');
	expect(backupResponse.status()).toBe(200);
	const backupArchive = await backupResponse.body();

	// act — the instance moves on after the backup
	await createItem(page, collectionId, laterItemTitle);

	// act — a maintenance window closes the instance to everyone but the administration
	writeFileSync(
		maintenanceMarkerPath,
		JSON.stringify({ startedAt: new Date().toISOString(), reason: 'restore' })
	);
	const blockedResponse = await page.request.get('/market-days');
	const blockedBody = await blockedResponse.text();
	const signInPageResponse = await page.request.get('/');
	const signInPageStatus = signInPageResponse.status();
	rmSync(maintenanceMarkerPath, { force: true });

	// assume — normal pages answer with the maintenance page, sign-in and administration stay open
	expect(blockedResponse.status()).toBe(503);
	expect(blockedBody).toContain('Kurze Wartung');
	expect(signInPageStatus).toBe(200);
	expect((await page.request.get('/market-days')).status()).toBe(200);

	// act — restore the downloaded backup through the administration
	await page.goto('/admin');
	await page.getByTestId('restore-input').setInputFiles({
		name: 'passalong-backup.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(backupArchive)
	});
	await page.getByTestId('restore-submit').click();

	// assume — the session of the backup is revoked, so the administrator is signed out
	await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
	await page.goto('/market-days');
	await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();

	// act — the administrator signs in again
	await signIn(page);

	// assume — the restored state is live: the item of the backup is back, the later one is gone
	await page.goto('/');
	await expect(page.getByTestId('item-card').filter({ hasText: restoredItemTitle })).toHaveCount(1);
	await expect(page.getByTestId('item-card').filter({ hasText: laterItemTitle })).toHaveCount(0);

	// assume — the public stand of the restored collection still serves buyers
	const anonymousContext = await browser.newContext();
	const anonymousPage = await anonymousContext.newPage();
	const standResponse = await anonymousPage.request.get(standPath ?? '');
	expect(standResponse.status()).toBe(200);
	await anonymousPage.goto(standPath ?? '');
	await expect(
		anonymousPage.getByTestId('stand-item').filter({ hasText: restoredItemTitle })
	).toHaveCount(1);
	await anonymousContext.close();
});
