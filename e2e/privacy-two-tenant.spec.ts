import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';
import { fixtureArchive, fixtureUser } from '../src/lib/server/exchange-fixture.test-helper';
import { hashPassword } from '$lib/server/password';

/**
 * The password avery keeps from the archive, so the non-admin user can sign in as well.
 *
 * The import carries over a native password hash, which is what makes two independent sessions
 * possible at all: a user whose hash cannot be carried over is flagged for a reset and cannot log
 * in, so the isolation proof would have nothing to compare against.
 */
const averyArchivePassword = 'avery-carried-over-passphrase';

/** The password the instance administrator chooses during activation. */
const blakeChosenPassword = 'blake-freshly-chosen-passphrase';

/**
 * Build an archive with two users, each with their own items, one of each sold.
 *
 * @param {string | null} averyPasswordHash - Native hash carried over for the non-admin user.
 * @returns {Buffer} Archive bytes.
 */
function buildTwoUserArchive(averyPasswordHash: string | null): Buffer {
	return fixtureArchive([
		fixtureUser({
			sourceId: 'u1',
			username: 'avery',
			displayName: 'Avery',
			passwordHash: averyPasswordHash,
			items: 2,
			soldItems: 1
		}),
		fixtureUser({
			sourceId: 'u2',
			username: 'blake',
			displayName: 'Blake',
			items: 2,
			soldItems: 1,
			published: true
		})
	]);
}

/**
 * Sign in through the login form.
 *
 * @param {import('@playwright/test').Page} page - Browser page on the login form.
 * @param {string} username - Account name.
 * @param {string} password - Account password.
 * @returns {Promise<void>} Resolves once the portfolio is rendered.
 */
async function signIn(
	page: import('@playwright/test').Page,
	username: string,
	password: string
): Promise<void> {
	await page.getByLabel('Benutzername').fill(username);
	await page.getByLabel('Passwort').fill(password);
	await page.getByRole('button', { name: 'Anmelden' }).click();
	await expect(page.getByTestId('item-card').first()).toBeVisible();
}

/**
 * Read the item count the portfolio header reports.
 *
 * @param {import('@playwright/test').Page} page - Signed-in page.
 * @returns {Promise<string>} The header count text, for example `(2)`.
 */
async function portfolioCount(page: import('@playwright/test').Page): Promise<string> {
	// The header carries an eyebrow paragraph inside a wrapper; the count is the section's own child.
	return (await page.locator('.collection-header > p').first().textContent())?.trim() ?? '';
}

/**
 * Follow the first item card and return its internal detail path.
 *
 * @param {import('@playwright/test').Page} page - Signed-in page.
 * @returns {Promise<string>} The item detail path.
 */
async function firstItemPath(page: import('@playwright/test').Page): Promise<string> {
	await page.getByTestId('item-card').first().click();
	await page.waitForURL(/\/items\//);
	return new URL(page.url()).pathname;
}

// One test on purpose: the takeover may only run while the instance has no accounts, so both
// logins and every cross-tenant probe must happen after the single successful import.
test('keeps two imported tenants apart and gives the instance admin no foreign data', async ({
	page,
	browser
}) => {
	// arrange — an empty instance takes over an archive with two users, each with their own items.
	// A retry runs against the same instance, which by then already holds both accounts, so the
	// takeover is skipped and the two tenants below are reused instead.
	await page.goto('/');
	const takeoverOffered = await page
		.getByRole('heading', { name: 'Bestand übernehmen' })
		.isVisible()
		.catch(() => false);
	if (takeoverOffered) {
		await page.setInputFiles('[data-testid="import-input"]', {
			buffer: buildTwoUserArchive(await hashPassword(averyArchivePassword)),
			mimeType: 'application/zip',
			name: 'exchange.zip'
		});
		await page.getByRole('button', { name: 'Import vorbereiten' }).click();
		await expect(page.locator('[data-testid="import-report"]')).toBeVisible();

		// act — blake becomes the instance administrator with a password chosen here
		await page.locator('input[name="adminUsername"][value="blake"]').check();
		await page.getByLabel('Neues Passwort für diesen Zugang').fill(blakeChosenPassword);
		await page.getByRole('button', { name: 'Import aktivieren' }).click();

		// assume — the takeover is complete and the instance now needs a login
		await expect(page.locator('[data-testid="import-panel"]')).toHaveCount(0);
	}
	await expect(page.locator('form[action="?/login"]')).toBeVisible();

	// act — the administrator signs in
	await signIn(page, 'blake', blakeChosenPassword);

	// assume — the administrator sees his own two imported items and never the four the archive
	// holds in total
	await expect(page.getByTestId('item-card')).toHaveCount(2);
	expect(await portfolioCount(page)).toBe('(2)');
	const blakeItemPath = await firstItemPath(page);

	// act — the administration surface is requested by the instance administrator
	const adminResponse = await page.request.get('/admin');

	// assume — instance administration is reachable for him
	expect(adminResponse.status()).toBe(200);

	// act — a second, independent tenant signs in with the password carried over from the archive
	const averyContext = await browser.newContext();
	const averyPage = await averyContext.newPage();
	await averyPage.goto('/');
	await signIn(averyPage, 'avery', averyArchivePassword);

	// assume — avery sees exactly his own two items and none of blake's
	await expect(averyPage.getByTestId('item-card')).toHaveCount(2);
	expect(await portfolioCount(averyPage)).toBe('(2)');
	const averyItemPath = await firstItemPath(averyPage);
	expect(averyItemPath).not.toBe(blakeItemPath);

	// act — avery asks for blake's item by its real internal id
	const foreignItemForAvery = await averyPage.request.get(blakeItemPath);

	// assume — a foreign id is a 404, not a page carrying another tenant's data
	expect(foreignItemForAvery.status()).toBe(404);

	// act — and the same request in the other direction
	const foreignItemForBlake = await page.request.get(averyItemPath);

	// assume — the instance administrator is no exception in normal views: still a 404
	expect(foreignItemForBlake.status()).toBe(404);

	// act — the administration surface is requested by the ordinary tenant
	const adminForAvery = await averyPage.request.get('/admin', { maxRedirects: 0 });

	// assume — he is redirected away instead of being served administration data
	expect(adminForAvery.status()).toBe(303);
	expect(adminForAvery.headers()['location']).toBe('/');

	// act — unknown public identifiers are requested from a signed-in tenant
	const unknownCollection = await averyPage.request.get(
		'/stand/00000000-0000-0000-0000-000000000000'
	);
	const unknownItem = await averyPage.request.get(
		'/stand/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000001'
	);

	// assume — nothing can be enumerated blindly
	expect(unknownCollection.status()).toBe(404);
	expect(unknownItem.status()).toBe(404);

	await averyContext.close();
});
