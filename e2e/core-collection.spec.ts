import { expect, test } from '@playwright/test';

test.describe('Core collection', () => {
	test('rejects cross-site registration and completes the authenticated collection flow', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Ersten Zugang erstellen' })).toBeVisible();

		const registrations = [
			{ username: 'avery', displayName: 'Avery', password: 'correct-horse-battery-staple' },
			{ username: 'blake', displayName: 'Blake', password: 'another-correct-battery-horse' }
		];
		const rejectedRegistration = await page.request.post('/?/register', {
			form: registrations[0],
			headers: { Origin: 'https://attacker.example' }
		});
		expect(rejectedRegistration.status()).toBe(403);
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
		await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
		const loginForm = page.locator('form[action="?/login"]');
		await loginForm.getByLabel('Benutzername').fill(registrations[0].username);
		await loginForm.getByLabel('Passwort').fill(registrations[0].password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();
		const firstAccountWon = await page.getByRole('heading', { name: 'Deine Sammlungen' }).isVisible();
		const winningAccount = registrations[firstAccountWon ? 0 : 1]!;
		const losingAccount = registrations[firstAccountWon ? 1 : 0]!;
		if (!firstAccountWon) {
			await page.goto('/');
			await loginForm.getByLabel('Benutzername').fill(winningAccount.username);
			await loginForm.getByLabel('Passwort').fill(winningAccount.password);
			await loginForm.getByRole('button', { name: 'Anmelden' }).click();
		}
		await expect(page.getByRole('heading', { name: 'Deine Sammlungen' })).toBeVisible();

		await page.getByRole('button', { name: 'Abmelden' }).click();
		await loginForm.getByLabel('Benutzername').fill(losingAccount.username);
		await loginForm.getByLabel('Passwort').fill(losingAccount.password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();
		await expect(page.getByText('Benutzername oder Passwort ist nicht korrekt.')).toBeVisible();
		await loginForm.getByLabel('Benutzername').fill(winningAccount.username);
		await loginForm.getByLabel('Passwort').fill(winningAccount.password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();

		await expect(page.getByRole('heading', { name: 'Deine Sammlungen' })).toBeVisible();
		await page.getByLabel('Name der Sammlung').fill('Wohnzimmer-Ausmisten');
		await page.getByRole('button', { name: 'Sammlung anlegen' }).click();
		await expect(page.getByRole('heading', { name: 'Wohnzimmer-Ausmisten' })).toBeVisible();

		await page.getByLabel('Artikelname').fill('Leselampe');
		await page.getByLabel('Preis in Cent').fill('1200');
		await page.getByLabel('Kategorie').selectOption('home');
		await page.getByLabel('Zustand').selectOption('good');
		await page.getByLabel('Interne Notizen').fill('Vor dem Inserieren die Glühbirne austauschen.');
		await page.getByRole('button', { name: 'Artikel hinzufügen' }).click();
		await expect(page.getByRole('heading', { name: 'Leselampe' })).toBeVisible();

		const protectedUrl = page.url();
		await page.getByRole('button', { name: 'Abmelden' }).click();
		await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
		await expect(page.getByText('Vor dem Inserieren die Glühbirne austauschen.')).not.toBeVisible();

		await loginForm.getByLabel('Benutzername').fill(winningAccount.username);
		await loginForm.getByLabel('Passwort').fill(winningAccount.password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();
		await expect(page.getByRole('heading', { name: 'Wohnzimmer-Ausmisten' })).toBeVisible();

		await page.context().clearCookies();
		await page.goto(protectedUrl);
		await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
		await expect(page.getByText('Vor dem Inserieren die Glühbirne austauschen.')).not.toBeVisible();
	});
});
