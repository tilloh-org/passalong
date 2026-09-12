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
			await page.request.post('/?/createCollection', {
				form: { collectionName: 'Flohmarkt-Stand' },
				headers: { Origin: 'http://localhost:4173' }
			});
			await page.goto('/');
			await page
				.getByTestId('collection-switcher')
				.getByRole('link', { name: 'Flohmarkt-Stand' })
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

		// act — a buyer opens the public item detail page from the tile
		await anonymousPage.getByTestId('stand-item').first().locator('.tile-link').click();
		await expect(anonymousPage.getByTestId('stand-item-detail')).toBeVisible();
		await expect(anonymousPage.getByTestId('stand-item-hint')).toContainText('Flohmarkt-Stand');
		await expect(anonymousPage.locator('.item-title')).toHaveText(firstCardTitle!);
		await expect(anonymousPage.locator('.back-link')).toBeVisible();
		const itemNotFound = await anonymousPage.request.get(
			'/stand/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000001'
		);

		// assume — unknown collection/item ids stay 404 on the public detail page
		expect(itemNotFound.status()).toBe(404);

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
		expect(avatarMediaResponse.status()).toBe(200);
		anonymousContext.close?.();
	});
});
