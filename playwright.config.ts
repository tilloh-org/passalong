import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 2 : undefined,
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
			'rm -rf /tmp/passalong-e2e.sqlite /tmp/passalong-e2e-media && npm run build && ORIGIN=http://localhost:4173 PASSALONG_DATABASE_PATH=/tmp/passalong-e2e.sqlite PASSALONG_MEDIA_ROOT=/tmp/passalong-e2e-media PORT=4173 node build/index.js',
		url: 'http://localhost:4173',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
