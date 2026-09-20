import { Buffer } from 'node:buffer';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { sharedTestAccount } from './test-account';

test.describe('Public stand page', () => {
	test('shows unsold items to anonymous visitors without internal data and 404s unknown ids', async ({
		page
	}) => {
		// arrange
		await page.goto('/');
		const setupVisible = await page
			.getByRole('heading', { name: 'Ersten Zugang erstellen' })
			.isVisible();
		if (setupVisible) {
			await page
				.locator('form[action="?/register"]')
				.getByLabel('Benutzername')
				.fill(sharedTestAccount.username);
			await page
				.locator('form[action="?/register"]')
				.getByLabel('Dein Name')
				.fill(sharedTestAccount.displayName);
			await page
				.locator('form[action="?/register"]')
				.getByLabel('Passwort')
				.fill(sharedTestAccount.recoveredPassword);
			await page.getByRole('button', { name: 'Zugang erstellen' }).click();
		} else {
			const stateFile = 'e2e/.auth-owner.json';
			if (existsSync(stateFile)) {
				const saved = JSON.parse(readFileSync(stateFile, 'utf8')) as {
					cookies?: { name: string; value: string; domain: string; path: string }[];
				};
				const cookies = (saved.cookies ?? []).filter(
					(cookie) => cookie.name === 'passalong_session'
				);
				if (cookies.length) {
					await page.context().addCookies(cookies);
				}
			}
			const loginForm = page.locator('form[action="?/login"]');
			await loginForm.getByLabel('Benutzername').fill(sharedTestAccount.username);
			for (const password of [
				sharedTestAccount.initialPassword,
				sharedTestAccount.recoveredPassword
			]) {
				await loginForm.getByLabel('Passwort').fill(password);
				await loginForm.getByRole('button', { name: 'Anmelden' }).click();
				const stillLoggedOut = await page
					.getByRole('heading', { name: 'Anmelden' })
					.isVisible()
					.catch(() => false);
				if (!stillLoggedOut) {
					break;
				}
			}
		}
		await expect(
			page
				.getByRole('heading', { name: 'Deine Sammlungen' })
				.or(page.getByRole('heading', { name: 'Portfolio', level: 1 }))
		).toBeVisible();
		if (
			await page
				.getByLabel('Name der Sammlung')
				.isVisible()
				.catch(() => false)
		) {
			await page.getByLabel('Name der Sammlung').fill('Flohmarkt-Stand');
			await page.getByRole('button', { name: 'Sammlung anlegen' }).click();
		} else {
			// A retry runs against the same database, so the collection may already exist. Creating
			// it again would leave two identically named entries and make the switcher ambiguous.
			await page.request.post('/?/createCollection', {
				form: { collectionName: 'Flohmarkt-Stand' },
				headers: { Origin: 'http://localhost:4173' }
			});
			await page.goto('/');
			await page
				.getByTestId('collection-switcher')
				.getByRole('link', { name: 'Flohmarkt-Stand' })
				.first()
				.click();
		}

		// act
		for (const [title, price, notes, description] of [
			['Vase', '8,00', 'Nur abends abgeben', 'Handgefertigte Keramikvase in Blau.'],
			['Buch', '3,00', '', '']
		] as const) {
			await page.getByLabel('Artikelname').fill(title);
			await page.getByLabel('Preis (€)').fill(price);
			await page.getByLabel('Externe Beschreibung (für Käufer sichtbar)').fill(description);
			await page.getByLabel('Interne Notizen (nur für dich sichtbar)').fill(notes);
			await page.getByRole('button', { name: 'Artikel hinzufügen' }).click();
		}
		await page.waitForSelector('[data-testid=item-card]');
		const standLink = page.getByTestId('nav-stand-link');
		await expect(standLink).toBeVisible();

		// act
		const standHref = await standLink.getAttribute('href');
		const ownerVaseCard = page.getByTestId('item-card').filter({ hasText: 'Vase' }).first();
		await ownerVaseCard.click();
		await expect(page).toHaveURL(/\/items\//);
		const ownerItemPath = new URL(page.url()).pathname;
		const itemId = ownerItemPath.split('/').at(-1)!;

		// act — the owner gives the vase two photos, so the buyer gallery has something to show.
		// A retry against the reused database finds them already stored and must not add more.
		const vaseImageCount = await page
			.getByTestId('images-dialog-trigger')
			.evaluate((trigger) => Number(/\((\d+)\)/.exec(trigger.textContent ?? '')?.[1] ?? 0));
		if (vaseImageCount < 2) {
			await page.getByTestId('images-dialog-trigger').click();
			await expect(page.getByTestId('images-dialog')).toBeVisible();
			const galleryPng = Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
				'base64'
			);
			const galleryPngDetail = Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/AAAMBAQAY3Y2wAAAAAElFTkSuQmCC',
				'base64'
			);
			await page.getByTestId('item-image-input').setInputFiles([
				{ name: 'vase.png', mimeType: 'image/png', buffer: galleryPng },
				{ name: 'vase-detail.png', mimeType: 'image/png', buffer: galleryPngDetail }
			]);
			await page.getByRole('button', { name: 'Foto speichern' }).click();
		}

		// assume — two photos are stored against the item; the dialog closed itself after the
		// upload redirect, so the count is read from the trigger on the page
		await expect(page.getByTestId('images-dialog-trigger')).toContainText('2');

		// act — the owner follows the neutral QR route
		await page.goto(`/q/${itemId}`);

		// assume — the owner is sent to the protected internal detail page
		await expect(page).toHaveURL(ownerItemPath);

		// act
		const anonymousContext = await page.context().browser()!.newContext();
		const anonymousPage = await anonymousContext.newPage();
		await anonymousPage.goto(standHref!);

		// assume
		await expect(anonymousPage.getByTestId('stand-title')).toHaveText('Flohmarkt-Stand');
		await expect(anonymousPage.getByTestId('stand-item')).toHaveCount(2);
		const standCards = anonymousPage.getByTestId('stand-item');
		await expect(standCards.filter({ hasText: 'Vase' })).toContainText('8,00');
		await expect(standCards.filter({ hasText: 'Vase' })).not.toContainText('Nur abends abgeben');
		await expect(standCards.filter({ hasText: 'Vase' })).toContainText(
			'Handgefertigte Keramikvase'
		);
		await expect(standCards.filter({ hasText: 'Buch' })).toContainText('3,00');
		await expect(
			standCards.filter({ hasText: 'Buch' }).getByTestId('stand-item-description')
		).toHaveCount(0);
		const publicVasePath = await standCards
			.filter({ hasText: 'Vase' })
			.locator('.tile-link')
			.getAttribute('href');

		// act — a buyer follows the same neutral QR route without a seller session
		await anonymousPage.goto(`/q/${itemId}`);

		// assume — the buyer is sent to the reduced public item detail without internal notes
		await expect(anonymousPage).toHaveURL(publicVasePath!);
		await expect(anonymousPage.getByTestId('stand-item-detail')).toBeVisible();
		await expect(anonymousPage.getByText('Nur abends abgeben')).toHaveCount(0);
		await anonymousPage.goto(standHref!);

		// act — favorite the first card, verify persistence across reload, then toggle off
		const firstCard = anonymousPage.getByTestId('stand-item').first();
		const firstCardTitle = await firstCard.locator('.name').textContent();
		const heart = firstCard.getByTestId('favorite-toggle');
		await expect(heart).toHaveAttribute('aria-pressed', 'false');
		await heart.click();
		await expect(heart).toHaveAttribute('aria-pressed', 'true');
		await expect(anonymousPage.getByTestId('favorites-badge')).toHaveText('1');

		// assume — the favorites dialog lists the marked item with name and price
		await anonymousPage.getByTestId('favorites-bar-trigger').click();
		await expect(anonymousPage.getByTestId('favorites-dialog')).toBeVisible();
		await expect(anonymousPage.getByTestId('favorites-stand-name')).toContainText(
			'Flohmarkt-Stand'
		);
		await expect(anonymousPage.getByTestId('favorites-item')).toHaveCount(1);
		await expect(anonymousPage.getByTestId('favorites-item').first()).toContainText(
			firstCardTitle!
		);
		await anonymousPage.keyboard.press('Escape');

		// act — reload the page
		await anonymousPage.reload();
		await expect(
			anonymousPage.getByTestId('stand-item').first().getByTestId('favorite-toggle')
		).toHaveAttribute('aria-pressed', 'true');
		await expect(anonymousPage.getByTestId('favorites-badge')).toHaveText('1');
		await anonymousPage.getByTestId('stand-item').first().getByTestId('favorite-toggle').click();
		await expect(
			anonymousPage.getByTestId('stand-item').first().getByTestId('favorite-toggle')
		).toHaveAttribute('aria-pressed', 'false');
		await expect(anonymousPage.getByTestId('favorites-bar-trigger')).toBeVisible();
		await expect(anonymousPage.getByTestId('favorites-badge')).toHaveCount(0);

		// act
		const unknownResponse = await anonymousPage.request.get(
			'/stand/00000000-0000-0000-0000-000000000000'
		);

		// assume
		expect(unknownResponse.status()).toBe(404);

		// act — a buyer opens the photographed item's public detail page from its tile
		const photographedCard = anonymousPage.getByTestId('stand-item').filter({ hasText: 'Vase' });
		await photographedCard.locator('.tile-link').click();
		await expect(anonymousPage.getByTestId('stand-item-detail')).toBeVisible();
		await expect(anonymousPage.getByTestId('stand-item-hint')).toContainText('Flohmarkt-Stand');
		await expect(anonymousPage.locator('.item-title')).toHaveText('Vase');
		await expect(anonymousPage.locator('.back-link')).toBeVisible();
		const itemNotFound = await anonymousPage.request.get(
			'/stand/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000001'
		);

		// assume — unknown collection/item ids stay 404 on the public detail page
		expect(itemNotFound.status()).toBe(404);

		// act — the buyer opens the gallery on a phone-sized viewport
		await anonymousPage.setViewportSize({ width: 390, height: 844 });
		const galleryStrip = anonymousPage.getByTestId('stand-item-gallery');
		const galleryThumbs = anonymousPage.getByTestId('stand-item-thumb');
		await expect(galleryStrip).toBeVisible();
		await expect(galleryThumbs).toHaveCount(2);

		// assume — no thumbnail overflows the viewport, which is what a sideways-scrolling strip
		// would otherwise do on a narrow screen
		const thumbOverflow = await galleryStrip.evaluate((strip) => {
			const bounds = strip.getBoundingClientRect();
			return [...strip.querySelectorAll('button')].some((button) => {
				const box = button.getBoundingClientRect();
				return box.right > bounds.right + 1 || box.left < bounds.left - 1;
			});
		});
		expect(thumbOverflow).toBe(false);

		// act — the buyer zooms into the second photo
		await galleryThumbs.nth(1).click();

		// assume — every viewer control is reachable on a phone; a control rendered outside the
		// viewport cannot be tapped and looks like a missing button
		for (const controlTestId of ['lightbox-close', 'lightbox-previous', 'lightbox-next']) {
			const box = await anonymousPage.getByTestId(controlTestId).boundingBox();
			expect(box, `${controlTestId} must be rendered`).not.toBeNull();
			expect(box!.x, `${controlTestId} must start inside the viewport`).toBeGreaterThanOrEqual(0);
			expect(
				box!.x + box!.width,
				`${controlTestId} must end inside the viewport`
			).toBeLessThanOrEqual(390);
		}

		// assume — the viewer opens on that photo and reports the position in the gallery
		const lightbox = anonymousPage.getByTestId('item-lightbox');
		await expect(lightbox).toBeVisible();
		await expect(anonymousPage.getByTestId('lightbox-counter')).toHaveText('Foto 2 von 2');
		await expect(anonymousPage.getByTestId('lightbox-image')).toBeVisible();

		// act — arrow keys and the on-screen buttons move through the gallery, wrapping at the end
		await anonymousPage.keyboard.press('ArrowRight');
		await expect(anonymousPage.getByTestId('lightbox-counter')).toHaveText('Foto 1 von 2');
		await anonymousPage.getByTestId('lightbox-previous').click();
		await expect(anonymousPage.getByTestId('lightbox-counter')).toHaveText('Foto 2 von 2');

		// act — a swipe to the left advances, a vertical drag does not
		const stage = anonymousPage.locator('.lightbox-stage');
		await stage.dispatchEvent('touchstart', {
			touches: [{ clientX: 300, clientY: 400, identifier: 1 }],
			changedTouches: [{ clientX: 300, clientY: 400, identifier: 1 }]
		});
		await stage.dispatchEvent('touchend', {
			touches: [],
			changedTouches: [{ clientX: 330, clientY: 520, identifier: 1 }]
		});

		// assume — the mostly vertical drag left the photo where it was
		await expect(anonymousPage.getByTestId('lightbox-counter')).toHaveText('Foto 2 von 2');

		// act — a deliberate horizontal swipe advances
		await stage.dispatchEvent('touchstart', {
			touches: [{ clientX: 300, clientY: 400, identifier: 1 }],
			changedTouches: [{ clientX: 300, clientY: 400, identifier: 1 }]
		});
		await stage.dispatchEvent('touchend', {
			touches: [],
			changedTouches: [{ clientX: 180, clientY: 410, identifier: 1 }]
		});

		// assume — one image further, wrapped back to the first
		await expect(anonymousPage.getByTestId('lightbox-counter')).toHaveText('Foto 1 von 2');

		// act — the buyer closes the viewer
		await anonymousPage.getByTestId('lightbox-close').click();

		// assume — the viewer is gone and the gallery is still there
		await expect(lightbox).toBeHidden();
		await expect(galleryStrip).toBeVisible();
		await anonymousPage.setViewportSize({ width: 1280, height: 900 });

		// act — anonymous access to an unknown media key
		const unknownMediaResponse = await anonymousPage.request.get('/media/not-a-real-key.png');

		// assume — unknown keys stay 404 even without a session
		expect(unknownMediaResponse.status()).toBe(404);

		// act — search on the stand page for a buyer-visible field
		const standPath = standHref!;
		await anonymousPage.goto(`${standPath}?q=Vase`);
		await expect(anonymousPage.getByTestId('stand-item')).toHaveCount(1);
		await expect(anonymousPage.getByTestId('stand-item').first()).toContainText('Vase');

		// assume — the filter empty state appears for non-matching queries
		await anonymousPage.goto(`${standPath}?q=Existiertnicht`);
		await expect(anonymousPage.getByTestId('stand-filter-empty-state')).toBeVisible();

		// assume — the reset link clears the filters
		await anonymousPage.getByTestId('stand-filter-reset').click();
		await expect(anonymousPage.getByTestId('stand-item')).toHaveCount(2);

		// act — the public handle must not be the internal collection id
		const publicHandle = standPath.replace(/^.*\/stand\//, '');
		// The owner's own pages still address the collection by its internal id; read it from the
		// hidden field so the counter-check compares real values instead of assuming one.
		await page.goto('/');
		const internalCollectionId = await page
			.locator('input[name="collectionId"]')
			.first()
			.getAttribute('value');
		const internalIdResponse = await anonymousPage.request.get(
			`/stand/${encodeURIComponent(internalCollectionId)}`
		);
		const publicHandleResponse = await anonymousPage.request.get(
			`/stand/${encodeURIComponent(publicHandle)}`
		);

		// assume — only the opaque handle opens the stand, the internal row id stays 404
		expect(publicHandle).not.toBe(internalCollectionId);
		expect(publicHandleResponse.status()).toBe(200);
		expect(internalIdResponse.status()).toBe(404);

		// assume — category filter restricts the list
		await anonymousPage.goto(`${standPath}?category=clothing`);
		await expect(anonymousPage.getByTestId('stand-item')).toHaveCount(2);

		// act — the owner uploads an avatar; the anonymous visitor sees it in the hero
		const pngGreen = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
			'base64'
		);
		writeFileSync('e2e/.test-avatar.png', pngGreen);
		await page.getByTestId('profile-avatar-link').click();
		await expect(page).toHaveURL(/\/profile/);
		await page.getByTestId('avatar-input').setInputFiles('e2e/.test-avatar.png');
		await page.getByRole('button', { name: 'Avatar speichern' }).click();
		await expect(page.getByTestId('profile-avatar')).toBeVisible();
		const avatarSrc = await page.locator('[data-testid=profile-avatar] img').getAttribute('src');
		const avatarKey = avatarSrc?.replace('/media/', '') ?? '';
		await anonymousPage.goto(standPath);
		await expect(anonymousPage.getByTestId('stand-owner-avatar')).toBeVisible();

		// assume — the avatar image resolves anonymously under the same media route
		const avatarMediaResponse = await anonymousPage.request.get(
			`/media/${decodeURIComponent(avatarKey)}`
		);
		await expect(avatarMediaResponse.status()).toBe(200);

		// act — sell the QR-linked item after all public buyer assertions have completed
		const saleResponse = await page.request.post(`${ownerItemPath}?/markItemSold`, {
			form: {
				itemId,
				channel: 'flea-market',
				proceedsEuros: '8,00',
				marketDayId: ''
			},
			headers: { Origin: 'http://localhost:4173' },
			maxRedirects: 0
		});

		// assume — sold and unknown QR identifiers reveal no detail to any visitor
		expect(saleResponse.status()).toBe(200);
		const ownerSoldQrResponse = await page.request.get(`/q/${itemId}`, { maxRedirects: 0 });
		const buyerSoldQrResponse = await anonymousPage.request.get(`/q/${itemId}`, {
			maxRedirects: 0
		});
		const ownerUnknownQrResponse = await page.request.get(
			'/q/00000000-0000-0000-0000-000000000000',
			{ maxRedirects: 0 }
		);
		const buyerUnknownQrResponse = await anonymousPage.request.get(
			'/q/00000000-0000-0000-0000-000000000000',
			{ maxRedirects: 0 }
		);
		expect(ownerSoldQrResponse.status()).toBe(404);
		expect(buyerSoldQrResponse.status()).toBe(404);
		expect(ownerUnknownQrResponse.status()).toBe(404);
		expect(buyerUnknownQrResponse.status()).toBe(404);
		anonymousContext.close?.();
	});
});
