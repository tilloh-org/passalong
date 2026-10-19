import { expect, test } from '@playwright/test';

const labelsPerSheet = 16;
/** A title that needs several lines in a four-column label, checked in the printed layout. */
const longTitle =
	'Standuhr aus Nussbaum mit Messingbeschlägen, Pendelwerk und Glockenschlag von 1958';
/** One sheet is the 194mm x 281mm A4 print area; Chromium lays out 96 CSS pixels per inch. */
const sheetWidthPixels = (194 * 96) / 25.4;
const sheetHeightPixels = (281 * 96) / 25.4;
const sheetTolerancePixels = 2;
/** Registering, seeding a sheet of items and printing twice needs more than the default 30s. */
const labelSheetTimeoutMs = 120_000;

test.setTimeout(labelSheetTimeoutMs);

/**
 * Sign the owner in, registering the first account of the fresh instance if it is still empty.
 *
 * The instance survives a retry, so a retried attempt meets an existing account and signs in.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @returns {Promise<void>} Resolves once the owner is signed in.
 */
async function signInOnFreshInstance(page) {
	const account = {
		username: 'labelprint',
		displayName: 'Label Print',
		password: 'correct-horse-battery-staple'
	};
	await page.goto('/');
	const onboardingVisible = await page
		.getByRole('heading', { name: 'Ersten Zugang erstellen' })
		.isVisible()
		.catch(() => false);
	if (onboardingVisible) {
		await page.evaluate(async (registration) => {
			await fetch('/?/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams(registration),
				redirect: 'manual'
			});
		}, account);
		await page.goto('/');
	} else {
		const loginForm = page.locator('form[action="?/login"]');
		await loginForm.getByLabel('Benutzername').fill(account.username);
		await loginForm.getByLabel('Passwort').fill(account.password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();
	}
	await page.waitForSelector('[data-testid="profile-avatar-link"]', { timeout: 20_000 });
}

/**
 * Resolve the active collection, creating one when the owner has none yet.
 *
 * A fresh registration starts without a collection, so the label proof creates one first.
 *
 * @param {import('@playwright/test').Page} page - Page of the signed-in owner.
 * @returns {Promise<string>} The id of the active collection.
 */
async function ensureCollection(page) {
	await page.goto('/');
	const collectionField = page.locator('input[name="collectionId"]').first();
	if ((await collectionField.count()) === 0) {
		await page.evaluate(async (collectionName) => {
			const response = await fetch('/?/createCollection', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ collectionName })
			});
			const result = await response.json();
			if (result.type === 'failure') {
				throw new Error(`creating the collection failed: ${JSON.stringify(result.data)}`);
			}
		}, 'Preisschilder');
		await page.goto('/');
	}
	return collectionField.inputValue();
}

/**
 * Create unsold items through the same action the portfolio form posts to.
 *
 * @param {import('@playwright/test').Page} page - Page of the signed-in owner.
 * @param {string[]} titles - Titles of the items to create.
 * @returns {Promise<void>} Resolves once every item exists.
 */
async function createItems(page, titles) {
	const collectionId = await ensureCollection(page);
	await page.evaluate(
		async ({ collectionId, titles: itemTitles }) => {
			for (const title of itemTitles) {
				const response = await fetch('/?/addItem', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						collectionId,
						title,
						priceEuros: '12,00',
						category: 'home',
						condition: 'good'
					}),
					redirect: 'manual'
				});
				const result = await response.json();
				if (result.type === 'failure') {
					throw new Error(`creating ${title} failed: ${JSON.stringify(result.data)}`);
				}
			}
		},
		{ collectionId, titles }
	);
}

/**
 * Read the page count of a generated PDF.
 *
 * Chromium writes a readable page tree, so every page object appears in the bytes. A PDF without
 * one fails the proof loudly instead of passing on an unreadable buffer.
 *
 * @param {Buffer} pdf - The generated PDF.
 * @returns {number} The number of pages.
 */
function countPdfPages(pdf) {
	const pageObjects = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [];
	if (pageObjects.length === 0) {
		throw new Error('the generated PDF carries no readable page objects');
	}
	return pageObjects.length;
}

/**
 * Open the label sheet and print it the way a seller prints it.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page.
 * @returns {Promise<number>} The number of A4 pages in the generated PDF.
 */
async function printLabelSheetToA4Pdf(page) {
	await page.goto('/price-labels');
	const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
	return countPdfPages(pdf);
}

test('prints one A4 sheet per sixteen labels and opens a new sheet for the seventeenth', async ({
	page
}) => {
	// arrange — a collection with a long-titled item, filled up to a whole number of sheets
	await signInOnFreshInstance(page);
	await createItems(page, [longTitle]);
	await page.goto('/price-labels');
	const existingLabelCount = await page.getByTestId('price-label-item').count();
	const existingRemainder = existingLabelCount % labelsPerSheet;
	const paddingCount = existingRemainder === 0 ? 0 : labelsPerSheet - existingRemainder;
	const paddingTitles = Array.from(
		{ length: paddingCount },
		(_, index) => `Preisschild ${String(existingLabelCount + index + 1).padStart(3, '0')}`
	);
	await createItems(page, paddingTitles);
	const sheetLabelCount = existingLabelCount + paddingCount;

	// act — print a collection that is exactly a whole number of sheets
	const filledSheetPageCount = await printLabelSheetToA4Pdf(page);

	// assume — sixteen labels fill one A4 page
	expect(filledSheetPageCount).toBe(sheetLabelCount / labelsPerSheet);
	await expect(page.getByTestId('price-label-item')).toHaveCount(sheetLabelCount);
	await expect(page.locator('.price-label-page')).toHaveCount(sheetLabelCount / labelsPerSheet);

	// act — one item more than a sheet holds
	const overflowTitle = `Preisschild ${String(sheetLabelCount + 1).padStart(3, '0')}`;
	await createItems(page, [overflowTitle]);
	const overflowPageCount = await printLabelSheetToA4Pdf(page);

	// assume — the next label starts a new A4 page instead of squeezing into the filled sheet
	expect(overflowPageCount).toBe(sheetLabelCount / labelsPerSheet + 1);
	await expect(page.getByTestId('price-label-item')).toHaveCount(sheetLabelCount + 1);
	await expect(page.locator('.price-label-page')).toHaveCount(sheetLabelCount / labelsPerSheet + 1);
	await expect(
		page.locator('.price-label-page').last().getByTestId('price-label-item')
	).toHaveCount(1);
	const overflowLabel = page.getByTestId('price-label-item').filter({ hasText: overflowTitle });
	await expect(overflowLabel).toHaveCount(1);

	// assume — the printed label carries title, QR code and display price
	await expect(overflowLabel).toContainText(overflowTitle);
	await expect(overflowLabel.locator('.label-qr img')).toHaveAttribute(
		'src',
		/^data:image\/png;base64,/
	);
	await expect(overflowLabel.locator('.price')).toHaveText('12,00 €');

	// assume — the sheet is the A4 print area declared by the @page rule
	await page.emulateMedia({ media: 'print' });
	const sheetBox = await page.locator('.price-label-page').first().boundingBox();
	expect(sheetBox).not.toBeNull();
	expect(Math.abs((sheetBox?.width ?? 0) - sheetWidthPixels)).toBeLessThan(sheetTolerancePixels);
	expect(Math.abs((sheetBox?.height ?? 0) - sheetHeightPixels)).toBeLessThan(sheetTolerancePixels);

	// assume — a long title wraps inside its label and keeps the QR code and the price in place
	const longTitleLabel = page.getByTestId('price-label-item').filter({ hasText: longTitle });
	await expect(longTitleLabel).toHaveCount(1);
	const longTitleLabelBox = await longTitleLabel.boundingBox();
	const longTitleToplineBox = await longTitleLabel.locator('.label-topline').boundingBox();
	const longTitleQrBox = await longTitleLabel.locator('.label-qr').boundingBox();
	const longTitlePriceBox = await longTitleLabel.locator('.label-bottomline').boundingBox();
	expect(longTitleLabelBox).not.toBeNull();
	expect(longTitleToplineBox).not.toBeNull();
	expect(longTitleQrBox).not.toBeNull();
	expect(longTitlePriceBox).not.toBeNull();
	const labelBottom = (longTitleLabelBox?.y ?? 0) + (longTitleLabelBox?.height ?? 0);
	const labelRight = (longTitleLabelBox?.x ?? 0) + (longTitleLabelBox?.width ?? 0);
	expect((longTitleToplineBox?.y ?? 0) + (longTitleToplineBox?.height ?? 0)).toBeLessThanOrEqual(
		longTitleQrBox?.y ?? 0
	);
	expect((longTitleQrBox?.y ?? 0) + (longTitleQrBox?.height ?? 0)).toBeLessThanOrEqual(
		longTitlePriceBox?.y ?? 0
	);
	expect((longTitlePriceBox?.y ?? 0) + (longTitlePriceBox?.height ?? 0)).toBeLessThanOrEqual(
		labelBottom
	);
	expect((longTitleToplineBox?.x ?? 0) + (longTitleToplineBox?.width ?? 0)).toBeLessThanOrEqual(
		labelRight
	);
});
