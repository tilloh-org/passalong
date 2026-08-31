import { expect, test } from '@playwright/test';

// Smoke suite: keep the stable public entry point covered.
test.describe('Application shell', () => {
	test('loads with passalong branding', async ({ page }) => {
		// arrange
		const applicationUrl = '/';

		// act
		await page.goto(applicationUrl);

		// assume
		await expect(page).toHaveTitle('passalong');
		await expect(page.getByText('passalong', { exact: true })).toBeVisible();
	});
});
