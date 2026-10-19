import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import {
	referenceAdminUsername,
	referenceArchivePath,
	referenceIncompatibleUsername,
	referenceLegacyPassword,
	referenceLegacyUsername
} from '../src/lib/exchange-reference';
import { parseZip } from '../src/lib/server/backup';
import { DATA_ENTRY_NAME, type ExchangeData } from '../src/lib/server/exchange-format';

/**
 * The takeover instance of the `instance-takeover` Playwright project (see `playwright.config.ts`).
 * The proof reads the stored hashes from it, because a rehash is not visible in the browser.
 */
const takeoverDatabasePath = '/tmp/passalong-e2e-takeover.sqlite';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const archivePath = join(repositoryRoot, referenceArchivePath);

/**
 * Read one entry of the stored-only reference archive.
 *
 * @param {Buffer} archive - Archive bytes.
 * @param {string} name - Entry name.
 * @returns {Buffer} Entry payload.
 */
function readEntry(archive: Buffer, name: string): Buffer {
	const entry = parseZip(archive).get(name);
	if (!entry) {
		throw new Error(`The reference archive has no entry ${name}.`);
	}
	return archive.subarray(entry.payloadOffset, entry.payloadOffset + entry.size);
}

/**
 * Read the logical content of the reference archive.
 *
 * @param {Buffer} archive - Archive bytes.
 * @returns {ExchangeData} Archive content.
 */
function readArchiveData(archive: Buffer): ExchangeData {
	return JSON.parse(readEntry(archive, DATA_ENTRY_NAME).toString('utf8')) as ExchangeData;
}

/**
 * Flip one byte inside the payload of a media entry, leaving the file structure intact.
 *
 * @param {Buffer} archive - Archive bytes.
 * @param {string} name - Media entry to damage.
 * @returns {Buffer} Tampered archive bytes.
 */
function tamperMediaEntry(archive: Buffer, name: string): Buffer {
	const entry = parseZip(archive).get(name);
	if (!entry) {
		throw new Error(`The reference archive has no entry ${name}.`);
	}
	const tampered = Buffer.from(archive);
	tampered[entry.payloadOffset + Math.floor(entry.size / 2)] ^= 0xff;
	return tampered;
}

/**
 * Read the stored password hash of one account.
 *
 * @param {string} username - Account username.
 * @returns {string | null} Stored hash.
 */
function readStoredHash(username: string): string | null {
	const database = new Database(takeoverDatabasePath, { readonly: true });
	const row = database
		.prepare('SELECT password_hash FROM users WHERE username = ?')
		.get(username) as { password_hash: string | null } | undefined;
	database.close();
	return row?.password_hash ?? null;
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

/**
 * Sign in through the login form and wait for the portfolio.
 *
 * @param {import('@playwright/test').Page} page - Browser page.
 * @param {string} username - Account username.
 * @param {string} password - Account password.
 * @returns {Promise<void>} Resolves once the portfolio is shown.
 */
async function signIn(
	page: import('@playwright/test').Page,
	username: string,
	password: string
): Promise<void> {
	const loginForm = page.locator('form[action="?/login"]');
	await loginForm.getByLabel('Benutzername').fill(username);
	await loginForm.getByLabel('Passwort').fill(password);
	await loginForm.getByRole('button', { name: 'Anmelden' }).click();
}

/**
 * Sign the current account out through the profile page.
 *
 * @param {import('@playwright/test').Page} page - Browser page.
 * @returns {Promise<void>} Resolves once the login form is back.
 */
async function signOut(page: import('@playwright/test').Page): Promise<void> {
	await page.getByTestId('profile-avatar-link').click();
	await expect(page).toHaveURL(/\/profile/);
	await page.getByTestId('profile-logout').click();
	await expect(page.locator('form[action="?/login"]')).toBeVisible();
}

// One test on purpose: the takeover may only run while the instance has no accounts, so the
// refusals must be exercised before a successful import creates the first admin.
test('takes over an empty instance from the committed reference archive', async ({ page }) => {
	// arrange — the committed archive a producer would hand over, not one built inside this test
	const archive = readFileSync(archivePath);
	const archiveData = readArchiveData(archive);
	const importedLegacyHash = archiveData.users.find(
		(user) => user.username === referenceLegacyUsername
	)?.passwordHash;
	const administratorPassword = 'a-freshly-chosen-passphrase';

	await page.goto('/');

	// The first-run surface offers the takeover next to registration.
	await expect(page.getByRole('heading', { name: 'Bestand übernehmen' })).toBeVisible();
	await expect(page.locator('form[action="?/register"]')).toBeVisible();

	// A file that is not a container is refused and changes nothing.
	await submitArchive(page, Buffer.from('this is not a zip archive at all'), 'broken.zip');
	await expect(page.locator('[data-testid="import-panel"] [role="alert"]')).toBeVisible();
	await expect(page.locator('[data-testid="import-report"]')).toHaveCount(0);
	await expect(page.locator('form[action="?/register"]')).toBeVisible();

	// A media file whose bytes no longer match its checksum is refused as well.
	await submitArchive(page, tamperMediaEntry(archive, 'media/avery/photo-1.png'), 'exchange.zip');
	await expect(page.locator('[data-testid="import-panel"] [role="alert"]')).toBeVisible();
	await expect(page.locator('[data-testid="import-report"]')).toHaveCount(0);

	// The valid archive produces the validation report with every owner of the archive.
	await submitArchive(page, archive, 'exchange.zip');
	await expect(page.locator('[data-testid="import-report"]')).toBeVisible();
	for (const user of archiveData.users) {
		await expect(page.locator('[data-testid="import-report"]')).toContainText(user.username);
	}
	await expect(page.locator('[data-testid="import-report"]')).toContainText('vollständig');

	// Activation requires exactly one administrator choice.
	const activate = page.getByRole('button', { name: 'Import aktivieren' });
	await expect(activate).toBeDisabled();
	await page.locator(`input[name="adminUsername"][value="${referenceAdminUsername}"]`).check();
	await expect(activate).toBeEnabled();
	await page.getByLabel('Neues Passwort für diesen Zugang').fill(administratorPassword);
	await activate.click();

	// The takeover dialog is gone and the login form is offered instead.
	await expect(page.locator('[data-testid="import-panel"]')).toHaveCount(0);
	await expect(page.locator('form[action="?/login"]')).toBeVisible();

	// The chosen administrator signs in with the freshly set password and sees only their own items.
	await signIn(page, referenceAdminUsername, administratorPassword);
	await expect(page.locator('body')).toContainText('Portfolio (3)');

	// act — the second owner signs in with the password behind the hash the archive carried over
	await signOut(page);
	await signIn(page, referenceLegacyUsername, referenceLegacyPassword);

	// assume — the imported password works, and the account sees its own two items, not the six of
	// the archive: every owner stayed inside their own tenant
	await expect(page.locator('body')).toContainText('Portfolio (2)');
	await expect(page.locator('body')).toContainText('Kaffeemühle');
	await expect(page.locator('body')).not.toContainText('Eichenregal');

	// The successful sign-in replaced the legacy hash with the current format, exactly once.
	const rehashed = readStoredHash(referenceLegacyUsername);
	expect(rehashed).not.toBe(importedLegacyHash);
	expect(rehashed?.startsWith('scrypt$v1$')).toBe(true);

	// act — the account whose hash the importer refused cannot sign in with any password
	await signOut(page);
	await signIn(page, referenceIncompatibleUsername, 'whatever-the-reset-will-set');

	// assume — it is sent to the reset path, and no foreign hash was ever stored
	await expect(page.getByText('Benutzername oder Passwort ist nicht korrekt.')).toBeVisible();
	expect(readStoredHash(referenceIncompatibleUsername)).toBeNull();
});
