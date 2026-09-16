import { expect, test } from '@playwright/test';

// The version footer is global chrome: it must render on the public entry point and on
// authenticated pages, and it must carry the documented `v<release>-<commit-hash>` shape.
const versionLabelPattern = /^v\d+\.\d+\.\d+(-[0-9a-f]{7})?$/;

test.describe('Version footer', () => {
	test('renders the version label on the public entry point', async ({ page }) => {
		// arrange
		const applicationUrl = '/';

		// act
		await page.goto(applicationUrl);

		// assume
		const footer = page.getByTestId('site-footer');
		await expect(footer).toBeVisible();
		await expect(footer).toContainText(versionLabelPattern);
	});

	test('spans the full viewport width', async ({ page }) => {
		// arrange
		await page.goto('/');

		// act
		const widths = await page.evaluate(() => {
			const footer = document.querySelector('[data-testid="site-footer"]');
			return footer
				? { footer: footer.getBoundingClientRect().width, viewport: window.innerWidth }
				: null;
		});

		// assume
		expect(widths).not.toBeNull();
		expect(widths!.footer).toBeGreaterThanOrEqual(widths!.viewport - 1);
	});

	test('keeps the version in the bottom left corner', async ({ page }) => {
		// arrange
		await page.goto('/');

		// act
		const box = await page.evaluate(() => {
			const label = document.querySelector('.site-footer-version');
			const footer = document.querySelector('[data-testid="site-footer"]');
			if (!label || !footer) {
				return null;
			}
			const labelRect = label.getBoundingClientRect();
			return { labelLeft: labelRect.left, footerLeft: footer.getBoundingClientRect().left };
		});

		// assume
		expect(box).not.toBeNull();
		expect(Math.abs(box!.labelLeft - box!.footerLeft)).toBeLessThan(60);
	});
});
