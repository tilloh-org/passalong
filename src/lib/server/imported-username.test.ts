import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createCollectionRepository } from '$lib/server/collection-repository';
import { fixtureArchive, fixtureUser } from '$lib/server/exchange-fixture.test-helper';
import { importInstanceArchive } from '$lib/server/instance-import';

describe('imported username policy', () => {
	it('refuses an archive whose username cannot be used to sign in', async () => {
		// arrange — the product only accepts ^[a-z0-9._+-]{3,64}$ for usernames.
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-username-'));
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'AB' }),
			fixtureUser({ sourceId: 'u2', username: 'Avery Müller' })
		]);

		// act
		const outcome = await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'AB',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume
		expect(outcome.imported).toBe(false);
		expect(outcome.report.errors.join(' ')).toMatch(/username/i);
		const database = new Database(databasePath, { readonly: true });
		const users = database.prepare('SELECT COUNT(*) AS count FROM users').get() as {
			count: number;
		};
		database.close();
		expect(users.count).toBe(0);
		rmSync(workspace, { force: true, recursive: true });
	});

	it('stores an imported username in the normalized form the login expects', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-username-'));
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'Avery' })]);

		// act
		const outcome = await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume
		expect(outcome.imported).toBe(true);
		const database = new Database(databasePath, { readonly: true });
		const row = database.prepare('SELECT username FROM users').get() as { username: string };
		database.close();
		expect(row.username).toBe('avery');
		rmSync(workspace, { force: true, recursive: true });
	});
});
