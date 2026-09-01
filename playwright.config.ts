import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: [['list']],
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: {
		command:
			'rm -rf /tmp/passalong-e2e.sqlite /tmp/passalong-e2e-media && npm run build && ORIGIN=http://localhost:4173 PASSALONG_DATABASE_PATH=/tmp/passalong-e2e.sqlite PASSALONG_MEDIA_ROOT=/tmp/passalong-e2e-media BODY_SIZE_LIMIT=6M PORT=4173 node build/index.js',
		url: 'http://localhost:4173',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
