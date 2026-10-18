import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { finishMaintenance, startMaintenance } from '$lib/server/maintenance';
import { handle } from './hooks.server';

const temporaryDirectories: string[] = [];

/**
 * Create an isolated database path so the maintenance marker stays out of the real instance.
 *
 * @returns {string} Path of an empty SQLite database file.
 */
function createDatabasePath(): string {
	const directory = mkdtempSync(join(tmpdir(), 'passalong-hooks-'));
	temporaryDirectories.push(directory);
	return join(directory, 'passalong.sqlite');
}

afterAll(() => {
	delete process.env.PASSALONG_DATABASE_PATH;
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

interface HandleFixture {
	headers: Record<string, string>;
	response: Response;
}

/**
 * Run the hook for one request.
 *
 * @param {Record<string, string>} requestHeaders - Headers of the incoming request.
 * @param {{ databasePath: string, path?: string, resolved?: Response }} options - Database path,
 * requested path (defaults to the sign-in page) and the response the rest of the application
 * would produce.
 * @returns {Promise<HandleFixture>} The headers the hook set and the resulting response.
 */
async function runHandle(
	requestHeaders: string | Record<string, string>,
	options: { databasePath: string; path?: string; resolved?: Response }
): Promise<HandleFixture> {
	process.env.PASSALONG_DATABASE_PATH = options.databasePath;
	const headers: Record<string, string> = {};
	const resolved = options.resolved ?? new Response('<html></html>', { status: 200 });
	const url = new URL(options.path ?? '/', 'http://localhost/');
	const request =
		typeof requestHeaders === 'string'
			? new Request(url, { headers: { accept: requestHeaders } })
			: new Request(url, { headers: requestHeaders });
	const response = await handle({
		event: {
			request,
			url,
			setHeaders: (next: Record<string, string>) => Object.assign(headers, next)
		},
		resolve: async () => resolved
	} as never);
	return { headers, response };
}

describe('server hooks', () => {
	// One path for the whole file: the repository module caches the first resolved path, so a
	// second fixture path would leave `readMaintenanceState` looking at the wrong file.
	const databasePath = createDatabasePath();

	it('keeps a server-rendered page out of caches', async () => {
		// act
		const { headers } = await runHandle(
			'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			{ databasePath }
		);

		// assume
		expect(headers['cache-control']).toBe('private, no-store');
	});

	it('leaves assets and action answers without a cache policy of their own', async () => {
		// act
		const asset = await runHandle(
			{ accept: '*/*', 'sec-fetch-dest': 'script' },
			{ databasePath, resolved: new Response('body', { status: 200 }) }
		);
		const action = await runHandle('*/*', { databasePath });

		// assume
		expect(asset.headers['cache-control']).toBeUndefined();
		expect(action.headers['cache-control']).toBeUndefined();
	});

	it('answers a document during a maintenance window with the maintenance page', async () => {
		// arrange
		startMaintenance(databasePath, 'restore');

		// act — the sign-in page stays reachable during a window, so a protected page is asked for
		const { response, headers } = await runHandle('text/html', {
			databasePath,
			path: '/market-days'
		});

		// assume
		finishMaintenance(databasePath);
		expect(response.status).toBe(503);
		expect(response.headers.get('retry-after')).toBe('60');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.text()).toContain('Kurze Wartung');
		expect(headers).toEqual({});
	});
});
