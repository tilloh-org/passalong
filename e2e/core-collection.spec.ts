import { expect, test } from '@playwright/test';

test.describe('Core collection', () => {
	test('creates a collection and stores an item', async ({ page }) => {
		await page.goto('/');

		await page.getByLabel('Dein Name').fill('Avery');
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
		await expect(page.getByText('12,00 €')).toBeVisible();
	});
});
