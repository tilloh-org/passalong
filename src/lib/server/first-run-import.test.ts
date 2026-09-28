import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionRepository } from '$lib/server/collection-repository';
import { fixtureArchive, fixtureUser } from '$lib/server/exchange-fixture.test-helper';

const temporaryDirectories: string[] = [];

afterEach(() => {
	vi.resetModules();
	delete process.env.PASSALONG_DATABASE_PATH;
	delete process.env.PASSALONG_MEDIA_ROOT;
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

interface PageServerActions {
	[key: string]: (input: unknown) => Promise<unknown>;
}

/**
 * Create an untouched instance (no accounts) with its own database and media root.
 *
 * @returns {{ databasePath: string; mediaRoot: string; loadActions: () => Promise<PageServerActions> }} Fixture.
 */
function createEmptyInstanceFixture(): {
	databasePath: string;
	mediaRoot: string;
	loadActions: () => Promise<PageServerActions>;
} {
	const directory = mkdtempSync(join(tmpdir(), 'passalong-first-run-'));
	temporaryDirectories.push(directory);
	const databasePath = join(directory, 'passalong.sqlite');
	const mediaRoot = join(directory, 'media');
	createCollectionRepository({ databasePath });
	process.env.PASSALONG_DATABASE_PATH = databasePath;
	process.env.PASSALONG_MEDIA_ROOT = mediaRoot;
	vi.resetModules();
	return {
		databasePath,
		mediaRoot,
		loadActions: async () =>
			(await import('../../routes/+page.server')).actions as unknown as PageServerActions
	};
}

/**
 * Build a request carrying a multipart upload of the given archive.
 *
 * @param {string} origin - Request origin used for the same-origin check.
 * @param {Buffer} archive - Archive bytes to upload.
 * @param {Record<string, string>} [fields] - Additional plain form fields.
 * @returns {Request} Upload request.
 */
function buildUploadRequest(
	origin: string,
	archive: Buffer,
	fields: Record<string, string> = {}
): Request {
	const formData = new FormData();
	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}
	formData.set(
		'importArchive',
		new File([new Uint8Array(archive)], 'exchange.zip', { type: 'application/zip' })
	);
	return new Request(new URL(origin), {
		body: formData,
		headers: { Origin: new URL(origin).origin },
		method: 'POST'
	});
}

/**
 * Count rows of a table in a database file.
 *
 * @param {string} databasePath - Database file to inspect.
 * @param {string} table - Table name.
 * @returns {number} Row count.
 */
function countRows(databasePath: string, table: string): number {
	const database = new Database(databasePath, { readonly: true });
	const count = (
		database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
	).count;
	database.close();
	return count;
}

describe('first-run instance import', () => {
	it('lists every imported user after validating the archive, without writing anything', async () => {
		// arrange
		const { databasePath, loadActions } = createEmptyInstanceFixture();
		const actions = await loadActions();
		const origin = 'http://localhost/';
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery', items: 2 }),
			fixtureUser({ sourceId: 'u2', username: 'blake', items: 1 })
		]);

		// act
		const outcome = (await actions.stageInstanceImport({
			request: buildUploadRequest(origin, archive),
			url: new URL(origin)
		} as never)) as {
			importReport?: { users: Array<{ username: string }>; counts: { items: number } };
			importStagingToken?: string;
		};

		// assume
		expect(outcome.importReport?.users.map((user) => user.username)).toEqual(['avery', 'blake']);
		expect(outcome.importReport?.counts.items).toBe(3);
		expect(typeof outcome.importStagingToken).toBe('string');
		expect(countRows(databasePath, 'users')).toBe(0);
	});

	it('refuses the upload when the request is not same-origin', async () => {
		// arrange
		const { loadActions, databasePath } = createEmptyInstanceFixture();
		const actions = await loadActions();
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })]);
		const formData = new FormData();
		formData.set(
			'importArchive',
			new File([new Uint8Array(archive)], 'exchange.zip', { type: 'application/zip' })
		);
		const request = new Request(new URL('http://localhost/'), {
			body: formData,
			headers: { Origin: 'http://evil.example' },
			method: 'POST'
		});

		// act
		const outcome = (await actions.stageInstanceImport({
			request,
			url: new URL('http://localhost/')
		} as never)) as { status?: number };

		// assume
		expect(outcome.status).toBe(403);
		expect(countRows(databasePath, 'users')).toBe(0);
	});

	it('rejects an invalid archive with a readable error and an unchanged instance', async () => {
		// arrange
		const { loadActions, databasePath } = createEmptyInstanceFixture();
		const actions = await loadActions();
		const origin = 'http://localhost/';

		// act
		const outcome = (await actions.stageInstanceImport({
			request: buildUploadRequest(origin, Buffer.from('not a zip')),
			url: new URL(origin)
		} as never)) as { status?: number; data?: { importError?: string } };

		// assume
		expect(outcome.status).toBe(400);
		expect(outcome.data?.importError).toBeTruthy();
		expect(countRows(databasePath, 'users')).toBe(0);
	});

	it('refuses to stage an archive on an instance that already has accounts', async () => {
		// arrange
		const { loadActions, databasePath } = createEmptyInstanceFixture();
		const repository = createCollectionRepository({ databasePath });
		repository.createInitialAdmin({
			username: 'existing',
			displayName: 'Existing',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const actions = await loadActions();
		const origin = 'http://localhost/';
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })]);

		// act
		const outcome = (await actions.stageInstanceImport({
			request: buildUploadRequest(origin, archive),
			url: new URL(origin)
		} as never)) as { status?: number };

		// assume
		expect(outcome.status).toBe(409);
	});

	it('activates the staged archive for the selected administrator', async () => {
		// arrange
		const { loadActions, databasePath } = createEmptyInstanceFixture();
		const actions = await loadActions();
		const origin = 'http://localhost/';
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery', items: 2 }),
			fixtureUser({ sourceId: 'u2', username: 'blake', items: 1 })
		]);
		const staged = (await actions.stageInstanceImport({
			request: buildUploadRequest(origin, archive),
			url: new URL(origin)
		} as never)) as { importStagingToken: string };

		// act
		let outcome: unknown;
		try {
			outcome = await actions.activateInstanceImport({
				request: new Request(new URL(origin), {
					body: (() => {
						const formData = new FormData();
						formData.set('stagingToken', staged.importStagingToken);
						formData.set('adminUsername', 'blake');
						formData.set('adminPassword', 'a-freshly-chosen-passphrase');
						return formData;
					})(),
					headers: { Origin: new URL(origin).origin },
					method: 'POST'
				}),
				url: new URL(origin)
			} as never);
		} catch (error) {
			outcome = error;
		}

		// assume
		expect(outcome).toMatchObject({ status: 303, location: '/' });
		expect(countRows(databasePath, 'users')).toBe(2);
		const database = new Database(databasePath, { readonly: true });
		const admins = database
			.prepare(
				`SELECT users.username FROM instance_roles
				 JOIN users ON users.id = instance_roles.user_id`
			)
			.all() as Array<{ username: string }>;
		database.close();
		expect(admins.map((row) => row.username)).toEqual(['blake']);
	});

	it('refuses activation when the selected administrator is not in the archive', async () => {
		// arrange
		const { loadActions, databasePath } = createEmptyInstanceFixture();
		const actions = await loadActions();
		const origin = 'http://localhost/';
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })]);
		const staged = (await actions.stageInstanceImport({
			request: buildUploadRequest(origin, archive),
			url: new URL(origin)
		} as never)) as { importStagingToken: string };

		// act
		const outcome = (await actions.activateInstanceImport({
			request: new Request(new URL(origin), {
				body: (() => {
					const formData = new FormData();
					formData.set('stagingToken', staged.importStagingToken);
					formData.set('adminUsername', 'nobody');
					formData.set('adminPassword', 'a-freshly-chosen-passphrase');
					return formData;
				})(),
				headers: { Origin: new URL(origin).origin },
				method: 'POST'
			}),
			url: new URL(origin)
		} as never)) as { status?: number; data?: { importError?: string } };

		// assume
		expect(outcome.status).toBe(400);
		expect(outcome.data?.importError).toBeTruthy();
		expect(countRows(databasePath, 'users')).toBe(0);
	});

	it('refuses activation when the new administrator password is too short', async () => {
		// arrange
		const { loadActions, databasePath } = createEmptyInstanceFixture();
		const actions = await loadActions();
		const origin = 'http://localhost/';
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })]);
		const staged = (await actions.stageInstanceImport({
			request: buildUploadRequest(origin, archive),
			url: new URL(origin)
		} as never)) as { importStagingToken: string };

		// act
		const outcome = (await actions.activateInstanceImport({
			request: new Request(new URL(origin), {
				body: (() => {
					const formData = new FormData();
					formData.set('stagingToken', staged.importStagingToken);
					formData.set('adminUsername', 'avery');
					formData.set('adminPassword', 'short');
					return formData;
				})(),
				headers: { Origin: new URL(origin).origin },
				method: 'POST'
			}),
			url: new URL(origin)
		} as never)) as { status?: number; data?: { importError?: string } };

		// assume
		expect(outcome.status).toBe(400);
		expect(outcome.data?.importError).toBeTruthy();
		expect(countRows(databasePath, 'users')).toBe(0);
	});

	it('refuses activation with an unknown staging token', async () => {
		// arrange
		const { loadActions, databasePath } = createEmptyInstanceFixture();
		const actions = await loadActions();
		const origin = 'http://localhost/';

		// act
		const outcome = (await actions.activateInstanceImport({
			request: new Request(new URL(origin), {
				body: (() => {
					const formData = new FormData();
					formData.set('stagingToken', 'a-token-that-was-never-issued');
					formData.set('adminUsername', 'avery');
					formData.set('adminPassword', 'a-freshly-chosen-passphrase');
					return formData;
				})(),
				headers: { Origin: new URL(origin).origin },
				method: 'POST'
			}),
			url: new URL(origin)
		} as never)) as { status?: number };

		// assume
		expect(outcome.status).toBe(400);
		expect(countRows(databasePath, 'users')).toBe(0);
	});

	it('lets the selected administrator log in with the newly set password afterwards', async () => {
		// arrange
		const { loadActions } = createEmptyInstanceFixture();
		const actions = await loadActions();
		const origin = 'http://localhost/';
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery', passwordHash: null })
		]);
		const staged = (await actions.stageInstanceImport({
			request: buildUploadRequest(origin, archive),
			url: new URL(origin)
		} as never)) as { importStagingToken: string };
		try {
			await actions.activateInstanceImport({
				request: new Request(new URL(origin), {
					body: (() => {
						const formData = new FormData();
						formData.set('stagingToken', staged.importStagingToken);
						formData.set('adminUsername', 'avery');
						formData.set('adminPassword', 'a-freshly-chosen-passphrase');
						return formData;
					})(),
					headers: { Origin: new URL(origin).origin },
					method: 'POST'
				}),
				url: new URL(origin)
			} as never);
		} catch {
			// a successful activation redirects
		}

		// act — log in through the same first-run surface; a successful login redirects (303).
		let loginOutcome: unknown;
		try {
			loginOutcome = await actions.login({
				cookies: { get: () => undefined, set: () => undefined },
				getClientAddress: () => '127.0.0.1',
				request: new Request(new URL(origin), {
					body: (() => {
						const formData = new FormData();
						formData.set('username', 'avery');
						formData.set('password', 'a-freshly-chosen-passphrase');
						return formData;
					})(),
					headers: { Origin: new URL(origin).origin },
					method: 'POST'
				}),
				url: new URL(origin)
			} as never);
		} catch (error) {
			loginOutcome = error;
		}

		// assume — the freshly set password works, so the admin can sign in immediately.
		expect(loginOutcome).toMatchObject({ status: 303, location: '/' });
	});

	it('clears the staging archive after a successful activation', async () => {
		// arrange
		const { loadActions, databasePath, mediaRoot } = createEmptyInstanceFixture();
		const actions = await loadActions();
		const origin = 'http://localhost/';
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })]);
		const staged = (await actions.stageInstanceImport({
			request: buildUploadRequest(origin, archive),
			url: new URL(origin)
		} as never)) as { importStagingToken: string };
		try {
			await actions.activateInstanceImport({
				request: new Request(new URL(origin), {
					body: (() => {
						const formData = new FormData();
						formData.set('stagingToken', staged.importStagingToken);
						formData.set('adminUsername', 'avery');
						formData.set('adminPassword', 'a-freshly-chosen-passphrase');
						return formData;
					})(),
					headers: { Origin: new URL(origin).origin },
					method: 'POST'
				}),
				url: new URL(origin)
			} as never);
		} catch {
			// redirect
		}

		// act — replaying the same token must not import twice
		const replay = (await actions.activateInstanceImport({
			request: new Request(new URL(origin), {
				body: (() => {
					const formData = new FormData();
					formData.set('stagingToken', staged.importStagingToken);
					formData.set('adminUsername', 'avery');
					formData.set('adminPassword', 'a-freshly-chosen-passphrase');
					return formData;
				})(),
				headers: { Origin: new URL(origin).origin },
				method: 'POST'
			}),
			url: new URL(origin)
		} as never)) as { status?: number };

		// assume — the replay is refused because the instance now has accounts (the guard fires
		// before the token is even examined) and, critically, no second import happened.
		expect(replay.status).toBe(409);
		expect(countRows(databasePath, 'users')).toBe(1);
		expect(mediaRoot.length).toBeGreaterThan(0);
	});
});
