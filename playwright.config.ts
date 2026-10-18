import { defineConfig, devices } from '@playwright/test';

import { restoreInstancePaths } from './e2e/restore-instance';

/**
 * Two specs need an instance with no accounts, because a takeover is only allowed before the first
 * account exists, and only once per instance: the instance-takeover smoke test, and the two-tenant
 * privacy spec, which imports two users through the takeover and then signs both of them in. Each
 * runs in its own project against its own freshly seeded instance. Every other spec registers its
 * own account on the shared instance. The A4 label proof is the exception: it seeds a whole sheet
 * of items, so it runs on its own instance and leaves the item counts of the shared instance alone.
 * The CSV reconciliation and statistics proofs do the same: they create market days, sales and
 * expenses, which would move the market-day and statistics assertions of the shared instance.
 * The restore proof is the outermost case: it replaces the database of its instance while the
 * server runs.
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
			testIgnore:
				/instance-import\.spec\.ts|privacy-two-tenant\.spec\.ts|admin-accounts\.spec\.ts|price-labels\.spec\.ts|reconciliation-csv\.spec\.ts|statistics-correction\.spec\.ts|restore-proof\.spec\.ts/,
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
			// Account administration needs the first registration to be a known administrator, so
			// it runs against its own fresh instance like the takeover and privacy projects.
			name: 'admin-accounts',
			testMatch: /admin-accounts\.spec\.ts/,
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4176'
			}
		},
		{
			name: 'sales-proofs',
			testMatch: /reconciliation-csv\.spec\.ts|statistics-correction\.spec\.ts/,
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4178'
			}
		},
		{
			// The restore proof replaces the database of its instance, so it must not share one.
			name: 'restore-proofs',
			testMatch: /restore-proof\.spec\.ts/,
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4179'
			}
		},
		{
			name: 'price-labels',
			testMatch: /price-labels\.spec\.ts/,
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4177'
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
		},
		{
			command:
				'rm -rf /tmp/passalong-e2e-accounts.sqlite* /tmp/passalong-e2e-accounts-media && ORIGIN=http://localhost:4176 PASSALONG_DATABASE_PATH=/tmp/passalong-e2e-accounts.sqlite PASSALONG_MEDIA_ROOT=/tmp/passalong-e2e-accounts-media BODY_SIZE_LIMIT=256M PORT=4176 node build/index.js',
			url: 'http://localhost:4176',
			reuseExistingServer: !process.env.CI,
			timeout: 120_000
		},
		{
			// The label proof seeds a sheet of items, so it gets a database of its own.
			command:
				'rm -rf /tmp/passalong-e2e-labels.sqlite* /tmp/passalong-e2e-labels-media && ORIGIN=http://localhost:4177 PASSALONG_DATABASE_PATH=/tmp/passalong-e2e-labels.sqlite PASSALONG_MEDIA_ROOT=/tmp/passalong-e2e-labels-media BODY_SIZE_LIMIT=256M PORT=4177 node build/index.js',
			url: 'http://localhost:4177',
			reuseExistingServer: !process.env.CI,
			timeout: 120_000
		},
		{
			// The sales proofs create market days, sales and expenses, so they get their own database.
			command:
				'rm -rf /tmp/passalong-e2e-sales.sqlite* /tmp/passalong-e2e-sales-media && ORIGIN=http://localhost:4178 PASSALONG_DATABASE_PATH=/tmp/passalong-e2e-sales.sqlite PASSALONG_MEDIA_ROOT=/tmp/passalong-e2e-sales-media BODY_SIZE_LIMIT=256M PORT=4178 node build/index.js',
			url: 'http://localhost:4178',
			reuseExistingServer: !process.env.CI,
			timeout: 120_000
		},
		{
			// The restore proof swaps the database of this instance while the server runs, so it
			// keeps its own database and media folder (see `e2e/restore-instance.ts`).
			command: `rm -rf ${restoreInstancePaths.database}* ${restoreInstancePaths.mediaRoot} && ORIGIN=http://localhost:4179 PASSALONG_DATABASE_PATH=${restoreInstancePaths.database} PASSALONG_MEDIA_ROOT=${restoreInstancePaths.mediaRoot} BODY_SIZE_LIMIT=256M PORT=4179 node build/index.js`,
			url: 'http://localhost:4179',
			reuseExistingServer: !process.env.CI,
			timeout: 120_000
		}
	]
});
