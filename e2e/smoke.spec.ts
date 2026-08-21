import { expect, test } from '@playwright/test';

// Smoke-Suite: nur die Kernpfade, keine Detail-Einstellungen.
// Wächst mit den Hauptfeatures der App (Sammlung, Artikel, Verkauf).

test.describe('Landing-Page', () => {
	test('lädt mit passalong-Branding', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle('passalong');
		await expect(page.getByRole('heading', { level: 1, name: 'passalong' })).toBeVisible();
	});

	test('zeigt Kernbotschaft und Entwicklungsstatus', async ({ page }) => {
		await page.goto('/');
		await expect(
			page.getByText('Verwalte die Dinge, die du nicht mehr brauchst')
		).toBeVisible();
		await expect(page.getByText('In Entwicklung — die Sammlung kommt bald.')).toBeVisible();
	});

	test('zeigt die drei Feature-Karten', async ({ page }) => {
		await page.goto('/');
		for (const title of ['Eine Sammlung', 'Viele Wege', 'Familiär & selbst gehostet']) {
			await expect(page.getByRole('heading', { name: title })).toBeVisible();
		}
	});
});
