import { expect, test } from '@playwright/test';
import { sharedTestAccount } from './test-account';

test.describe('Market days', () => {
	test('requires login and manages the market day lifecycle', async ({ page, request }) => {
		// arrange — log in with the shared owner account (session cookie persisted by earlier specs)
		await page.goto('/');
		const setupVisible = await page.getByRole('heading', { name: 'Ersten Zugang erstellen' }).isVisible().catch(() => false);
		if (setupVisible) {
			await page.locator('form[action="?/register"]').getByLabel('Benutzername').fill(sharedTestAccount.username);
			await page.locator('form[action="?/register"]').getByLabel('Dein Name').fill(sharedTestAccount.displayName);
			await page.locator('form[action="?/register"]').getByLabel('Passwort').fill(sharedTestAccount.initialPassword);
			await page.getByRole('button', { name: 'Zugang erstellen' }).click();
		} else {
			const loginForm = page.locator('form[action="?/login"]');
			await loginForm.getByLabel('Benutzername').fill(sharedTestAccount.username);
			await loginForm.getByLabel('Passwort').fill(sharedTestAccount.recoveredPassword);
			await loginForm.getByRole('button', { name: 'Anmelden' }).click();
			const loginFailed = await page.getByRole('heading', { name: 'Anmelden' }).isVisible().catch(() => false);
			if (loginFailed) {
				await loginForm.getByLabel('Benutzername').fill(sharedTestAccount.username);
				await loginForm.getByLabel('Passwort').fill(sharedTestAccount.initialPassword);
				await loginForm.getByRole('button', { name: 'Anmelden' }).click();
			}
		}
		await expect(page.getByTestId('profile-avatar-link')).toBeVisible();

		// act — open the market days page via the nav link
		await page.getByTestId('nav-tage-link').click();
		await expect(page).toHaveURL(/\/tage/);
		await expect(page.getByTestId('tage-title')).toBeVisible();

		// assume — the page starts empty
		await expect(page.getByTestId('tage-empty')).toBeVisible();

		// act — open the create form and submit a market day
		const marketDayName = `Flohmarkt ${new Date().toISOString().slice(0, 16)}`;
		await page.getByTestId('tage-create-toggle').click();
		await page.getByTestId('tage-name-input').fill(marketDayName);
		await page.getByTestId('tage-date-input').fill('2026-05-16');
		await page.getByTestId('tage-start-input').fill('08:00');
		await page.getByTestId('tage-end-input').fill('16:00');
		await page.getByTestId('tage-location-input').fill('Schulhof Moorweg');
		await page.getByTestId('tage-notes-input').fill('Erster Versuch mit neuem App-Zyklus.');
		await page.getByTestId('tage-create-submit').click();

		// assume — the day appears in the list as open
		const dayCard = page.getByTestId('tage-item').filter({ hasText: marketDayName }).first();
		await expect(page.getByTestId('tage-item')).toHaveCount(1);
		await expect(dayCard).toContainText(marketDayName);
		await expect(dayCard).toContainText('Offen');

		// act — close the day
		await page.getByTestId('tage-close').click();

		// assume — the status pill flips to closed
		await expect(page.getByTestId('tage-item').filter({ hasText: marketDayName })).toContainText('Abgeschlossen');
		await expect(page.getByTestId('tage-item').filter({ hasText: marketDayName }).locator('[data-testid=tage-reopen]')).toBeVisible();

		// act — reopen the day
		await page.getByTestId('tage-reopen').click();

		// assume
		await expect(page.getByTestId('tage-item').filter({ hasText: marketDayName })).toContainText('Offen');

		// act — edit the day through the dialog
		await page.getByTestId('tage-edit-trigger').click();
		await expect(page.getByTestId('tage-edit-dialog')).toBeVisible();
		await page.locator('[data-testid=tage-edit-dialog] input[name="name"]').fill(`${marketDayName} (verschoben)`);
		await page.locator('[data-testid=tage-edit-dialog] input[name="date"]').fill('2026-05-23');
		await page.getByRole('button', { name: 'Änderungen speichern' }).click();

		// assume — the list shows the updated name
		await expect(page.getByTestId('tage-item').first()).toContainText(`${marketDayName} (verschoben)`);

		// act — delete the day
		await page.getByTestId('tage-delete').click();

		// assume — the list is empty again
		await expect(page.getByTestId('tage-empty')).toBeVisible();
	});
});