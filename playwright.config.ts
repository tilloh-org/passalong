import { defineConfig, devices } from '@playwright/test';

/**
 * Two specs need an instance with no accounts, because a takeover is only allowed before the first
 * account exists, and only once per instance: the instance-takeover smoke test, and the two-tenant
 * privacy spec, which imports two users through the takeover and then signs both of them in. Each
 * runs in its own project against its own freshly seeded instance. Every other spec registers its
 * own account on the shared instance.
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
			testIgnore: /instance-import\.spec\.ts|privacy-two-tenant\.spec\.ts/,
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
		},
		{
			name: 'privacy-two-tenant',
			testMatch: /privacy-two-tenant\.spec\.ts/,
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4175'
			}
		}
	],
	webServer: [
		{
			// The bootstrap manifest is a live regression guard: a fresh instance must ignore it and
			// keep browser registration open. If environment provisioning ever comes back, this server
			// starts with an account already present and every spec that registers fails.
			command: `rm -rf /tmp/passalong-e2e.sqlite* /tmp/passalong-e2e-media && npm run build && ORIGIN=http://localhost:4173 PASSALONG_DATABASE_PATH=/tmp/passalong-e2e.sqlite PASSALONG_MEDIA_ROOT=/tmp/passalong-e2e-media BODY_SIZE_LIMIT=256M PORT=4173 PASSALONG_BOOTSTRAP='{"accounts":[{"tenantName":"Bootstrap household","username":"bootstrap-admin","displayName":"Bootstrap Admin","password":"bootstrap-admin-password","instanceAdmin":true}]}' node build/index.js`,
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
		},
		{
			command:
				'rm -rf /tmp/passalong-e2e-privacy.sqlite* /tmp/passalong-e2e-privacy-media && ORIGIN=http://localhost:4175 PASSALONG_DATABASE_PATH=/tmp/passalong-e2e-privacy.sqlite PASSALONG_MEDIA_ROOT=/tmp/passalong-e2e-privacy-media BODY_SIZE_LIMIT=256M PORT=4175 node build/index.js',
			url: 'http://localhost:4175',
			reuseExistingServer: !process.env.CI,
			timeout: 120_000
		}
	]
});
