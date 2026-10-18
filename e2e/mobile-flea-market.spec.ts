import QRCode from 'qrcode';
import { expect, test } from '@playwright/test';

/**
 * The complete flea-market flow on a phone.
 *
 * This is the exit gate "the complete flea-market flow works on mobile" of phase 4: it walks the
 * whole journey through the interface on a phone viewport (Pixel 7, 412 × 915 css pixels) on an
 * instance of its own — registration, collection, article, market day, sale, day detail, closing
 * the day, sales history, statistics and the label sheet. Every step also asserts that the page
 * does not scroll sideways, because that is what makes a view unusable on a phone even when every
 * element is visible.
 *
 * The spec runs against a fresh instance, so it must work from an empty state, and it must survive
 * a Playwright retry: on a retry the account exists and the data of the first attempt is still
 * there. Article and market day therefore carry a suffix of the attempt, so every attempt works on
 * its own article and its own market day and never depends on what a previous attempt left behind.
 */

test.setTimeout(180_000);

const mobileAccount = {
	username: 'mira',
	displayName: 'Mira',
	password: 'mobile-correct-battery-horse'
} as const;

const attemptSuffix = Date.now().toString().slice(-6);
const articleTitle = `Klappstuhl ${attemptSuffix}`;
const articlePrice = '18,00';
const saleProceeds = '15,00';
const marketDayName = `Flohmarkt ${attemptSuffix}`;
const marketDayLocation = 'Parkplatz am See';

/**
 * Assert that the current page fits the viewport horizontally.
 *
 * A single element that starts inside the phone viewport and reaches past its right edge forces a
 * sideways scroll and hides controls the visitor needs, so this belongs to the gate rather than to
 * one step. The document width alone would prove nothing: the layout clips with
 * `overflow-x: hidden`, so content can be cut off without moving the document.
 *
 * Two kinds of elements do not count: those that start to the right of the viewport (a closed
 * drawer waiting off-canvas) and those inside a scroll container that fits the viewport — where
 * sideways scrolling is the intended way to reach the content.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @param {string} step - Name of the step, used in the failure message.
 * @returns {Promise<void>} Resolves when the page fits the viewport.
 */
async function expectPageFitsViewport(page, step) {
	const measurements = await page.evaluate(() => {
		const viewportWidth = window.innerWidth;
		const scrollableAncestor = (element) => {
			for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
				if (ancestor === document.body) {
					return false;
				}
				const style = getComputedStyle(ancestor);
				const scrollsSideways = style.overflowX === 'auto' || style.overflowX === 'scroll';
				if (scrollsSideways && ancestor.getBoundingClientRect().right <= viewportWidth + 1) {
					return true;
				}
			}
			return false;
		};
		const offenders = [];
		for (const element of document.querySelectorAll('body *')) {
			const rect = element.getBoundingClientRect();
			const startsOutside = rect.left >= viewportWidth + 1;
			const reachable = rect.right <= viewportWidth + 1;
			if (rect.width === 0 || startsOutside || reachable || scrollableAncestor(element)) {
				continue;
			}
			offenders.push(
				element.getAttribute('data-testid') ??
					`${element.tagName.toLowerCase()}.${element.className}`
			);
		}
		return { viewportWidth, documentWidth: document.documentElement.scrollWidth, offenders };
	});
	expect(
		measurements.offenders,
		`${step}: Elemente laufen über die Ansicht (${measurements.viewportWidth}px breit, Dokument ${measurements.documentWidth}px)`
	).toEqual([]);
	expect(
		measurements.documentWidth,
		`${step}: das Dokument ist breiter als die Ansicht`
	).toBeLessThanOrEqual(measurements.viewportWidth + 1);
}

/**
 * Sign the owner in, registering the first account when the instance is still empty.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @param {string} step - Name of the step for the viewport assertion.
 * @returns {Promise<void>} Resolves once the owner is signed in.
 */
async function signIn(page, step) {
	await page.goto('/');
	const registerForm = page.locator('form[action="?/register"]');
	const needsRegistration = await registerForm.isVisible().catch(() => false);
	if (needsRegistration) {
		await registerForm.getByLabel('Benutzername').fill(mobileAccount.username);
		await registerForm.getByLabel('Dein Name').fill(mobileAccount.displayName);
		await registerForm.getByLabel('Passwort').fill(mobileAccount.password);
		await expectPageFitsViewport(page, step);
		await registerForm.getByRole('button', { name: 'Zugang erstellen' }).click();
	} else {
		const loginForm = page.locator('form[action="?/login"]');
		await loginForm.getByLabel('Benutzername').fill(mobileAccount.username);
		await loginForm.getByLabel('Passwort').fill(mobileAccount.password);
		await expectPageFitsViewport(page, step);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();
	}
	await expect(page.getByTestId('profile-avatar-link')).toBeVisible();
}

test.describe('Flea-market flow on a phone', () => {
	test('walks the whole flow from the first account to the label sheet on a phone viewport', async ({
		page
	}) => {
		// act — step 1: the first account of the instance, entered on the phone
		await signIn(page, 'Anmelden');

		// act — step 2: the collection, without which the flow cannot start
		const collectionForm = page.locator('form[action="?/createCollection"]');
		if (await collectionForm.isVisible().catch(() => false)) {
			await collectionForm.getByLabel('Name der Sammlung').fill('Flohmarkt Mobil');
			await expectPageFitsViewport(page, 'Sammlung anlegen');
			await collectionForm.getByRole('button', { name: 'Sammlung anlegen' }).click();
		}

		// assume
		await expect(page.getByRole('heading', { name: 'Portfolio', level: 1 })).toBeVisible();
		await expectPageFitsViewport(page, 'Portfolio');

		// act — step 3: the article to sell, added through the portfolio form
		const itemForm = page.locator('form[action="?/addItem"]');
		await itemForm.getByLabel('Artikelname').fill(articleTitle);
		await itemForm.getByLabel('Preis (€)').fill(articlePrice);
		await expectPageFitsViewport(page, 'Artikel anlegen');
		await itemForm.getByRole('button', { name: 'Artikel hinzufügen' }).click();

		// assume
		const itemCard = page.getByTestId('item-card').filter({ hasText: articleTitle }).first();
		await expect(itemCard).toBeVisible();
		await expectPageFitsViewport(page, 'Artikel im Portfolio');

		// act — step 4: read the printed label of the article back in through the photo fallback
		await itemCard.click();
		await expect(page).toHaveURL(/\/items\//);
		const articleId = new URL(page.url()).pathname.split('/').pop();
		await page.goto('/scan');
		const labelPhoto = await QRCode.toBuffer(`${new URL(page.url()).origin}/q/${articleId}`);
		await page.getByLabel('QR-Code-Foto auswählen').setInputFiles({
			name: 'etikett.png',
			mimeType: 'image/png',
			buffer: labelPhoto
		});
		await expect(page).toHaveURL(new RegExp(`/(q|items)/${articleId}`));
		await expect(page.getByText(articleTitle).first()).toBeVisible();
		await expectPageFitsViewport(page, 'Etikett gescannt');

		// act — step 5: the market day the sale belongs to, created before selling
		await page.goto('/market-days');
		await expect(page.getByRole('heading', { name: 'Markttage', level: 1 })).toBeVisible();
		await expectPageFitsViewport(page, 'Markttage');
		const marketDayForm = page.getByTestId('market-days-create-form');
		await expect(marketDayForm).toBeVisible();
		await marketDayForm.getByTestId('market-days-name-input').fill(marketDayName);
		await marketDayForm.getByTestId('market-days-location-input').fill(marketDayLocation);
		await expectPageFitsViewport(page, 'Markttag anlegen');
		await marketDayForm.getByTestId('market-days-create-submit').click();

		// assume
		const marketDayCard = page.getByTestId('market-day-item').filter({ hasText: marketDayName });
		await expect(marketDayCard).toBeVisible();
		await expect(marketDayCard).toContainText('Offen');
		await expect(marketDayCard).toContainText(marketDayLocation);
		await expectPageFitsViewport(page, 'Markttag in der Liste');

		// act — step 6: open the article and capture the sale on the stall, on that market day
		await page.goto('/');
		await page.getByTestId('item-card').filter({ hasText: articleTitle }).first().click();
		await expect(page).toHaveURL(/\/items\//);
		await expectPageFitsViewport(page, 'Artikeldetail');
		const saleSection = page.getByTestId('item-sale-section');
		await expect(saleSection).toBeVisible();
		await saleSection.getByTestId('item-proceeds').fill(saleProceeds);
		await saleSection.getByTestId('item-market-day').selectOption({ label: marketDayName });
		await expectPageFitsViewport(page, 'Verkauf erfassen');
		await saleSection.getByTestId('mark-item-sold').click();

		// assume — the article is sold and offers the undo
		await expect(page.getByTestId('unmark-item-sold')).toBeVisible();
		await expect(page.getByTestId('item-sold-badge')).toBeVisible();
		await expectPageFitsViewport(page, 'Verkauf erfasst');

		// act — step 7: the day detail lists the sale and closes the day
		await page.goto('/market-days');
		await page.getByTestId('market-day-item').filter({ hasText: marketDayName }).click();
		await expect(page).toHaveURL(/\/market-days\//);
		await expect(page.getByTestId('market-day-sale-item').first()).toContainText(articleTitle);
		await expect(page.getByTestId('market-day-csv-download')).toBeVisible();
		await expectPageFitsViewport(page, 'Markttag im Detail');
		await page.getByRole('button', { name: 'Tag abschließen' }).click();

		// assume
		await expect(page.getByText('Abgeschlossen').first()).toBeVisible();
		await expectPageFitsViewport(page, 'Markttag abgeschlossen');

		// act — step 8: the sales history shows the sale
		await page.goto('/sales');
		await expect(page.getByTestId('sale-history-title')).toBeVisible();
		await expect(page.getByTestId('sale-history-item').first()).toContainText(articleTitle);
		await expectPageFitsViewport(page, 'Verkaufsliste');

		// act — step 9: the statistics count the sale
		await page.goto('/statistics');
		await expect(page.getByTestId('statistics-title')).toBeVisible();
		await expect(page.getByTestId('statistics-empty')).toHaveCount(0);
		await expectPageFitsViewport(page, 'Statistik');

		// act — step 10: the label sheet, the last step of the flow before printing
		await page.goto('/price-labels');

		// assume
		await expect(page.getByTestId('price-labels-title')).toBeVisible();
		await expectPageFitsViewport(page, 'Preisschilder');
	});
});
