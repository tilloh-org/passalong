import { expect, test } from '@playwright/test';

// Smoke suite: only core paths, no detailed settings.
// Grows with the app's main features (collection, items, selling).

test.describe('Landing page', () => {
	test('loads with passalong branding', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle('passalong');
		await expect(page.getByRole('heading', { level: 1, name: 'passalong' })).toBeVisible();
	});

	test('shows core message and development status', async ({ page }) => {
		await page.goto('/');
		await expect(
			page.getByText('Verwalte die Dinge, die du nicht mehr brauchst')
		).toBeVisible();
		await expect(page.getByText('In Entwicklung — die Sammlung kommt bald.')).toBeVisible();
	});

	test('shows the three feature cards', async ({ page }) => {
		await page.goto('/');
		for (const title of ['Eine Sammlung', 'Viele Wege', 'Familiär & selbst gehostet']) {
			await expect(page.getByRole('heading', { name: title })).toBeVisible();
		}
	});
});
