import { expect, test } from '@playwright/test';
import { sharedTestAccount } from './test-account';

// The version footer is operator chrome: it is only rendered once a session exists, so it never
// appears on the anonymous first-run screen or on the public buyer pages.
const versionLabelPattern = /^v\d+\.\d+\.\d+(-[0-9a-f]{7})?$/;

/**
 * Reach the authenticated portfolio.
 *
 * The suite shares one instance and runs the specs in filename order: `core-collection` registers
 * the account and restores the initial password before this spec runs. Exactly one login attempt is
 * made — guessing a second password would burn the login rate limit and break a later spec.
 *
 * @param {import('@playwright/test').Page} page - Page to authenticate.
 * @returns {Promise<void>} Resolves once the authenticated portfolio is visible.
 */
async function signIn(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/');
	const loginForm = page.locator('form[action="?/login"]');
	await loginForm.getByLabel('Benutzername').fill(sharedTestAccount.username);
	await loginForm.getByLabel('Passwort').fill(sharedTestAccount.initialPassword);
	await loginForm.getByRole('button', { name: 'Anmelden' }).click();
	await page.waitForLoadState('networkidle');
}

test.describe('Version footer', () => {
	test('is not visible to anonymous visitors', async ({ page }) => {
		// arrange
		await page.goto('/');

		// act + assume — the first-run screen is anonymous, so no version label is exposed.
		await expect(page.getByTestId('site-footer')).toHaveCount(0);
	});

	test('renders for the authenticated owner', async ({ page }) => {
		// arrange
		await signIn(page);

		// act + assume
		const footer = page.getByTestId('site-footer');
		await expect(footer).toBeVisible();
		await expect(footer).toContainText(versionLabelPattern);
	});

	test('is pinned to the bottom edge of the viewport, not to the end of the content', async ({
		page
	}) => {
		// arrange
		await signIn(page);

		// act — read the geometry on a page whose content is shorter than the viewport.
		const geometry = await page.evaluate(() => {
			const footer = document.querySelector('[data-testid="site-footer"]');
			if (!footer) {
				return null;
			}
			const f = footer.getBoundingClientRect();
			return {
				footerBottom: Math.round(f.bottom),
				viewportHeight: window.innerHeight,
				contentHeight: Math.round(document.documentElement.scrollHeight),
				scrollY: window.scrollY
			};
		});

		// assume — the strip touches the bottom of the screen even though the content stops short.
		expect(geometry).not.toBeNull();
		expect(geometry!.scrollY).toBe(0);
		expect(geometry!.contentHeight).toBeGreaterThanOrEqual(geometry!.viewportHeight);
		expect(Math.abs(geometry!.footerBottom - geometry!.viewportHeight)).toBeLessThanOrEqual(2);
	});

	test('stays at the bottom after scrolling a tall page', async ({ page }) => {
		// arrange
		await signIn(page);

		// act
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		await page.waitForTimeout(200);
		const geometry = await page.evaluate(() => {
			const footer = document.querySelector('[data-testid="site-footer"]');
			if (!footer) {
				return null;
			}
			const f = footer.getBoundingClientRect();
			return {
				footerBottom: Math.round(f.bottom),
				viewportHeight: window.innerHeight,
				scrollY: window.scrollY
			};
		});

		// assume
		expect(geometry).not.toBeNull();
		expect(geometry!.scrollY).toBeGreaterThan(0);
		expect(Math.abs(geometry!.footerBottom - geometry!.viewportHeight)).toBeLessThanOrEqual(2);
	});

	test('spans the full viewport width and sits in the bottom left corner', async ({ page }) => {
		// arrange
		await signIn(page);

		// act
		const geometry = await page.evaluate(() => {
			const footer = document.querySelector('[data-testid="site-footer"]');
			const label = document.querySelector('.site-footer-version');
			if (!footer || !label) {
				return null;
			}
			const f = footer.getBoundingClientRect();
			const l = label.getBoundingClientRect();
			return {
				footerWidth: f.width,
				viewportWidth: window.innerWidth,
				labelOffset: l.left - f.left
			};
		});

		// assume
		expect(geometry).not.toBeNull();
		expect(geometry!.footerWidth).toBeGreaterThanOrEqual(geometry!.viewportWidth - 1);
		expect(geometry!.labelOffset).toBeLessThan(60);
	});
});
