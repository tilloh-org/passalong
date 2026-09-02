import { expect, test } from '@playwright/test';

test.describe('Core collection', () => {
	test('rejects cross-site registration and completes the authenticated collection flow', async ({ page }) => {
		// arrange
		const registrations = [
			{ username: 'avery', displayName: 'Avery', password: 'correct-horse-battery-staple' },
			{ username: 'blake', displayName: 'Blake', password: 'another-correct-battery-horse' }
		];

		// act
		await page.goto('/');

		// assume
		await expect(page.getByRole('heading', { name: 'Ersten Zugang erstellen' })).toBeVisible();

		// act
		const rejectedRegistration = await page.request.post('/?/register', {
			form: registrations[0],
			headers: { Origin: 'https://attacker.example' }
		});

		// assume
		expect(rejectedRegistration.status()).toBe(403);

		// act
		await page.evaluate(async (accounts) => {
			return Promise.all(
				accounts.map(async (account) => {
					const response = await fetch('/?/register', {
						method: 'POST',
						headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
						body: new URLSearchParams(account),
						redirect: 'manual'
					});
					return response.status;
				})
			);
		}, registrations);
		await page.context().clearCookies();
		await page.goto('/');

		// assume
		await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
		const loginForm = page.locator('form[action="?/login"]');

		// act
		await loginForm.getByLabel('Benutzername').fill(registrations[0].username);
		await loginForm.getByLabel('Passwort').fill(registrations[0].password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();
		const firstAccountWon = await page.getByRole('heading', { name: 'Deine Sammlungen' }).isVisible();
		let failedLoginCount = firstAccountWon ? 0 : 1;
		const winningAccount = registrations[firstAccountWon ? 0 : 1]!;
		const losingAccount = registrations[firstAccountWon ? 1 : 0]!;
		if (!firstAccountWon) {
			await page.goto('/');
			await loginForm.getByLabel('Benutzername').fill(winningAccount.username);
			await loginForm.getByLabel('Passwort').fill(winningAccount.password);
			await loginForm.getByRole('button', { name: 'Anmelden' }).click();
		}

		// assume
		await expect(page.getByRole('heading', { name: 'Deine Sammlungen' })).toBeVisible();

		// act
		await page.getByRole('button', { name: 'Abmelden' }).click();
		await loginForm.getByLabel('Benutzername').fill(losingAccount.username);
		await loginForm.getByLabel('Passwort').fill(losingAccount.password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();

		// assume
		await expect(page.getByText('Benutzername oder Passwort ist nicht korrekt.')).toBeVisible();
		failedLoginCount += 1;

		// act
		await loginForm.getByLabel('Benutzername').fill(winningAccount.username);
		await loginForm.getByLabel('Passwort').fill(winningAccount.password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();

		// assume
		await expect(page.getByRole('heading', { name: 'Deine Sammlungen' })).toBeVisible();

		// act
		await page.getByLabel('Name der Sammlung').fill('Wohnzimmer-Ausmisten');
		await page.getByRole('button', { name: 'Sammlung anlegen' }).click();

		// assume
		await expect(page.getByRole('heading', { name: 'Artikel', level: 1 })).toBeVisible();

		// act
		await page.getByLabel('Artikelname').fill('Leselampe');
		await page.getByLabel('Preis in Cent').fill('1200');
		await page.getByLabel('Kategorie').selectOption('home');
		await page.getByLabel('Zustand').selectOption('good');
		await page.getByLabel('Interne Notizen').fill('Vor dem Inserieren die Glühbirne austauschen.');
		await page.getByRole('button', { name: 'Artikel hinzufügen' }).click();

		// assume
		await expect(page.getByRole('heading', { name: 'Leselampe' })).toBeVisible();

		// act
		const itemCard = page.getByTestId('item-card');

		// assume
		await expect(itemCard.locator('.kat')).toContainText('Haushalt');
		await expect(itemCard.locator('.badge.open')).toBeVisible();

		// act
		await itemCard.getByTestId('quick-sell-item').click();

		// assume
		await expect(page.getByTestId('item-sold-badge')).toBeVisible();
		await expect(itemCard.locator('.badge.sold')).toBeVisible();
		await expect(page.getByTestId('sale-statistics')).toContainText('1 Artikel verkauft');
		await expect(page.getByTestId('sale-statistics')).toContainText('12,00 € Erlös');
		await expect(page.getByTestId('sale-statistics-channels')).toContainText('Flohmarkt');
		const currentMonth = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
		await expect(page.getByTestId('sale-statistics-months')).toContainText(currentMonth);

		// act
		const protectedUrl = page.url();
		await page.getByRole('button', { name: 'Abmelden' }).click();

		// assume
		await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
		await expect(page.getByText('Vor dem Inserieren die Glühbirne austauschen.')).not.toBeVisible();

		// act
		await loginForm.getByLabel('Benutzername').fill(winningAccount.username);
		await loginForm.getByLabel('Passwort').fill(winningAccount.password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();

		// assume
		await expect(page.getByRole('heading', { name: 'Artikel', level: 1 })).toBeVisible();

		// act
		await page.context().clearCookies();
		await page.goto(protectedUrl);

		// assume
		await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
		await expect(page.getByText('Vor dem Inserieren die Glühbirne austauschen.')).not.toBeVisible();

		// act
		await loginForm.getByLabel('Benutzername').fill(winningAccount.username);
		await loginForm.getByLabel('Passwort').fill(winningAccount.password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();
		await page.locator('.instance-admin-link').click();
		const instanceAdministrationForm = page.locator('form[action="?/createPasswordReset"]');
		await instanceAdministrationForm.getByLabel('Benutzername des Kontos').fill(winningAccount.username);
		await instanceAdministrationForm.getByRole('button', { name: 'Zurücksetzungscode erzeugen' }).click();
		const resetSecret = await page.getByTestId('issued-password-reset-secret').textContent();

		// assume
		expect(resetSecret).toMatch(/^[A-Za-z0-9_-]+$/);

		// act
		await page.locator('.reset-toggle').click();
		const resetForm = page.locator('form[action="?/resetPassword"]');
		await resetForm.getByLabel('Benutzername').fill(winningAccount.username);
		await resetForm.getByLabel('Zurücksetzungscode').fill(resetSecret!);
		await resetForm.getByLabel('Neues Passwort').fill('recovered-correct-battery-horse');
		await resetForm.getByRole('button', { name: 'Passwort zurücksetzen' }).click();

		// assume
		await expect(page.getByRole('heading', { name: 'Artikel', level: 1 })).toBeVisible();

		// act
		await page.locator('.password-panel-link').click();
		const changeForm = page.locator('form[action="?/changePassword"]');
		await changeForm.getByLabel('Aktuelles Passwort').fill('recovered-correct-battery-horse');
		await changeForm.getByLabel('Neues Passwort').fill('correct-horse-battery-staple');
		await changeForm.getByRole('button', { name: 'Passwort speichern' }).click();

		// assume
		await expect(page.getByRole('heading', { name: 'Artikel', level: 1 })).toBeVisible();
	});
});