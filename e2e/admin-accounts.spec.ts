import { expect, test } from '@playwright/test';

const adminAccountsTimeoutMs = 60_000;

/**
 * Build a unique username for one test attempt.
 *
 * The instance persists across retries, so a fixed username would collide on the second attempt.
 *
 * @param {string} prefix - A readable prefix identifying the account's role.
 * @returns {string} A username that is free on a fresh or retried attempt.
 */
function uniqueUsername(prefix) {
	return `${prefix}${Date.now().toString().slice(-6)}`;
}

/**
 * Register or sign in the instance administrator of a fresh instance.
 *
 * The first registration of an instance becomes the instance administrator; every later attempt
 * meets an instance that already holds one, so it signs in instead.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @returns {Promise<{ username: string; password: string }>} The administrator credentials.
 */
async function signUpAsInstanceAdministrator(page) {
	const account = {
		username: 'avery',
		displayName: 'Avery',
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
	return account;
}

/**
 * Create a member account in the account administration and read its invitation code.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page, already signed in as administrator.
 * @param {string} username - The username for the new account.
 * @returns {Promise<string>} The one-time invitation code.
 */
async function createMemberAccount(page, username) {
	const createForm = page.locator('form[action="?/createAccount"]');
	await createForm.locator('input[name="username"]').fill(username);
	await createForm.locator('input[name="displayName"]').fill('Member');
	await page.getByTestId('create-account-submit').click();
	await expect(page.getByTestId('issued-invitation-secret')).toBeVisible();
	return (await page.getByTestId('issued-invitation-secret-value').innerText()).trim();
}

test.describe('Instance account administration', () => {
	test('creates a member account, admits it with the invitation code, and deletes it', async ({
		page,
		baseURL
	}) => {
		test.setTimeout(adminAccountsTimeoutMs);
		const memberUsername = uniqueUsername('blake');
		const memberPassword = 'member-chosen-password';

		// arrange — the first registration of the instance is the administrator
		await signUpAsInstanceAdministrator(page);

		// act — the administrator opens the account administration
		await page.goto('/admin');
		await expect(page).toHaveURL(/\/admin/);
		await expect(page.getByTestId('accounts-panel')).toBeVisible();
		await expect(page.getByTestId('accounts-table')).toBeVisible();

		// assume — the administrator is listed and carries no delete action for itself
		const administratorRow = page.getByTestId('account-row').filter({ hasText: 'avery' });
		await expect(administratorRow).toBeVisible();
		await expect(administratorRow).toContainText('Instanzadmin');
		await expect(administratorRow.getByTestId('account-delete-trigger')).toHaveCount(0);

		// act — create a member account
		const invitationCode = await createMemberAccount(page, memberUsername);
		expect(invitationCode.length).toBeGreaterThan(0);

		// assume — the member is listed with its role and no sign-in yet
		const memberRow = page.getByTestId('account-row').filter({ hasText: memberUsername });
		await expect(memberRow).toBeVisible();
		await expect(memberRow).toContainText('Nutzer');
		await expect(memberRow).toContainText('Noch nie');

		// act — the member consumes the invitation code on the regular sign-in page
		await page.context().clearCookies();
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
		await page.locator('.reset-toggle').click();
		const resetForm = page.locator('form[action="?/resetPassword"]');
		await resetForm.getByLabel('Benutzername').fill(memberUsername);
		await resetForm.getByLabel('Zurücksetzungscode').fill(invitationCode);
		await resetForm.getByLabel('Neues Passwort').fill(memberPassword);
		await resetForm.getByRole('button', { name: 'Passwort zurücksetzen' }).click();

		// assume — the member is signed in with the code it received
		await expect(page.getByRole('heading', { name: 'Deine Sammlungen', level: 1 })).toBeVisible();

		// act — a member must never reach the instance administration
		await page.goto('/admin');

		// assume — the member is redirected away from the administration surface
		await expect(page).toHaveURL('/');

		// act — and must not create an account through a same-origin form post either
		const memberCreateAttempt = await page.request.post(`${baseURL}/admin?/createAccount`, {
			form: { username: 'intruder', displayName: 'Intruder' },
			headers: { Origin: new URL(baseURL!).origin }
		});
		const memberAttemptBody = await memberCreateAttempt.text();

		// assume — the member is turned away, proven by the effect and not by the status code,
		// because SvelteKit serialises action results with status 200
		expect(memberAttemptBody).not.toContain('intruder');

		// act — the administrator signs in again and deletes the member account
		await page.context().clearCookies();
		await page.goto('/');
		const loginForm = page.locator('form[action="?/login"]');
		await loginForm.getByLabel('Benutzername').fill('avery');
		await loginForm.getByLabel('Passwort').fill('correct-horse-battery-staple');
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();
		await page.waitForSelector('[data-testid="profile-avatar-link"]', { timeout: 20_000 });
		await page.goto('/admin');

		// assume — the member row now shows a sign-in time, so the list reflects the session
		await expect(
			page.getByTestId('account-row').filter({ hasText: memberUsername })
		).not.toContainText('Noch nie');
		// and the refused attempt left no account behind
		await expect(page.getByTestId('accounts-table')).not.toContainText('intruder');

		// act — open the deletion dialog and confirm in one step
		await page
			.getByTestId('account-row')
			.filter({ hasText: memberUsername })
			.getByTestId('account-delete-trigger')
			.click();
		await expect(page.getByTestId('admin-delete-account-dialog')).toBeVisible();
		// The dialog must point at the instance backup, the only restorable artefact.
		await expect(page.getByTestId('admin-download-instance-backup')).toBeVisible();
		await expect(page.getByTestId('admin-delete-account-submit')).toBeDisabled();
		await page.getByTestId('admin-delete-account-input').fill(memberUsername);
		await expect(page.getByTestId('admin-delete-account-submit')).toBeEnabled();
		await page.getByTestId('admin-delete-account-submit').click();

		// assume — the member is gone
		await expect(page).toHaveURL(/\/admin/);
		await expect(page.getByTestId('accounts-table')).not.toContainText(memberUsername);

		// act — the deleted member cannot sign in any more
		await page.context().clearCookies();
		await page.goto('/');
		const rejectedLoginForm = page.locator('form[action="?/login"]');
		await rejectedLoginForm.getByLabel('Benutzername').fill(memberUsername);
		await rejectedLoginForm.getByLabel('Passwort').fill(memberPassword);
		await rejectedLoginForm.getByRole('button', { name: 'Anmelden' }).click();

		// assume — the deleted account stays refused and the sign-in page reports it
		await expect(rejectedLoginForm.getByRole('alert')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Anmelden', level: 1 })).toBeVisible();
	});

	test('refuses a new account whose username is taken in any letter case', async ({ page }) => {
		test.setTimeout(adminAccountsTimeoutMs);
		const takenUsername = uniqueUsername('dana');

		// arrange
		await signUpAsInstanceAdministrator(page);
		await page.goto('/admin');
		await expect(page.getByTestId('accounts-panel')).toBeVisible();
		const rowsBefore = await page.getByTestId('account-row').count();
		await createMemberAccount(page, takenUsername);
		const rowsAfterCreate = await page.getByTestId('account-row').count();

		// assume — the new account is the only addition
		expect(rowsAfterCreate).toBe(rowsBefore + 1);

		// act — the same username in a different letter case must be refused
		const createForm = page.locator('form[action="?/createAccount"]');
		await createForm.locator('input[name="username"]').fill(takenUsername.toUpperCase());
		await createForm.locator('input[name="displayName"]').fill('Other Member');
		await page.getByTestId('create-account-submit').click();

		// assume — the refusal is reported and no account was added
		await expect(page.getByTestId('accounts-panel').getByRole('alert')).toBeVisible();
		await expect(page.getByTestId('account-row')).toHaveCount(rowsAfterCreate);
	});
});
