import { expect, test } from '@playwright/test';
import { sharedTestAccount } from './test-account';

test.describe('Public stand page', () => {
	test('shows unsold items to anonymous visitors without internal data and 404s unknown ids', async ({ page }) => {
		// arrange
		await page.goto('/');
		const setupVisible = await page.getByRole('heading', { name: 'Ersten Zugang erstellen' }).isVisible();
		if (setupVisible) {
			await page.locator('form[action="?/register"]').getByLabel('Benutzername').fill(sharedTestAccount.username);
			await page.locator('form[action="?/register"]').getByLabel('Dein Name').fill(sharedTestAccount.displayName);
			await page.locator('form[action="?/register"]').getByLabel('Passwort').fill(sharedTestAccount.recoveredPassword);
			await page.getByRole('button', { name: 'Zugang erstellen' }).click();
		} else {
			const loginForm = page.locator('form[action="?/login"]');
			for (const password of [sharedTestAccount.recoveredPassword, sharedTestAccount.initialPassword]) {
				await loginForm.getByLabel('Benutzername').fill(sharedTestAccount.username);
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
			page.getByRole('heading', { name: 'Deine Sammlungen' }).or(page.getByRole('heading', { name: 'Wohnzimmer-Ausmisten' }))
		).toBeVisible();
		if (await page.getByLabel('Name der Sammlung').isVisible().catch(() => false)) {
			await page.getByLabel('Name der Sammlung').fill('Flohmarkt-Stand');
			await page.getByRole('button', { name: 'Sammlung anlegen' }).click();
		} else {
			await page.request.post('/?/createCollection', {
				form: { collectionName: 'Flohmarkt-Stand' },
				headers: { Origin: 'http://localhost:4173' }
			});
			await page.goto('/');
			await page.getByTestId('collection-switcher').getByRole('link', { name: 'Flohmarkt-Stand' }).click();
		}

		// act
		for (const [title, price, notes] of [
			['Vase', '800', 'Nur abends abgeben'],
			['Buch', '300', '']
		] as const) {
			await page.getByLabel('Artikelname').fill(title);
			await page.getByLabel('Preis in Cent').fill(price);
			await page.getByLabel('Interne Notizen').fill(notes);
			await page.getByRole('button', { name: 'Artikel hinzufügen' }).click();
		}
		await page.waitForSelector('[data-testid=item-card]');
		const standLink = page.getByTestId('stand-page-link');
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
		await expect(standCards.filter({ hasText: 'Buch' })).toContainText('3,00');

		// act
		const unknownResponse = await anonymousPage.request.get('/stand/00000000-0000-0000-0000-000000000000');

		// assume
		expect(unknownResponse.status()).toBe(404);
		anonymousContext.close?.();
	});
});
