import { defineConfig, devices } from '@playwright/test';

/**
 * The instance-takeover smoke test needs an instance with no accounts, because a takeover is only
 * allowed before the first account exists. Every other spec registers its own account, so that spec
 * runs in its own project against its own freshly seeded instance.
 */
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: [['list']],
	// Retry diagnostics were lost when baseURL moved into the projects; keep them here so a flaky CI
	// run still produces a trace.
	use: {
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			testIgnore: /instance-import\.spec\.ts/,
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4173',
				launchOptions: {
					args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
				}
			}
		},
		{
			name: 'instance-takeover',
			testMatch: /instance-import\.spec\.ts/,
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4174'
			}
		}
	],
	webServer: [
		{
			command:
				'rm -rf /tmp/passalong-e2e.sqlite* /tmp/passalong-e2e-media && npm run build && ORIGIN=http://localhost:4173 PASSALONG_DATABASE_PATH=/tmp/passalong-e2e.sqlite PASSALONG_MEDIA_ROOT=/tmp/passalong-e2e-media BODY_SIZE_LIMIT=256M PORT=4173 node build/index.js',
			url: 'http://localhost:4173',
			reuseExistingServer: !process.env.CI,
			timeout: 120_000
		},
		{
			command:
				'rm -rf /tmp/passalong-e2e-takeover.sqlite* /tmp/passalong-e2e-takeover-media && ORIGIN=http://localhost:4174 PASSALONG_DATABASE_PATH=/tmp/passalong-e2e-takeover.sqlite PASSALONG_MEDIA_ROOT=/tmp/passalong-e2e-takeover-media BODY_SIZE_LIMIT=256M PORT=4174 node build/index.js',
			url: 'http://localhost:4174',
			reuseExistingServer: !process.env.CI,
			timeout: 120_000
		}
	]
});
