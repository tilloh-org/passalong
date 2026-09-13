import { expect, test } from '@playwright/test';
import { sharedTestAccount } from './test-account';

test.describe('Market days', () => {
	test('requires login and manages the market day lifecycle', async ({ page, browser }) => {
		// arrange — log in with the shared owner account (session cookie persisted by earlier specs)
		await page.goto('/');
		const setupVisible = await page
			.getByRole('heading', { name: 'Ersten Zugang erstellen' })
			.isVisible()
			.catch(() => false);
		if (setupVisible) {
			await page
				.locator('form[action="?/register"]')
				.getByLabel('Benutzername')
				.fill(sharedTestAccount.username);
			await page
				.locator('form[action="?/register"]')
				.getByLabel('Dein Name')
				.fill(sharedTestAccount.displayName);
			await page
				.locator('form[action="?/register"]')
				.getByLabel('Passwort')
				.fill(sharedTestAccount.initialPassword);
			await page.getByRole('button', { name: 'Zugang erstellen' }).click();
		} else {
			const loginForm = page.locator('form[action="?/login"]');
			await loginForm.getByLabel('Benutzername').fill(sharedTestAccount.username);
			await loginForm.getByLabel('Passwort').fill(sharedTestAccount.recoveredPassword);
			await loginForm.getByRole('button', { name: 'Anmelden' }).click();
			const loginFailed = await page
				.getByRole('heading', { name: 'Anmelden' })
				.isVisible()
				.catch(() => false);
			if (loginFailed) {
				await loginForm.getByLabel('Benutzername').fill(sharedTestAccount.username);
				await loginForm.getByLabel('Passwort').fill(sharedTestAccount.initialPassword);
				await loginForm.getByRole('button', { name: 'Anmelden' }).click();
			}
		}
		await expect(page.getByTestId('profile-avatar-link')).toBeVisible();

		// act — open the market days page via the nav link
		await page.getByTestId('nav-market-days-link').click();
		await expect(page).toHaveURL(/market-days/);
		await expect(page.getByTestId('market-days-title')).toBeVisible();

		// arrange — remove market-day leftovers from earlier attempts so the lifecycle starts empty.
		// The shared SQLite database persists across retry attempts.
		while ((await page.getByTestId('market-day-item').count()) > 0) {
			await page.getByTestId('market-day-item').first().click();
			await page.getByTestId('market-days-delete').click();
			await expect(page).toHaveURL(/\/market-days$/);
		}

		// assume — the page starts empty
		await expect(page.getByTestId('market-days-empty')).toBeVisible();

		// act — submit the always-visible landing-page form
		const marketDayName = `Flohmarkt ${new Date().toISOString().slice(0, 16)}`;
		await page.getByTestId('market-days-name-input').fill(marketDayName);
		await page.getByTestId('market-days-date-input').fill('2026-05-16');
		await page.getByTestId('market-days-start-input').fill('08:00');
		await page.getByTestId('market-days-end-input').fill('16:00');
		await page.getByTestId('market-days-location-input').fill('Schulhof Moorweg');
		await page.getByTestId('market-days-notes-input').fill('Erster Versuch mit neuem App-Zyklus.');
		await page.getByTestId('market-days-create-submit').click();

		// assume — the day appears in the list as open
		const dayCard = page.getByTestId('market-day-item').filter({ hasText: marketDayName }).first();
		await expect(page.getByTestId('market-day-item')).toHaveCount(1);
		await expect(dayCard).toContainText(marketDayName);
		await expect(dayCard).toContainText('Offen');

		// act — open the day detail from its clickable landing card
		await dayCard.click();
		await expect(page).toHaveURL(/\/market-days\//);
		await expect(page.getByTestId('market-day-detail-header')).toContainText(marketDayName);

		// act — close the day
		await page.getByTestId('market-days-close').click();

		// assume — the status pill flips to closed
		await expect(page.getByTestId('market-day-detail-header')).toContainText('Abgeschlossen');
		await expect(page.getByTestId('market-days-reopen')).toBeVisible();

		// act — reopen the day
		await page.getByTestId('market-days-reopen').click();

		// assume
		await expect(page.getByTestId('market-day-detail-header')).toContainText('Offen');

		// act — edit the day through the dialog
		await page.getByTestId('market-days-edit-trigger').click();
		await expect(page.getByTestId('market-days-edit-dialog')).toBeVisible();
		await page
			.locator('[data-testid=market-days-edit-dialog] input[name="name"]')
			.fill(`${marketDayName} (verschoben)`);
		await page
			.locator('[data-testid=market-days-edit-dialog] input[name="date"]')
			.fill('2026-05-23');
		await page.getByRole('button', { name: 'Änderungen speichern' }).click();

		// assume — the list shows the updated name
		await expect(page.getByTestId('market-day-detail-header')).toContainText(
			`${marketDayName} (verschoben)`
		);

		// act — record an expense linked to the market day
		await page.getByTestId('expenses-toggle').click();
		await page.getByTestId('expenses-label-input').fill('Standgebühr');
		await page.getByTestId('expenses-category-input').selectOption('fee');
		await page.getByTestId('expenses-amount-input').fill('15,00');
		await page.getByTestId('expenses-date-input').fill('2026-05-23');
		await page.getByTestId('expenses-create-submit').click();

		// assume — the expense row and the settlement appear
		const expenseRow = page.getByTestId('expense-item').filter({ hasText: 'Standgebühr' });
		await expect(expenseRow).toContainText('-15,00 €');
		const settlementRow = page.getByTestId('market-day-statistics');
		await expect(settlementRow).toContainText('Ausgaben: -15,00 €');

		// assume — the detail statistics show the per-day expense bars (no sales yet)
		await expect(page.getByTestId('market-day-expenses-chart')).toBeVisible();

		// act — edit the expense through the dialog
		await expenseRow.getByTestId('expenses-edit-trigger').click();
		await expect(page.getByTestId('expenses-edit-dialog')).toBeVisible();
		await page
			.locator('[data-testid=expenses-edit-dialog] input[name="amountEuros"]')
			.fill('18,00');
		await page.getByTestId('expenses-save').click();

		// assume — the expense row and the settlement reflect the corrected amount
		await expect(page.getByTestId('expense-item').filter({ hasText: 'Standgebühr' })).toContainText(
			'-18,00 €'
		);
		await expect(page.getByTestId('market-day-statistics')).toContainText('Ausgaben: -18,00 €');

		// act — delete the expense
		await page.getByTestId('expenses-delete').click();

		// assume
		await expect(page.getByTestId('expenses-empty')).toBeVisible();

		// act — request the protected detail URL from a session-less browser context
		const anonymousPage = await browser.newPage();
		await anonymousPage.goto(page.url());

		// assume — the detail never exposes data without a session
		await expect(anonymousPage.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
		await anonymousPage.close();

		// act — delete the day
		await page.getByTestId('market-days-delete').click();

		// assume — the list is empty again
		await expect(page.getByTestId('market-days-empty')).toBeVisible();
	});
});
