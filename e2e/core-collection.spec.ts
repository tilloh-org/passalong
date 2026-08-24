import { expect, test } from '@playwright/test';

test.describe('Core collection', () => {
	test('registers the first admin, logs in, and protects collection data', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByRole('heading', { name: 'Ersten Zugang erstellen' })).toBeVisible();
		await page.getByLabel('Benutzername').fill('avery');
		await page.getByLabel('Dein Name').fill('Avery');
		await page.getByLabel('Passwort').fill('correct-horse-battery-staple');
		await page.getByRole('button', { name: 'Zugang erstellen' }).click();

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

		await page.getByLabel('Benutzername').fill('avery');
		await page.getByLabel('Passwort').fill('correct-horse-battery-staple');
		await page.getByRole('button', { name: 'Anmelden' }).click();
		await expect(page.getByRole('heading', { name: 'Wohnzimmer-Ausmisten' })).toBeVisible();

		await page.context().clearCookies();
		await page.goto(protectedUrl);
		await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
		await expect(page.getByText('Vor dem Inserieren die Glühbirne austauschen.')).not.toBeVisible();
	});
});
