import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

/** Instance that produces the backup (own database and media folder, see `playwright.config.ts`). */
const sourceBaseUrl = 'http://localhost:4185';

const restoreAccount = {
	username: 'freshrestore',
	displayName: 'Fresh restore',
	password: 'correct-horse-battery-staple'
};

test.setTimeout(120_000);

/**
 * Post one form action from inside the signed-in page and return its JSON result.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @param {string} actionPath - Path and action name, e.g. `/?/addItem`.
 * @param {Record<string, string>} values - The form values.
 * @returns {Promise<{ type?: string; location?: string; data?: unknown }>} The action result.
 */
async function postAction(
	page: import('@playwright/test').Page,
	actionPath: string,
	values: Record<string, string>
): Promise<{ type?: string; location?: string; data?: unknown }> {
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
	const parsed = JSON.parse(result.body) as { type?: string; location?: string; data?: unknown };
	if (parsed.type === 'failure') {
		throw new Error(`${actionPath} failed: ${JSON.stringify(parsed.data)}`);
	}
	return parsed;
}

/**
 * Register the restore account on the source instance and sign in.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @returns {Promise<void>} Resolves once the account is signed in.
 */
async function registerOnSource(page: import('@playwright/test').Page): Promise<void> {
	await page.goto(`${sourceBaseUrl}/`);
	await page
		.locator('form[action="?/register"], form[action="?/login"]')
		.first()
		.waitFor({ state: 'visible' });
	const onboardingVisible = (await page.locator('form[action="?/register"]').count()) > 0;
	if (onboardingVisible) {
		await page.evaluate(async (registration) => {
			await fetch('/?/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams(registration),
				redirect: 'manual'
			});
		}, restoreAccount);
	} else {
		const loginForm = page.locator('form[action="?/login"]');
		await loginForm.getByLabel('Benutzername').fill(restoreAccount.username);
		await loginForm.getByLabel('Passwort').fill(restoreAccount.password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();
	}
	await page.goto(`${sourceBaseUrl}/profile`);
	await page.waitForSelector('[data-testid="profile-avatar-link"]');
}

/**
 * Resolve the active collection of the signed-in account, creating one when it has none.
 *
 * @param {import('@playwright/test').Page} page - Page of the signed-in owner.
 * @returns {Promise<string>} The collection id.
 */
async function ensureCollection(page: import('@playwright/test').Page): Promise<string> {
	await page.goto(`${sourceBaseUrl}/`);
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
		await page.goto(`${sourceBaseUrl}/`);
	}
	return collectionField.inputValue();
}

/**
 * Create one item in the account's collection and return its title.
 *
 * @param {import('@playwright/test').Page} page - Page of the signed-in owner.
 * @param {string} title - The item title.
 * @returns {Promise<string>} The created title.
 */
async function createItem(page: import('@playwright/test').Page, title: string): Promise<string> {
	const collectionId = await ensureCollection(page);
	if ((await page.locator('body').innerText()).includes(title)) {
		// A retry finds the item of the previous attempt.
		return title;
	}
	await postAction(page, '/?/addItem', {
		collectionId,
		title,
		priceEuros: '12,00',
		category: 'home',
		condition: 'good'
	});
	return title;
}

// The proof needs two instances: one that owns data and produces a backup, one that starts empty and
// takes that backup over. Both are fresh per run, so the empty instance really has no account.
test('restores a complete backup into an empty instance', async ({ page }) => {
	// arrange — an account with one item on the source instance
	await registerOnSource(page);
	const itemTitle = await createItem(page, 'Kaffeemühle aus dem Backup');

	// act — download the complete instance backup from the source instance
	const backupResponse = await page.request.get(`${sourceBaseUrl}/profile/backup`);
	expect(backupResponse.status()).toBe(200);
	const backup = await backupResponse.body();
	expect(backup.length).toBeGreaterThan(0);

	// The target instance is empty: it offers registration, the exchange takeover and the restore.
	await page.context().clearCookies();
	await page.goto('/');
	const targetIsEmpty = (await page.locator('[data-testid="restore-panel"]').count()) > 0;
	if (targetIsEmpty) {
		// assume — a file that is not a backup is refused and changes nothing
		await page.setInputFiles('[data-testid="restore-input"]', {
			buffer: Buffer.from('this is not a backup'),
			mimeType: 'application/zip',
			name: 'broken.zip'
		});
		await page.locator('[data-testid="restore-form"] button[type="submit"]').click();
		await expect(page.locator('[data-testid="restore-panel"] [role="alert"]')).toBeVisible();
		await expect(page.locator('form[action="?/register"]')).toBeVisible();

		// act — the complete backup is restored
		await page.setInputFiles('[data-testid="restore-input"]', {
			buffer: backup,
			mimeType: 'application/zip',
			name: 'passalong-backup.zip'
		});
		await page.locator('[data-testid="restore-form"] button[type="submit"]').click();
	}
	// A retry finds the instance already restored, so the restore itself is skipped above.

	// assume — the instance now carries the restored account and serves the sign-in form
	await expect(page.locator('form[action="?/login"]')).toBeVisible();
	await expect(page.locator('[data-testid="restore-panel"]')).toHaveCount(0);

	// act — the restored account signs in with the password from the backup
	const loginForm = page.locator('form[action="?/login"]');
	await loginForm.getByLabel('Benutzername').fill(restoreAccount.username);
	await loginForm.getByLabel('Passwort').fill(restoreAccount.password);
	await loginForm.getByRole('button', { name: 'Anmelden' }).click();

	// assume — the restored data is there: the item of the source instance is in the portfolio
	await expect(page.locator('body')).toContainText(itemTitle);
});
