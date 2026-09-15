import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';
import { fixtureArchive, fixtureUser } from '../src/lib/server/exchange-fixture.test-helper';

/**
 * Build a valid exchange archive with two users for the takeover smoke test.
 *
 * @returns {Buffer} Archive bytes.
 */
function buildExchangeArchive(): Buffer {
	return fixtureArchive([
		fixtureUser({
			sourceId: 'u1',
			username: 'avery',
			displayName: 'Avery',
			items: 2,
			published: true
		}),
		fixtureUser({ sourceId: 'u2', username: 'blake', displayName: 'Blake', items: 1 })
	]);
}

/**
 * Build an archive whose content no longer matches its recorded checksum.
 *
 * @returns {Buffer} Tampered archive bytes.
 */
function buildTamperedArchive(): Buffer {
	const tampered = Buffer.from(buildExchangeArchive());
	const marker = Buffer.from('image-bytes');
	const offset = tampered.indexOf(marker);
	if (offset >= 0) {
		tampered[offset] = 'X'.charCodeAt(0);
	}
	return tampered;
}

/**
 * Upload an archive through the first-run import dialog.
 *
 * @param {import('@playwright/test').Page} page - Browser page.
 * @param {Buffer} archive - Archive bytes to upload.
 * @param {string} name - File name shown to the browser.
 * @returns {Promise<void>} Resolves once the upload was submitted.
 */
async function submitArchive(
	page: import('@playwright/test').Page,
	archive: Buffer,
	name: string
): Promise<void> {
	await page.setInputFiles('[data-testid="import-input"]', {
		buffer: archive,
		mimeType: 'application/zip',
		name
	});
	await page.getByRole('button', { name: 'Import vorbereiten' }).click();
}

// One test on purpose: the takeover may only run while the instance has no accounts, so the
// refusals must be exercised before a successful import creates the first admin.
test('takes over an empty instance from an exchange archive, refusing bad archives first', async ({
	page
}) => {
	await page.goto('/');

	// The first-run surface offers the takeover next to registration.
	await expect(page.getByRole('heading', { name: 'Bestand übernehmen' })).toBeVisible();
	await expect(page.locator('form[action="?/register"]')).toBeVisible();

	// A file that is not a container is refused and changes nothing.
	await submitArchive(page, Buffer.from('this is not a zip archive at all'), 'broken.zip');
	await expect(page.locator('[data-testid="import-panel"] [role="alert"]')).toBeVisible();
	await expect(page.locator('[data-testid="import-report"]')).toHaveCount(0);
	await expect(page.locator('form[action="?/register"]')).toBeVisible();

	// A tampered payload is refused as well.
	await submitArchive(page, buildTamperedArchive(), 'exchange.zip');
	await expect(page.locator('[data-testid="import-panel"] [role="alert"]')).toBeVisible();
	await expect(page.locator('[data-testid="import-report"]')).toHaveCount(0);

	// A valid archive produces the validation report.
	await submitArchive(page, buildExchangeArchive(), 'exchange.zip');
	await expect(page.locator('[data-testid="import-report"]')).toBeVisible();
	await expect(page.locator('[data-testid="import-report"]')).toContainText('avery');
	await expect(page.locator('[data-testid="import-report"]')).toContainText('blake');
	await expect(page.locator('[data-testid="import-report"]')).toContainText('vollständig');

	// Activation requires exactly one administrator choice.
	const activate = page.getByRole('button', { name: 'Import aktivieren' });
	await expect(activate).toBeDisabled();
	await page.locator('input[name="adminUsername"][value="blake"]').check();
	await expect(activate).toBeEnabled();
	await page.getByLabel('Neues Passwort für diesen Zugang').fill('a-freshly-chosen-passphrase');
	await activate.click();

	// The takeover dialog is gone and the login form is offered instead.
	await expect(page.locator('[data-testid="import-panel"]')).toHaveCount(0);
	await expect(page.locator('form[action="?/login"]')).toBeVisible();

	// The chosen administrator can sign in with the freshly set password.
	await page.getByLabel('Benutzername').fill('blake');
	await page.getByLabel('Passwort').fill('a-freshly-chosen-passphrase');
	await page.getByRole('button', { name: 'Anmelden' }).click();

	// The imported content is visible, and the count proves tenant isolation: blake took over exactly
	// his own single item, not the three items the archive contains in total.
	await expect(page.locator('body')).toContainText('Item 1');
	await expect(page.locator('body')).toContainText('Portfolio (1)');
});
