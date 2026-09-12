import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

test.describe('Core collection', () => {
	test('rejects cross-site registration and completes the authenticated collection flow', async ({ page }) => {
		// arrange
		const registrations = [
			{ username: 'avery', displayName: 'Avery', password: 'correct-horse-battery-staple' },
			{ username: 'blake', displayName: 'Blake', password: 'another-correct-battery-horse' }
		];

		// act
		await page.goto('/');

		// assume
		const onboardingVisible = await page.getByRole('heading', { name: 'Ersten Zugang erstellen' }).isVisible().catch(() => false);
		const loginVisible = await page.getByRole('heading', { name: 'Anmelden' }).isVisible().catch(() => false);
		expect(onboardingVisible || loginVisible).toBe(true);
		if (onboardingVisible) {
			// act
			const rejectedRegistration = await page.request.post('/?/register', {
				form: registrations[0],
				headers: { Origin: 'https://attacker.example' }
			});

			// assume
			expect(rejectedRegistration.status()).toBe(403);

			// act
			await page.evaluate(async (accounts) => {
				return Promise.all(
					accounts.map(async (account) => {
						const response = await fetch('/?/register', {
							method: 'POST',
							headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
							body: new URLSearchParams(account),
							redirect: 'manual'
						});
						return response.status;
					})
				);
			}, registrations);
			await page.context().clearCookies();
			await page.goto('/');
		}

		// assume
		await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
		const loginForm = page.locator('form[action="?/login"]');

		// act
		await loginForm.getByLabel('Benutzername').fill(registrations[0].username);
		await loginForm.getByLabel('Passwort').fill(registrations[0].password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();
		// Wait for the post-login navigation to settle before deciding which account won;
		// an instant isVisible() races the redirect and flips the branch nondeterministically.
		// The authenticated state is signaled by the header avatar; a failed login keeps the form.
		const firstAccountWon = await page
			.getByTestId('profile-avatar-link')
			.or(page.getByRole('heading', { name: 'Anmelden' }))
			.waitFor()
			.then(() => page.getByTestId('profile-avatar-link').isVisible());
		let failedLoginCount = firstAccountWon ? 0 : 1;
		const winningAccount = registrations[firstAccountWon ? 0 : 1]!;
		const losingAccount = registrations[firstAccountWon ? 1 : 0]!;
		if (!firstAccountWon) {
			await page.goto('/');
			await loginForm.getByLabel('Benutzername').fill(winningAccount.username);
			await loginForm.getByLabel('Passwort').fill(winningAccount.password);
			await loginForm.getByRole('button', { name: 'Anmelden' }).click();
		}

		// assume — a fresh account sees the collection onboarding; a retry after a
		// mid-test failure lands on the portfolio heading with leftover data instead
		await expect(
			page.getByRole('heading', { name: 'Deine Sammlungen' }).or(page.getByRole('heading', { name: 'Portfolio', level: 1 }))
		).toBeVisible();

		// act
		await expect(page.getByRole('button', { name: 'Abmelden' })).toHaveCount(0);
		await page.getByTestId('profile-avatar-link').click();
		await expect(page).toHaveURL(/\/profile/);
		await expect(page.getByTestId('profile-logout')).toBeVisible();
		await expect(page.getByTestId('logout-panel')).toBeVisible();
		await expect(page.getByTestId('delete-account-panel')).toBeVisible();
		await page.getByTestId('profile-logout').click();
		await loginForm.getByLabel('Benutzername').fill(losingAccount.username);
		await loginForm.getByLabel('Passwort').fill(losingAccount.password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();

		// assume
		await expect(page.getByText('Benutzername oder Passwort ist nicht korrekt.')).toBeVisible();
		failedLoginCount += 1;

		// act
		await loginForm.getByLabel('Benutzername').fill(winningAccount.username);
		await loginForm.getByLabel('Passwort').fill(winningAccount.password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();

		// assume
		await expect(
			page.getByRole('heading', { name: 'Deine Sammlungen' }).or(page.getByRole('heading', { name: 'Portfolio', level: 1 }))
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'Scannen' })).toBeVisible();

		// act — open the seller scan page and return to the portfolio via the header
		await page.getByRole('link', { name: 'Scannen' }).click();
		await expect(page).toHaveURL(/\/scan/);
		await expect(page.getByRole('heading', { name: 'Artikel scannen' })).toBeVisible();
		await page.getByRole('link', { name: '+ Neu' }).click();
		await expect(
			page.getByRole('heading', { name: 'Deine Sammlungen' }).or(page.getByRole('heading', { name: 'Portfolio', level: 1 }))
		).toBeVisible();

		// act — create the second collection when the onboarding form is shown; on retries the
		// collection already exists and the test navigates through the switcher instead
		if (await page.getByLabel('Name der Sammlung').isVisible().catch(() => false)) {
			await page.getByLabel('Name der Sammlung').fill('Wohnzimmer-Ausmisten');
			await page.getByRole('button', { name: 'Sammlung anlegen' }).click();
		} else {
			// retry already runs inside a collection; the switcher is hidden — continue there
			await expect(page.getByRole('heading', { name: 'Portfolio', level: 1 })).toBeVisible();
		}

		// assume
		await expect(page.getByRole('heading', { name: 'Portfolio', level: 1 })).toBeVisible();

		// act — create the item once; retries reuse the leftover card with the same title
		if ((await page.getByTestId('item-card').filter({ hasText: 'Leselampe' }).count()) === 0) {
			const addItemForm = page.locator('form[action="?/addItem"]');
			await addItemForm.getByLabel('Artikelname').fill('Leselampe');
			await addItemForm.getByLabel('Preis (€)').fill('12,00');
			await addItemForm.getByLabel('Kategorie').selectOption('home');
			await addItemForm.getByLabel('Zustand').selectOption('good');
			await addItemForm.getByLabel('Externe Beschreibung (für Käufer sichtbar)').fill('Warme Leselampe mit flexiblem Arm.');
			await addItemForm.getByLabel('Interne Notizen (nur für dich sichtbar)').fill('Vor dem Inserieren die Glühbirne austauschen.');
			await page.getByTestId('item-complete-checkbox').check();
			await page.getByTestId('item-functional-checkbox').check();
			await page.getByRole('button', { name: 'Artikel hinzufügen' }).click();
		}

		// assume — a Leselampe card exists (leftovers from retries carry the same title)
		await expect(page.getByTestId('item-card').filter({ hasText: 'Leselampe' }).first()).toBeVisible();
		if (await page.getByTestId('manage-images-link').isVisible().catch(() => false)) {
			await expect(page.getByTestId('manage-images-link')).toHaveAttribute('href', /\/items\//);
		}

		// act
		const itemCard = page.getByTestId('item-card');

		// assume — the category pill always shows; the status badge is 'open' on first run
		// (retries may find the item already sold from the history flow)
		await expect(itemCard.locator('.kat')).toContainText('Haushalt');
		await expect(itemCard.locator('.badge.open').or(itemCard.locator('.badge.sold')).first()).toBeVisible();

		// act — filter the portfolio by search query
		await page.getByTestId('filter-search-input').fill('Leselampe');
		await page.getByTestId('filter-apply').click();

		// assume — the matching card stays visible
		await expect(page).toHaveURL(/q=Leselampe/);
		await expect(page.getByTestId('item-card')).toHaveCount(1);
		await expect(page.getByRole('heading', { name: 'Leselampe' })).toBeVisible();

		// act — narrow by category with no matches
		await page.getByTestId('filter-category-select').selectOption('books');
		await page.getByTestId('filter-apply').click();

		// assume — the filter empty state appears
		await expect(page).toHaveURL(/category=books/);
		await expect(page.getByTestId('filter-empty-state')).toBeVisible();

		// act — reset all filters
		await page.getByTestId('filter-reset').click();

		// assume — the card is visible again
		await expect(page.getByTestId('filter-empty-state')).toHaveCount(0);
		await expect(page.getByTestId('item-card')).toHaveCount(1);
		await expect(page.getByRole('heading', { name: 'Leselampe' })).toBeVisible();

		// act — open the detail page from the tile
		await itemCard.click();

		// assume
		await expect(page).toHaveURL(/\/items\//);
		const protectedUrl = page.url();
		await expect(page.getByRole('heading', { name: 'Leselampe' })).toBeVisible();
		// the sale form appears for open items; retries find the item already sold
		await expect(page.getByTestId('item-sale-section').or(page.getByTestId('unmark-item-sold').or(page.getByTestId('item-sold-badge'))).first()).toBeVisible();
		await expect(page.getByTestId('item-flag-pills')).toContainText('Haushalt');
		await expect(page.getByTestId('item-flag-pills')).toContainText('✓ Vollständig');
		await expect(page.getByTestId('item-flag-pills')).toContainText('✓ Funktionsfähig');
		await expect(page.getByTestId('item-external-description')).toContainText('Warme Leselampe');
		await expect(page.getByTestId('item-internal-notes')).toContainText('Glühbirne');
		await expect(page.getByTestId('item-qr-panel')).toBeVisible();
		const qrDownload = page.getByTestId('item-qr-download');
		await expect(qrDownload).toHaveAttribute('download', /qr-.+\.png/);
		await expect(qrDownload).toHaveAttribute('href', /^data:image\/png;base64,/);
		await expect(page.getByTestId('item-qr-image')).toBeVisible();

		// act — undo the leftover sale (retries find the item already sold), then reserve
		if (await page.getByTestId('unmark-item-sold').isVisible().catch(() => false)) {
			await page.getByTestId('unmark-item-sold').click();
		}
		await page.getByTestId('toggle-item-reservation').click();
		await expect(page.getByTestId('item-reserved-badge')).toBeVisible();
		await page.getByTestId('toggle-item-reservation').click();
		await expect(page.getByTestId('item-reserved-badge')).toHaveCount(0);

		// act — upload two photos once; retries reuse the leftover images (the dialog
		// trigger label carries the stored image count, e.g. "🖼 Bilder (2)")
		const storedImageCount = await page.getByTestId('images-dialog-trigger').evaluate((el) => {
			const match = /\((\d+)\)/.exec(el.textContent ?? '');
			return match ? Number(match[1]) : 0;
		});
		if (storedImageCount === 0) {
		const testPngBytes = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
			'base64'
		);
		const secondPngBytes = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/AAAMBAQAY3Y2wAAAAAElFTkSuQmCC',
			'base64'
		);
		await page.getByTestId('images-dialog-trigger').click();
		await expect(page.getByTestId('images-dialog')).toBeVisible();
		await page.getByTestId('item-image-input').setInputFiles([
			{ name: 'leselampe.png', mimeType: 'image/png', buffer: testPngBytes },
			{ name: 'leselampe-detail.png', mimeType: 'image/png', buffer: secondPngBytes }
		]);
		await page.getByRole('button', { name: 'Foto speichern' }).click();
		}

		// assume — both stored; cover auto-assigned to the first upload
		await page.getByTestId('images-dialog-trigger').click();
		await expect(page.getByTestId('images-dialog')).toBeVisible();
		// retries may carry extra stored images; a cover must exist either way
		await expect(page.getByTestId('item-image-key').filter({ hasText: 'Titelbild' }).first()).toBeVisible();
		await expect(page.locator('img.cover')).toBeVisible();

		// act — pick the second image as cover inside the preview dialog (only when a second image exists)
		if ((await page.getByTestId('item-image-key').count()) >= 2) {
			await page.getByTestId('set-item-cover').click();

			// assume — the cover moved to the second image
			await expect(page.getByTestId('item-image-key').nth(1)).toContainText('Titelbild');
		}
		// dialog closed itself after the set-cover redirect

		// act — create a market day and register a linked sale from the item detail page
		const marketDayName = 'Saturday market';
		await page.request.post('/market-days?/createMarketDay', {
			form: {
				name: marketDayName,
				date: '2026-05-16',
				startTime: '',
				endTime: '',
				location: '',
				notes: ''
			},
			headers: { Origin: 'http://localhost:4173' }
		});
		await page.reload();
		await page.getByTestId('item-proceeds').fill('9,50');
		await page.getByTestId('item-market-day').selectOption({ label: marketDayName });
		await page.getByTestId('mark-item-sold').click();

		// assume
		await expect(page.getByTestId('item-sold-badge')).toBeVisible();
		await expect(page.getByTestId('item-sold-badge')).toContainText('9,50 €');

		// act — open the read-only sale history and verify the compact sale row
		await page.getByTestId('nav-sale-history-link').click();
		await expect(page).toHaveURL(/\/sales/);
		const saleRow = page.getByTestId('sale-history-item').filter({ hasText: 'Leselampe' });
		await expect(saleRow).toContainText(marketDayName);
		await expect(saleRow).toContainText('9,50 €');
		await expect(saleRow).toContainText('Flohmarkt');
		await expect(saleRow.getByTestId('sale-history-edit')).toHaveCount(0);
		await expect(saleRow.getByTestId('sale-history-reopen')).toHaveCount(0);

		// act — filter by the item's category and verify the row stays listed
		await page.getByTestId('sale-history-filters').getByLabel('Kategorie').selectOption('home');
		await page.getByTestId('sale-history-filters').getByRole('button', { name: 'Filtern' }).click();

		// assume — the filtered history still shows the sale with the range in the URL
		await expect(page).toHaveURL(/category=home/);
		await expect(page.getByTestId('sale-history-item')).toHaveCount(1);

		// act — filter by an proceeds range that excludes the sale
		await page.getByTestId('sale-history-filters').getByLabel('Erlös von (€)').fill('20');
		await page.getByTestId('sale-history-filters').getByRole('button', { name: 'Filtern' }).click();

		// assume
		await expect(page).toHaveURL(/proceedsMin=20/);
		await expect(page.getByTestId('sale-history-empty')).toBeVisible();

// act — check the dedicated statistics page via the nav link
		await page.getByTestId('nav-statistics-link').click();
		await expect(page).toHaveURL(/\/statistics/);
		const totals = page.getByTestId('statistics-totals');
		await expect(totals).toContainText('Bruttoeinnahmen');
		await expect(totals).toContainText('9,50 €');
		await expect(page.getByTestId('statistics-trend')).toContainText('9,50');
		await expect(page.getByTestId('statistics-categories')).toContainText('Haushalt');
		await expect(page.getByTestId('statistics-market-days')).toContainText(marketDayName);

		// act — restrict the statistics period to a range without activity
		await page.getByTestId('statistics-period').getByLabel('Von (Datum)').fill('2026-01-01');
		await page.getByTestId('statistics-period').getByLabel('Bis (Datum)').fill('2026-01-31');
		await page.getByTestId('statistics-period').getByRole('button', { name: 'Filtern' }).click();

		// assume — totals and trend both show the empty period
		await expect(page).toHaveURL(/from=2026-01-01/);
		await expect(page.getByTestId('statistics-empty')).toBeVisible();

		// act — edit the item through the edit dialog
		await page.goto(protectedUrl);
		await expect(page.getByTestId('edit-dialog-trigger')).toBeVisible();
		await page.getByTestId('edit-dialog-trigger').click();
		await expect(page.getByTestId('edit-dialog')).toBeVisible();
		await page.getByLabel('Artikelname').fill('Leselampe (gebraucht)');
		await page.getByTestId('edit-dialog').getByRole('button', { name: 'Änderungen speichern' }).click();

		// assume
		await expect(page.getByRole('heading', { name: 'Leselampe (gebraucht)' })).toBeVisible();

		// act — go back to the portfolio via the header and check the sale statistics
		// (the item is still sold from the history flow, so no quick-sell happens here)
		await page.getByRole('link', { name: '+ Neu' }).click();
		await expect(page.getByRole('heading', { name: 'Portfolio', level: 1 })).toBeVisible();

		// assume
		await expect(page.getByTestId('item-sold-badge').first()).toBeVisible();
		await expect(page.getByTestId('sale-statistics')).toContainText('1 Artikel verkauft');
		await expect(page.getByTestId('sale-statistics')).toContainText('9,50 € Erlös');
		await expect(page.getByTestId('sale-statistics-channels')).toContainText('Flohmarkt');
		const currentMonth = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
		await expect(page.getByTestId('sale-statistics-months')).toContainText(currentMonth);

		// act — create a second collection and keep filtering inside it
		await page.evaluate(async (collectionName) => {
			await fetch('/?/createCollection', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ collectionName })
			});
		}, 'Arbeitszimmer');
		await page.goto('/');
		await expect(page.getByTestId('collection-switcher')).toBeVisible();
		await page.getByTestId('collection-switcher').getByRole('link', { name: 'Arbeitszimmer' }).click();
		await expect(page).toHaveURL(/collection=/);
		await expect(page.getByRole('heading', { name: 'Portfolio', level: 1 })).toBeVisible();

		// act
		const secondCollectionItemForm = page.locator('form[action="?/addItem"]');
		await secondCollectionItemForm.getByLabel('Artikelname').fill('Schreibtisch');
		await secondCollectionItemForm.getByLabel('Preis (€)').fill('80,00');
		await secondCollectionItemForm.getByLabel('Kategorie').selectOption('furniture');
		await secondCollectionItemForm.getByLabel('Zustand').selectOption('fair');
		await secondCollectionItemForm.getByLabel('Externe Beschreibung (für Käufer sichtbar)').fill('Großer Arbeitstisch mit Schublade.');
		await secondCollectionItemForm.getByLabel('Interne Notizen (nur für dich sichtbar)').fill('Nur per Abholung anbieten.');
		await page.getByTestId('item-complete-checkbox').check();
		await page.getByTestId('item-functional-checkbox').check();
		await page.getByRole('button', { name: 'Artikel hinzufügen' }).click();

		// assume
		await expect(page.getByRole('heading', { name: 'Schreibtisch' })).toBeVisible();

		// act — filter the second collection and keep the collection in the URL
		await page.getByTestId('filter-search-input').fill('Schreibtisch');
		await page.getByTestId('filter-apply').click();

		// assume — the filter stays scoped to the selected collection
		await expect(page).toHaveURL(/collection=.*q=Schreibtisch/);
		await expect(page.getByTestId('item-card')).toHaveCount(1);
		await expect(page.getByRole('heading', { name: 'Schreibtisch' })).toBeVisible();

		// act — open the profile page via the header avatar and change the display name
		await page.getByTestId('profile-avatar-link').click();
		await expect(page).toHaveURL(/\/profile/);
		await expect(page.getByTestId('profile-avatar')).toBeVisible();
		// assume — the avatar save button is disabled until an image file is selected
		await expect(page.getByRole('button', { name: 'Avatar speichern' })).toBeDisabled();
		await page.getByTestId('display-name-input').fill('Avery Profil');
		await page.getByTestId('save-profile').click();

		// assume
		await expect(page.getByTestId('display-name-input')).toHaveValue('Avery Profil');

		// act — save a stand introduction and verify it on the public stand page
		await expect(page.getByTestId('stand-panel')).toBeVisible();
		// assume — the intro save button is disabled until the draft differs from the stored intro
		await expect(page.getByTestId('save-stand-intro')).toBeDisabled();
		await page.getByTestId('stand-intro-input').fill('Alles muss raus — von Deko bis Technik.');
		await expect(page.getByTestId('save-stand-intro')).toBeEnabled();
		await page.getByTestId('save-stand-intro').click();
		await expect(page).toHaveURL(/\/profile/);
		const standHref = await page.getByTestId('open-stand-link').getAttribute('href');
		const standPage = await page.context().newPage();
		await standPage.goto(`http://localhost:4173${standHref}`);
		await expect(standPage.getByTestId('stand-intro')).toContainText('Alles muss raus');

		// act — change the password through the profile page (the fresh cookie keeps the session)
		await page.getByLabel('Aktuelles Passwort').fill(winningAccount.password);
		await page.getByLabel('Neues Passwort').fill('profile-changed-password-2026');
		await Promise.all([
			page.waitForResponse((response) => response.url().includes('changePassword')),
			page.getByTestId('save-password').click()
		]);
		await expect(page).toHaveURL(/\/profile/);

		// assume — the session survives the password change via the re-issued cookie
		await expect(page.getByTestId('profile-avatar')).toBeVisible();

		// act — restore the original password
		await page.getByLabel('Aktuelles Passwort').fill('profile-changed-password-2026');
		await page.getByLabel('Neues Passwort').fill(winningAccount.password);
		await Promise.all([
			page.waitForResponse((response) => response.url().includes('changePassword')),
			page.getByTestId('save-password').click()
		]);
		await expect(page).toHaveURL(/\/profile/);
		await expect(page.getByTestId('profile-avatar')).toBeVisible();


		// act — verify the protected detail page requires login again
		await page.context().clearCookies();
		await page.goto(protectedUrl);

		// assume
		await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
		await expect(page.getByText('Vor dem Inserieren die Glühbirne austauschen.')).not.toBeVisible();

		// act
		await loginForm.getByLabel('Benutzername').fill(winningAccount.username);
		await loginForm.getByLabel('Passwort').fill(winningAccount.password);
		await loginForm.getByRole('button', { name: 'Anmelden' }).click();
		await page.getByTestId('profile-avatar-link').click();
		await expect(page).toHaveURL(/\/profile/);
		await page.getByTestId('instance-admin-link').click();
		await expect(page).toHaveURL(/\/admin/);
		const instanceAdministrationForm = page.locator('form[action="?/createPasswordReset"]');
		await instanceAdministrationForm.getByLabel('Benutzername des Kontos').fill(winningAccount.username);
		await instanceAdministrationForm.getByRole('button', { name: 'Zurücksetzungscode erzeugen' }).click();
		const resetSecret = await page.getByTestId('issued-password-reset-secret').textContent();

		// assume
		expect(resetSecret).toMatch(/^[A-Za-z0-9_-]+$/);

		// act — the reset revoked the own session; use the code on the anonymous login page
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
		await page.locator('.reset-toggle').click();
		const resetForm = page.locator('form[action="?/resetPassword"]');
		await resetForm.getByLabel('Benutzername').fill(winningAccount.username);
		await resetForm.getByLabel('Zurücksetzungscode').fill(resetSecret!);
		await resetForm.getByLabel('Neues Passwort').fill('recovered-correct-battery-horse');
		await resetForm.getByRole('button', { name: 'Passwort zurücksetzen' }).click();

		// assume
		await expect(page.getByRole('heading', { name: 'Portfolio', level: 1 })).toBeVisible();

		// act — restore the original password via the profile page
		await page.getByTestId('profile-avatar-link').click();
		const changeForm = page.locator('form[action="?/changePassword"]');
		await changeForm.getByLabel('Aktuelles Passwort').fill('recovered-correct-battery-horse');
		await changeForm.getByLabel('Neues Passwort').fill('correct-horse-battery-staple');
		await Promise.all([
			page.waitForResponse((response) => response.url().includes('changePassword')),
			changeForm.getByRole('button', { name: 'Passwort speichern' }).click()
		]);

		// assume
		await expect(page).toHaveURL(/\/profile/);

		// act — the admin opens the admin area and sees the backup panel, then downloads a full instance backup
		await page.getByTestId('instance-admin-link').click();
		await expect(page).toHaveURL(/\/admin/);
		await expect(page.getByTestId('backup-panel')).toBeVisible();
		// assume — the restore action is disabled until a backup file is selected
		await expect(page.getByTestId('restore-submit')).toBeDisabled();
		const backupResponse = await page.request.get('/profile/backup');
		expect(backupResponse.status()).toBe(200);
		expect(backupResponse.headers()['content-type']).toContain('application/zip');
		const backupBody = await backupResponse.body();
		expect(backupBody.length).toBeGreaterThan(1000);

		// act — return to the profile page and delete the account after confirming the username
		await page.goto('/profile');
		await expect(page.getByTestId('delete-account-panel')).toBeVisible();
		await expect(page.getByTestId('delete-account-dialog')).toBeHidden();
		await page.getByTestId('delete-account-trigger').click();
		await expect(page.getByTestId('delete-account-dialog')).toBeVisible();
		await expect(page.getByTestId('delete-account-submit')).toBeDisabled();
		await page.getByTestId('delete-account-input').fill(winningAccount.username);
		await expect(page.getByTestId('delete-account-submit')).toBeEnabled();
		await page.getByTestId('delete-account-submit').click();

		// assume
		await expect(page).toHaveURL('/');
		await expect(page.getByRole('heading', { name: 'Ersten Zugang erstellen' })).toBeVisible();
	});
});