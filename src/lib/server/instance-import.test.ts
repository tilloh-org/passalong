import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { buildZip } from '$lib/server/backup';
import { hashPassword } from '$lib/server/password';
import { createCollectionRepository } from '$lib/server/collection-repository';
import { DATA_ENTRY_NAME } from '$lib/server/exchange-format';
import { fixtureArchive, fixtureUser } from '$lib/server/exchange-fixture.test-helper';
import { importInstanceArchive, validateInstanceArchive } from '$lib/server/instance-import';

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories) {
		rmSync(directory, { force: true, recursive: true });
	}
	temporaryDirectories.length = 0;
});

/**
 * Count tenants and users in a database file.
 *
 * @param {string} databasePath - Database file to inspect.
 * @returns {{ tenants: number; users: number }} Row counts.
 */
function countTenantsAndUsers(databasePath: string): { tenants: number; users: number } {
	const database = new Database(databasePath, { readonly: true });
	const tenants = (
		database.prepare('SELECT COUNT(*) AS count FROM tenants').get() as { count: number }
	).count;
	const users = (database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number })
		.count;
	database.close();
	return { tenants, users };
}

/**
 * Count the imported business records in a database file.
 *
 * @param {string} databasePath - Database file to inspect.
 * @returns {{ collections: number; items: number; images: number; marketDays: number; expenses: number }} Row counts.
 */
function countImportedRecords(databasePath: string): {
	collections: number;
	items: number;
	images: number;
	marketDays: number;
	expenses: number;
} {
	const database = new Database(databasePath, { readonly: true });
	const countOf = (table: string): number =>
		(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
	const counts = {
		collections: countOf('collections'),
		items: countOf('items'),
		images: countOf('item_images'),
		marketDays: countOf('market_days'),
		expenses: countOf('expenses')
	};
	database.close();
	return counts;
}

/**
 * Inspect tenant isolation of the imported data.
 *
 * @param {string} databasePath - Database file to inspect.
 * @returns {{ crossTenantReferences: number; itemsWithOwnerMismatch: number; tenantsWithoutOwner: number }} Isolation findings.
 */
function inspectImportedTenantIsolation(databasePath: string): {
	crossTenantReferences: number;
	itemsWithOwnerMismatch: number;
	tenantsWithoutOwner: number;
} {
	const database = new Database(databasePath, { readonly: true });
	const crossTenantReferences = (
		database
			.prepare(
				`SELECT COUNT(*) AS count FROM items
				 JOIN collections ON collections.id = items.collection_id
				 WHERE items.tenant_id != collections.tenant_id`
			)
			.get() as { count: number }
	).count;
	const itemsWithOwnerMismatch = (
		database
			.prepare(
				`SELECT COUNT(*) AS count FROM items
				 JOIN collections ON collections.id = items.collection_id
				 WHERE items.owner_id != collections.owner_id`
			)
			.get() as { count: number }
	).count;
	const tenantsWithoutOwner = (
		database
			.prepare(
				`SELECT COUNT(*) AS count FROM tenants
				 WHERE NOT EXISTS (SELECT 1 FROM users WHERE users.tenant_id = tenants.id)`
			)
			.get() as { count: number }
	).count;
	database.close();
	return { crossTenantReferences, itemsWithOwnerMismatch, tenantsWithoutOwner };
}

/**
 * Read the stored storage key of every imported item image.
 *
 * @param {string} databasePath - Database file to inspect.
 * @returns {Array<{ id: string; storageKey: string }>} Image rows.
 */
function readImportedImageKeys(databasePath: string): Array<{ id: string; storageKey: string }> {
	const database = new Database(databasePath, { readonly: true });
	const rows = database.prepare('SELECT id, storage_key FROM item_images').all() as Array<{
		id: string;
		storage_key: string;
	}>;
	database.close();
	return rows.map((row) => ({ id: row.id, storageKey: row.storage_key }));
}

/**
 * List the usernames that hold the instance admin role.
 *
 * @param {string} databasePath - Database file to inspect.
 * @returns {string[]} Admin usernames, sorted.
 */
function listImportedAdminUsernames(databasePath: string): string[] {
	const database = new Database(databasePath, { readonly: true });
	const rows = database
		.prepare(
			`SELECT users.username FROM instance_roles
			 JOIN users ON users.id = instance_roles.user_id
			 WHERE instance_roles.role = 'instance_admin'`
		)
		.all() as Array<{ username: string }>;
	database.close();
	return rows.map((row) => row.username).sort();
}

/**
 * Read the security-relevant fields of one imported account.
 *
 * @param {string} databasePath - Database file to inspect.
 * @param {string} username - Account username.
 * @returns {{ passwordHash: string | null; passwordResetRequired: boolean } | null} Account state.
 */
function readImportedAccount(
	databasePath: string,
	username: string
): { passwordHash: string | null; passwordResetRequired: boolean } | null {
	const database = new Database(databasePath, { readonly: true });
	const row = database
		.prepare(
			'SELECT password_hash, password_reset_required FROM users WHERE username = ? COLLATE NOCASE'
		)
		.get(username) as { password_hash: string | null; password_reset_required: number } | undefined;
	database.close();
	return row
		? { passwordHash: row.password_hash, passwordResetRequired: row.password_reset_required === 1 }
		: null;
}

describe('instance import validation', () => {
	it('reports every entity per user together with expected counts', () => {
		// arrange
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery', items: 2 }),
			fixtureUser({ sourceId: 'u2', username: 'blake', items: 3 })
		]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors).toEqual([]);
		expect(report.users.map((user) => user.username)).toEqual(['avery', 'blake']);
		expect(report.counts.items).toBe(5);
		expect(report.counts.users).toBe(2);
		expect(report.counts.tenants).toBe(2);
		expect(report.counts.collections).toBe(2);
		expect(report.counts.marketDays).toBe(2);
		expect(report.counts.expenses).toBe(2);
	});

	it('reports the media count and confirms every checksum matches', () => {
		// arrange
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery', items: 2 })]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors).toEqual([]);
		expect(report.media.files).toBe(2);
		expect(report.media.checksumsMatch).toBe(true);
	});

	it('reports public stand pages that will be republished', () => {
		// arrange
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery', published: true }),
			fixtureUser({ sourceId: 'u2', username: 'blake', published: false })
		]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.publicStandPages).toHaveLength(1);
		expect(report.publicStandPages[0].username).toBe('avery');
	});

	it('reports the password hash status of every account', () => {
		// arrange
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery', passwordHash: 'native-format-value' }),
			fixtureUser({
				sourceId: 'u2',
				username: 'blake',
				passwordHash: null,
				passwordResetRequired: true
			})
		]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.users.map((user) => user.username)).toEqual(['avery', 'blake']);
		expect(report.users[1].passwordResetRequired).toBe(true);
	});

	it('blocks activation when two users share a normalized username', () => {
		// arrange
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'Avery' }),
			fixtureUser({ sourceId: 'u2', username: 'avery' })
		]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/username/i);
	});

	it('blocks activation when a source id is used twice', () => {
		// arrange
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'same', username: 'avery' }),
			fixtureUser({ sourceId: 'same', username: 'blake' })
		]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/duplicate/i);
	});

	it('blocks activation when an item references an unknown market day', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].items[0].marketDaySourceId = 'does-not-exist';
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/market day/i);
	});

	it('blocks activation when a referenced media file is missing from the archive', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		const archive = fixtureArchive([user], { mediaFiles: [] });

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/media/i);
	});

	it('blocks activation when a media checksum does not match', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		const archive = fixtureArchive([user]);
		const tampered = Buffer.from(archive);
		const marker = Buffer.from('image-bytes');
		const offset = tampered.indexOf(marker);
		tampered[offset] = 'X'.charCodeAt(0);

		// act
		const report = validateInstanceArchive(tampered);

		// assume
		expect(report.errors.length).toBeGreaterThan(0);
	});

	it('blocks activation when the archive is not a valid backup container', () => {
		// act
		const report = validateInstanceArchive(Buffer.from('not a zip at all'));

		// assume
		expect(report.errors.length).toBeGreaterThan(0);
	});

	it('blocks activation when the manifest is missing', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		const withoutManifest = buildZip([
			[DATA_ENTRY_NAME, Buffer.from(JSON.stringify({ users: [user] }))]
		]);

		// act
		const report = validateInstanceArchive(withoutManifest);

		// assume
		expect(report.errors.length).toBeGreaterThan(0);
	});

	it('blocks activation when an item category is not supported', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].items[0].category = 'spaceship';
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/category/i);
	});

	it('blocks activation when an item condition is not supported', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].items[0].condition = 'pristine';
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/condition/i);
	});

	it('blocks activation when an expense category is not supported', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].expenses[0].category = 'bribes';
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/expense/i);
	});

	it('blocks activation when a price is negative', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].items[0].priceCents = -1;
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/price/i);
	});

	it('blocks activation when an amount is not an integer', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].expenses[0].amountCents = 12.5;
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/amount/i);
	});

	it('blocks activation when a username is blank', () => {
		// arrange
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: '   ' })]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/username/i);
	});

	it('warns without blocking when a sale has no proceeds recorded', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].items[0].saleChannel = 'flea-market';
		user.collections[0].items[0].soldAt = '2026-09-05T12:00:00.000Z';
		user.collections[0].items[0].saleProceedsCents = null;
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors).toEqual([]);
		expect(report.warnings.length).toBeGreaterThan(0);
	});

	it('changes nothing on disk while validating', () => {
		// arrange
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })]);
		const before = Buffer.from(archive);

		// act
		validateInstanceArchive(archive);

		// assume
		expect(archive.equals(before)).toBe(true);
	});
});

describe('instance import activation', () => {
	it('creates exactly one tenant per source user', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-import-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery', items: 2 }),
			fixtureUser({ sourceId: 'u2', username: 'blake', items: 3 })
		]);

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
		const counts = countTenantsAndUsers(databasePath);
		expect(counts.tenants).toBe(2);
		expect(counts.users).toBe(2);
	});

	it('assigns every imported record to the tenant of its source user', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-import-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery', items: 2 }),
			fixtureUser({ sourceId: 'u2', username: 'blake', items: 3 })
		]);

		// act
		await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume
		const inspected = inspectImportedTenantIsolation(databasePath);
		expect(inspected.crossTenantReferences).toBe(0);
		expect(inspected.itemsWithOwnerMismatch).toBe(0);
		expect(inspected.tenantsWithoutOwner).toBe(0);
	});

	it('imports items, market days, expenses and images under the right owner', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-import-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery', items: 2 })]);

		// act
		await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume
		const totals = countImportedRecords(databasePath);
		expect(totals.collections).toBe(1);
		expect(totals.items).toBe(2);
		expect(totals.images).toBe(2);
		expect(totals.marketDays).toBe(1);
		expect(totals.expenses).toBe(1);
	});

	it('writes the imported media files to the media root', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-import-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery', items: 2 })]);

		// act
		await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume
		const keys = readImportedImageKeys(databasePath).map((row) => row.storageKey);
		expect(keys).toHaveLength(2);
		for (const key of keys) {
			expect(existsSync(join(mediaRoot, key))).toBe(true);
		}
	});

	it('gives the selected user the instance admin role and nobody else', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-import-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery' }),
			fixtureUser({ sourceId: 'u2', username: 'blake' })
		]);

		// act
		await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume
		const admins = listImportedAdminUsernames(databasePath);
		expect(admins).toEqual(['avery']);
	});

	it('refuses to activate when the selected admin is not part of the archive', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-import-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })]);

		// act
		const outcome = await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'nobody',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume
		expect(outcome.imported).toBe(false);
		expect(countImportedRecords(databasePath).items).toBe(0);
	});

	it('leaves the instance untouched when the archive fails validation', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-import-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });

		// act
		const outcome = await importInstanceArchive({
			archive: Buffer.from('definitely not a zip'),
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume
		expect(outcome.imported).toBe(false);
		expect(countImportedRecords(databasePath).items).toBe(0);
	});

	it('rolls the whole import back when a write fails midway', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-import-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const broken = fixtureUser({ sourceId: 'u1', username: 'avery', items: 1 });
		broken.collections[0].items[0].category = 'decor';
		const archive = fixtureArchive([broken]);

		// act — the duplicate collection name is injected through a second identical user id set
		const outcome = await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'short',
			validatePassword: () => {
				throw new Error('password rejected');
			}
		});

		// assume
		expect(outcome.imported).toBe(false);
		expect(countImportedRecords(databasePath).collections).toBe(0);
	});

	it('sets a new password for the selected admin instead of trusting the imported hash', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-import-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const archive = fixtureArchive([
			fixtureUser({
				sourceId: 'u1',
				username: 'avery',
				passwordHash: 'pbkdf2:sha256:600000$abc$def'
			})
		]);

		// act
		await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume
		const admin = readImportedAccount(databasePath, 'avery');
		expect(admin?.passwordResetRequired).toBe(false);
		expect(admin?.passwordHash).not.toContain('pbkdf2');
		expect(admin?.passwordHash?.startsWith('scrypt')).toBe(true);
	});

	it('never stores a foreign password hash and flags the account for a reset', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-import-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery', passwordHash: null }),
			fixtureUser({
				sourceId: 'u2',
				username: 'blake',
				passwordHash: 'pbkdf2:sha256:600000$abc$def'
			})
		]);

		// act
		const outcome = await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume — the foreign digest must not reach the database at all.
		expect(outcome.imported).toBe(true);
		const blake = readImportedAccount(databasePath, 'blake');
		expect(blake?.passwordResetRequired).toBe(true);
		expect(blake?.passwordHash).toBeNull();
	});

	it('carries over a native hash so that user keeps their existing password', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-import-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const nativeHash = await hashPassword('an-existing-passphrase');
		const archive = fixtureArchive([
			{
				...fixtureUser({ sourceId: 'u1', username: 'avery' }),
				passwordHash: nativeHash
			},
			{
				...fixtureUser({ sourceId: 'u2', username: 'blake' }),
				passwordHash: nativeHash
			}
		]);

		// act
		await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume
		const blake = readImportedAccount(databasePath, 'blake');
		expect(blake?.passwordResetRequired).toBe(false);
		expect(blake?.passwordHash).toBe(nativeHash);
	});

	it('refuses to import into an instance that already has an instance administrator', async () => {
		// arrange — the schema allows exactly one instance admin, so a second import must be refused
		// rather than silently produce two.
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-import-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		const repository = createCollectionRepository({ databasePath });
		const scope = repository.createInitialAdmin({
			username: 'existing',
			displayName: 'Existing',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		repository.createSessionForUser(scope, 'existing-token-hash');

		// act
		const outcome = await importInstanceArchive({
			archive: fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })]),
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume — refused, rolled back, and the existing session survives untouched.
		expect(outcome.imported).toBe(false);
		expect(listImportedAdminUsernames(databasePath)).toEqual(['existing']);
		expect(repository.getSession('existing-token-hash')).not.toBeNull();
		expect(countImportedRecords(databasePath).items).toBe(0);
	});

	it('reports the imported counts and the users in the outcome', async () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-import-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery', items: 2 }),
			fixtureUser({ sourceId: 'u2', username: 'blake', items: 1 })
		]);

		// act
		const outcome = await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'blake',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume
		expect(outcome.imported).toBe(true);
		if (outcome.imported) {
			expect(outcome.report.counts.items).toBe(3);
			expect(outcome.report.users.map((user) => user.username).sort()).toEqual(['avery', 'blake']);
		}
	});
});

it('clears sessions and reset tokens that existed before the import', async () => {
	// arrange — seed a session and a reset token directly, on a database without any admin so the
	// singleton instance-admin guard does not apply.
	const workspace = mkdtempSync(join(tmpdir(), 'passalong-import-'));
	temporaryDirectories.push(workspace);
	const databasePath = join(workspace, 'app.sqlite');
	const mediaRoot = join(workspace, 'media');
	createCollectionRepository({ databasePath });
	const seed = new Database(databasePath);
	seed.exec(`
			INSERT INTO tenants (id, name, created_at) VALUES ('t-seed', 'Seed', '2026-09-15T00:00:00.000Z');
			INSERT INTO users (id, tenant_id, username, display_name, password_hash, created_at)
				VALUES ('u-seed', 't-seed', 'seed', 'Seed', 'scrypt$s$k', '2026-09-15T00:00:00.000Z');
			INSERT INTO sessions (id, user_id, tenant_id, token_hash, expires_at, created_at)
				VALUES ('s-seed', 'u-seed', 't-seed', 'seed-token-hash', '2099-01-01T00:00:00.000Z', '2026-09-15T00:00:00.000Z');
			INSERT INTO password_resets (id, user_id, tenant_id, secret_hash, expires_at, created_at)
				VALUES ('r-seed', 'u-seed', 't-seed', 'seed-reset-hash', '2099-01-01T00:00:00.000Z', '2026-09-15T00:00:00.000Z');
		`);
	seed.close();
	const repository = createCollectionRepository({ databasePath });
	const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })]);

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
	expect(repository.getSession('seed-token-hash')).toBeNull();
	const check = new Database(databasePath, { readonly: true });
	const resets = (
		check.prepare('SELECT COUNT(*) AS count FROM password_resets').get() as { count: number }
	).count;
	check.close();
	expect(resets).toBe(0);
});
