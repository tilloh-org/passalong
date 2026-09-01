import { expect, test } from '@playwright/test';
import { sharedTestAccount } from './test-account';

test.describe('Login rate limiting', () => {
	test('locks further login attempts after the configured failure limit', async ({ page }) => {
		// arrange
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();

		// act
		const failedLoginAttempts = [];
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const response = await page.request.post('/?/login', {
				form: { username: 'x', password: 'not-a-password' },
				headers: { Origin: 'http://localhost:4173' }
			});
			failedLoginAttempts.push({ actionStatus: (await response.json()).status, responseStatus: response.status() });
		}
		const blockedResponse = await page.request.post('/?/login', {
			form: { username: 'x', password: 'not-a-password' },
			headers: { Origin: 'http://localhost:4173' }
		});
		const blockedResponseStatus = blockedResponse.status();
		const blockedActionStatus = (await blockedResponse.json()).status;

		// assume
		const actionStatuses = failedLoginAttempts.map((attempt) => attempt.actionStatus);
		expect(actionStatuses).toContain(401);
		expect(blockedResponseStatus).toBe(200);
		expect(blockedActionStatus).toBe(429);
	});
});
