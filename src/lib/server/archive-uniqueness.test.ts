import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createCollectionRepository } from '$lib/server/collection-repository';
import { fixtureArchive, fixtureUser } from '$lib/server/exchange-fixture.test-helper';
import { importInstanceArchive } from '$lib/server/instance-import';

/**
 * Count imported records in a database file.
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

describe('archive identifier uniqueness', () => {
	it('refuses two market days that share a source id within one collection', async () => {
		// arrange — a duplicate key silently remaps items to whichever day was written last.
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-duplicate-'));
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const user = fixtureUser({ sourceId: 'u1', username: 'avery', items: 1 });
		user.collections[0].marketDays.push({ ...user.collections[0].marketDays[0] });
		const archive = fixtureArchive([user]);

		// act
		const outcome = await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume
		expect(outcome.imported).toBe(false);
		expect(outcome.report.errors.join(' ')).toMatch(/market day/i);
		expect(countRows(databasePath, 'market_days')).toBe(0);
		rmSync(workspace, { force: true, recursive: true });
	});

	it('refuses two collections that share a source id within one user', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-duplicate-'));
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const user = fixtureUser({ sourceId: 'u1', username: 'avery', items: 1 });
		user.collections.push({ ...user.collections[0] });
		const archive = fixtureArchive([user]);

		// act
		const outcome = await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume
		expect(outcome.imported).toBe(false);
		expect(outcome.report.errors.join(' ')).toMatch(/collection/i);
		expect(countRows(databasePath, 'collections')).toBe(0);
		rmSync(workspace, { force: true, recursive: true });
	});

	it('refuses two items that share a source id within one collection', async () => {
		// arrange — item source ids key nothing yet, but duplicates make a report ambiguous.
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-duplicate-'));
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const user = fixtureUser({ sourceId: 'u1', username: 'avery', items: 1 });
		user.collections[0].items.push({ ...user.collections[0].items[0] });
		const archive = fixtureArchive([user]);

		// act
		const outcome = await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume
		expect(outcome.imported).toBe(false);
		expect(outcome.report.errors.join(' ')).toMatch(/item/i);
		rmSync(workspace, { force: true, recursive: true });
	});
});
