import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createCollectionRepository } from './collection-repository';

const temporaryDirectories: string[] = [];

/**
 * Create an isolated SQLite database path for a repository test.
 *
 * @returns {string} The temporary database file path.
 */
function createDatabasePath(): string {
	const directory = mkdtempSync(join(tmpdir(), 'passalong-collection-'));
	temporaryDirectories.push(directory);
	return join(directory, 'passalong.sqlite');
}

/**
 * Create a pre-authentication core collection database fixture.
 *
 * @param {string} databasePath - SQLite database file path.
 * @returns {void}
 */
function createOriginalCoreCollectionDatabase(databasePath: string): void {
	const database = new Database(databasePath);
	const createdAt = '2026-01-01T00:00:00.000Z';
	database.exec(`
		CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
		CREATE TABLE users (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			display_name TEXT NOT NULL,
			created_at TEXT NOT NULL,
			UNIQUE (id, tenant_id)
		);
		CREATE TABLE collections (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			owner_id TEXT NOT NULL,
			name TEXT NOT NULL,
			created_at TEXT NOT NULL
		);
		CREATE TABLE items (
			id TEXT PRIMARY KEY,
			collection_id TEXT NOT NULL,
			title TEXT NOT NULL,
			price_cents INTEGER NOT NULL,
			category TEXT NOT NULL,
			condition TEXT NOT NULL,
			internal_notes TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL
		);
	`);
	database.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)').run('legacy-tenant', 'Legacy household', createdAt);
	database
		.prepare('INSERT INTO users (id, tenant_id, display_name, created_at) VALUES (?, ?, ?, ?)')
		.run('legacy-user', 'legacy-tenant', 'Legacy owner', createdAt);
	database
		.prepare('INSERT INTO collections (id, tenant_id, owner_id, name, created_at) VALUES (?, ?, ?, ?, ?)')
		.run('legacy-collection', 'legacy-tenant', 'legacy-user', 'Legacy collection', createdAt);
	database
		.prepare(
			'INSERT INTO items (id, collection_id, title, price_cents, category, condition, internal_notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
		)
		.run('legacy-item', 'legacy-collection', 'Legacy item', 100, 'home', 'good', '', createdAt);
	database.close();
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe('collection repository', () => {
	it('creates the initial instance administrator only when no accounts exist', () => {
		// arrange
		const databasePath = createDatabasePath();
		const repository = createCollectionRepository({ databasePath });

		// act
		const initiallyHasAdminAccount = repository.hasAdminAccount();
		const initiallyHasAccounts = repository.hasAccounts();

		// assume
		expect(initiallyHasAdminAccount).toBe(false);
		expect(initiallyHasAccounts).toBe(false);

		// act
		const admin = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const hasAdminAccount = repository.hasAdminAccount();
		const loginUser = repository.getUserForLogin('avery');

		// assume
		expect(hasAdminAccount).toBe(true);
		expect(loginUser).toEqual({
			...admin,
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});

		let duplicateAdminError: unknown;

		// act
		try {
			repository.createInitialAdmin({
				username: 'blake',
				displayName: 'Blake',
				passwordHash: 'scrypt$another-salt$another-key'
			});
		} catch (error) {
			duplicateAdminError = error;
		}
		const database = new Database(databasePath, { readonly: true });
		const instanceRoles = database.prepare('SELECT user_id, role FROM instance_roles').all();
		database.close();

		// assume
		expect(duplicateAdminError).toMatchObject({ message: 'an initial admin account already exists' });
		expect(instanceRoles).toEqual([{ user_id: admin.userId, role: 'instance_admin' }]);
	});

	it('enforces a database-level singleton for the instance administrator role', () => {
		// arrange
		const databasePath = createDatabasePath();
		const repository = createCollectionRepository({ databasePath });
		const administrator = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const database = new Database(databasePath);
		database.pragma('foreign_keys = ON');
		database
			.prepare(
				'INSERT INTO users (id, tenant_id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.run('second-user', administrator.tenantId, 'blake', 'Blake', 'scrypt$test-salt$test-key', '2026-01-01T00:00:00.000Z');

		let singletonRoleError: unknown;

		// act
		try {
			database
				.prepare('INSERT INTO instance_roles (user_id, role, created_at) VALUES (?, ?, ?)')
				.run('second-user', 'instance_admin', '2026-01-01T00:00:00.000Z');
		} catch (error) {
			singletonRoleError = error;
		}

		// assume
		expect(singletonRoleError).toMatchObject({ message: expect.stringMatching(/UNIQUE constraint failed/) });
		database.close();
	});

	it('recognizes only the singleton instance administrator as privileged', () => {
		// arrange
		const databasePath = createDatabasePath();
		const repository = createCollectionRepository({ databasePath });
		const instanceAdministrator = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const database = new Database(databasePath);
		database
			.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)')
			.run('member-tenant', 'Member household', '2026-01-01T00:00:00.000Z');
		database
			.prepare('INSERT INTO users (id, tenant_id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.run('member-user', 'member-tenant', 'blake', 'Blake', 'scrypt$test-salt$test-key', '2026-01-01T00:00:00.000Z');
		database.close();

		// act
		const administratorIsPrivileged = repository.isInstanceAdmin(instanceAdministrator);
		const memberIsPrivileged = repository.isInstanceAdmin({ userId: 'member-user', tenantId: 'member-tenant' });

		// assume
		expect(administratorIsPrivileged).toBe(true);
		expect(memberIsPrivileged).toBe(false);
	});

	it('creates a multi-account bootstrap manifest once with exactly one instance administrator', () => {
		// arrange
		const databasePath = createDatabasePath();
		const repository = createCollectionRepository({ databasePath });
		const accounts = [
			{
				tenantName: 'Avery household',
				username: 'avery',
				displayName: 'Avery',
				password: 'not-a-real-password-avery',
				passwordHash: 'scrypt$avery$hash',
				instanceAdmin: true
			},
			{
				tenantName: 'Blake household',
				username: 'blake',
				displayName: 'Blake',
				password: 'not-a-real-password-blake',
				passwordHash: 'scrypt$blake$hash',
				instanceAdmin: false
			}
		];

		// act
		repository.provisionBootstrapAccounts(accounts);

		// assume
		expect(repository.getBootstrapAccount('avery')).toEqual({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$avery$hash',
			tenantName: 'Avery household',
			instanceAdmin: true
		});

		const database = new Database(databasePath, { readonly: true });
		expect(database.prepare('SELECT COUNT(*) AS count FROM tenants').get()).toEqual({ count: 2 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 2 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM instance_roles').get()).toEqual({ count: 1 });
		expect(database.prepare('SELECT username FROM users ORDER BY username').all()).toEqual([
			{ username: 'avery' },
			{ username: 'blake' }
		]);
		database.close();
	});

	it('lets an authenticated admin create a collection and persist an item', () => {
		// arrange
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const admin = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});

		// act
		const collection = repository.createCollection({ name: 'Living room clear-out' }, admin);

		const item = repository.createItem(
			{
				collectionId: collection.id,
				title: 'Reading lamp',
				priceCents: 1200,
				category: 'home',
				condition: 'good',
				internalNotes: 'Replace the bulb before listing.'
			},
			admin
		);

		// assume
		expect(repository.listItemsForOwner(collection.id, admin)).toEqual([
			expect.objectContaining({
				id: item.id,
				title: 'Reading lamp',
				priceCents: 1200,
				category: 'home',
				condition: 'good',
				internalNotes: 'Replace the bulb before listing.'
			})
		]);
	});

	it('scopes collection and item access to the authenticated owner and tenant', () => {
		// arrange
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const admin = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const collection = repository.createCollection({ name: 'Books' }, admin);
		const anotherScope = { userId: 'another-user', tenantId: admin.tenantId };
		let foreignItemCreationError: unknown;

		// act
		const foreignCollection = repository.getCollectionForOwner(collection.id, anotherScope);
		const foreignCollections = repository.listCollectionsForOwner(anotherScope);
		const foreignItems = repository.listItemsForOwner(collection.id, anotherScope);
		try {
			repository.createItem(
				{
					collectionId: collection.id,
					title: 'Novel',
					priceCents: 400,
					category: 'books',
					condition: 'good',
					internalNotes: ''
				},
				anotherScope
			);
		} catch (error) {
			foreignItemCreationError = error;
		}

		// assume
		expect(foreignCollection).toBeNull();
		expect(foreignCollections).toEqual([]);
		expect(foreignItems).toEqual([]);
		expect(foreignItemCreationError).toMatchObject({ message: 'collection was not found' });
	});

	it('migrates the original core collection fixture atomically and idempotently', () => {
		// arrange
		const databasePath = createDatabasePath();
		createOriginalCoreCollectionDatabase(databasePath);

		// act
		const repository = createCollectionRepository({ databasePath });
		const legacyScope = { userId: 'legacy-user', tenantId: 'legacy-tenant' };
		const legacyCollection = repository.getCollectionForOwner('legacy-collection', legacyScope);
		const migratedDatabase = new Database(databasePath, { readonly: true });
		const migratedItem = migratedDatabase
			.prepare('SELECT tenant_id, owner_id, collection_id FROM items WHERE id = ?')
			.get('legacy-item');
		const migratedSessionCount = migratedDatabase.prepare('SELECT COUNT(*) AS count FROM sessions').get();
		const migratedImageCount = migratedDatabase.prepare('SELECT COUNT(*) AS count FROM item_images').get();
		const migratedForeignKeyErrors = migratedDatabase.prepare('PRAGMA foreign_key_check').all();
		migratedDatabase.close();

		// assume
		expect(legacyCollection).toMatchObject({ id: 'legacy-collection', name: 'Legacy collection' });
		expect(migratedItem).toEqual({ tenant_id: 'legacy-tenant', owner_id: 'legacy-user', collection_id: 'legacy-collection' });
		expect(migratedSessionCount).toEqual({ count: 0 });
		expect(migratedImageCount).toEqual({ count: 0 });
		expect(migratedForeignKeyErrors).toEqual([]);

		// act
		createCollectionRepository({ databasePath });
		const reopenedDatabase = new Database(databasePath, { readonly: true });
		const reopenedUserCount = reopenedDatabase.prepare('SELECT COUNT(*) AS count FROM users').get();
		const reopenedItemCount = reopenedDatabase.prepare('SELECT COUNT(*) AS count FROM items').get();
		const reopenedSessionCount = reopenedDatabase.prepare('SELECT COUNT(*) AS count FROM sessions').get();
		const reopenedImageCount = reopenedDatabase.prepare('SELECT COUNT(*) AS count FROM item_images').get();
		const reopenedForeignKeyErrors = reopenedDatabase.prepare('PRAGMA foreign_key_check').all();
		reopenedDatabase.close();

		// assume
		expect(reopenedUserCount).toEqual({ count: 1 });
		expect(reopenedItemCount).toEqual({ count: 1 });
		expect(reopenedSessionCount).toEqual({ count: 0 });
		expect(reopenedImageCount).toEqual({ count: 0 });
		expect(reopenedForeignKeyErrors).toEqual([]);
	});

	it('rolls back every migration write when legacy usernames collide case-insensitively', () => {
		// arrange
		const databasePath = createDatabasePath();
		const legacyDatabase = new Database(databasePath);
		legacyDatabase.exec(`
			CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
			CREATE TABLE users (
				id TEXT PRIMARY KEY,
				tenant_id TEXT NOT NULL,
				username TEXT UNIQUE,
				display_name TEXT NOT NULL,
				created_at TEXT NOT NULL,
				UNIQUE (id, tenant_id)
			);
			CREATE TABLE collections (
				id TEXT PRIMARY KEY,
				tenant_id TEXT NOT NULL,
				owner_id TEXT NOT NULL,
				name TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
			CREATE TABLE items (
				id TEXT PRIMARY KEY,
				collection_id TEXT NOT NULL,
				title TEXT NOT NULL,
				price_cents INTEGER NOT NULL,
				category TEXT NOT NULL,
				condition TEXT NOT NULL,
				internal_notes TEXT NOT NULL DEFAULT '',
				created_at TEXT NOT NULL
			);
		`);
		const createdAt = '2026-01-01T00:00:00.000Z';
		legacyDatabase.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)').run('tenant-a', 'Alpha', createdAt);
		legacyDatabase
			.prepare('INSERT INTO users (id, tenant_id, username, display_name, created_at) VALUES (?, ?, ?, ?, ?)')
			.run('user-a', 'tenant-a', 'Alice', 'Alice', createdAt);
		legacyDatabase
			.prepare('INSERT INTO users (id, tenant_id, username, display_name, created_at) VALUES (?, ?, ?, ?, ?)')
			.run('user-b', 'tenant-a', 'alice', 'Alice duplicate', createdAt);
		legacyDatabase.close();

		let migrationError: unknown;

		// act
		try {
			createCollectionRepository({ databasePath });
		} catch (error) {
			migrationError = error;
		}

		// assume
		expect(migrationError).toMatchObject({ message: expect.stringMatching(/UNIQUE constraint failed/) });

		const unchangedDatabase = new Database(databasePath, { readonly: true });
		expect(
			unchangedDatabase
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
				.all()
		).toEqual([{ name: 'collections' }, { name: 'items' }, { name: 'tenants' }, { name: 'users' }]);
		expect(unchangedDatabase.prepare('SELECT id, username FROM users ORDER BY id').all()).toEqual([
			{ id: 'user-a', username: 'Alice' },
			{ id: 'user-b', username: 'alice' }
		]);
		unchangedDatabase.close();
	});

	it('rejects mixed-tenant foreign-key relationships and creates tenant indexes', () => {
		// arrange
		const databasePath = createDatabasePath();
		const repository = createCollectionRepository({ databasePath });
		const alpha = repository.createInitialAdmin({
			username: 'alpha',
			displayName: 'Alpha',
			passwordHash: 'scrypt$alpha$hash'
		});
		const collection = repository.createCollection({ name: 'Alpha collection' }, alpha);
		const item = repository.createItem(
			{
				collectionId: collection.id,
				title: 'Alpha item',
				priceCents: 100,
				category: 'home',
				condition: 'good',
				internalNotes: ''
			},
			alpha
		);
		const database = new Database(databasePath);
		database.pragma('foreign_keys = ON');
		database.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)').run('tenant-b', 'Beta', '2026-01-01T00:00:00.000Z');
		database
			.prepare('INSERT INTO users (id, tenant_id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.run('user-b', 'tenant-b', 'beta', 'Beta', 'scrypt$beta$hash', '2026-01-01T00:00:00.000Z');

		const captureConstraintError = (operation: () => void): unknown => {
			try {
				operation();
				return undefined;
			} catch (error) {
				return error;
			}
		};

		// act
		const constraintErrors = [
			captureConstraintError(() =>
				database
					.prepare('INSERT INTO sessions (id, user_id, tenant_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
					.run('session-b', alpha.userId, 'tenant-b', 'token-b', '2099-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
			),
			captureConstraintError(() =>
				database
					.prepare('INSERT INTO collections (id, tenant_id, owner_id, name, created_at) VALUES (?, ?, ?, ?, ?)')
					.run('collection-b', 'tenant-b', alpha.userId, 'Mixed collection', '2026-01-01T00:00:00.000Z')
			),
			captureConstraintError(() =>
				database
					.prepare('INSERT INTO items (id, tenant_id, owner_id, collection_id, title, price_cents, category, condition, internal_notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
					.run('item-b', 'tenant-b', alpha.userId, collection.id, 'Mixed item', 100, 'home', 'good', '', '2026-01-01T00:00:00.000Z')
			),
			captureConstraintError(() =>
				database
					.prepare('INSERT INTO item_images (id, tenant_id, item_id, storage_key, position, is_cover, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
					.run('image-b', 'tenant-b', item.id, 'items/mixed.jpg', 0, 1, '2026-01-01T00:00:00.000Z')
			)
		];
		const indexNames = new Set(
			['users', 'sessions', 'collections', 'items', 'item_images'].flatMap((tableName) =>
				(database.prepare(`PRAGMA index_list(${tableName})`).all() as { name: string }[]).map(({ name }) => name)
			)
		);

		// assume
		for (const constraintError of constraintErrors) {
			expect(constraintError).toMatchObject({ message: expect.stringMatching(/FOREIGN KEY constraint failed/) });
		}
		expect([...indexNames]).toEqual(
			expect.arrayContaining([
				'users_tenant_id_idx',
				'sessions_tenant_user_idx',
				'collections_tenant_owner_created_idx',
				'items_tenant_collection_created_idx',
				'items_tenant_owner_created_idx',
				'item_images_tenant_item_position_idx'
			])
		);
		database.close();
	});

	it('migrates a legacy owner schema without deleting existing records', () => {
		// arrange
		const databasePath = createDatabasePath();
		const legacyDatabase = new Database(databasePath);
		legacyDatabase.exec(`
			CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
			CREATE TABLE users (
				id TEXT PRIMARY KEY,
				tenant_id TEXT NOT NULL,
				display_name TEXT NOT NULL,
				created_at TEXT NOT NULL,
				UNIQUE (id, tenant_id)
			);
			CREATE TABLE collections (
				id TEXT PRIMARY KEY,
				tenant_id TEXT NOT NULL,
				owner_id TEXT NOT NULL,
				name TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
		`);
		legacyDatabase
			.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)')
			.run('legacy-tenant', 'Legacy household', '2026-01-01T00:00:00.000Z');
		legacyDatabase
			.prepare('INSERT INTO users (id, tenant_id, display_name, created_at) VALUES (?, ?, ?, ?)')
			.run('legacy-user', 'legacy-tenant', 'Legacy owner', '2026-01-01T00:00:00.000Z');
		legacyDatabase
			.prepare('INSERT INTO collections (id, tenant_id, owner_id, name, created_at) VALUES (?, ?, ?, ?, ?)')
			.run('legacy-collection', 'legacy-tenant', 'legacy-user', 'Legacy collection', '2026-01-01T00:00:00.000Z');
		legacyDatabase.close();

		// act
		const repository = createCollectionRepository({ databasePath });
		const legacyScope = { userId: 'legacy-user', tenantId: 'legacy-tenant' };
		const migratedDatabase = new Database(databasePath, { readonly: true });

		// assume
		expect(repository.getCollectionForOwner('legacy-collection', legacyScope)).toMatchObject({
			id: 'legacy-collection',
			name: 'Legacy collection'
		});
		expect(
			migratedDatabase
				.prepare('SELECT display_name, username, password_hash FROM users WHERE id = ?')
				.get('legacy-user')
		).toEqual({ display_name: 'Legacy owner', username: null, password_hash: null });
		expect(
			(migratedDatabase.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(
				({ name }) => name
			)
		).not.toContain('is_admin');
		expect(migratedDatabase.prepare('SELECT * FROM instance_roles').all()).toEqual([]);
		migratedDatabase.close();
	});

	it('stores only hashes for browser sessions and resolves their owner scope', () => {
		// arrange
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const admin = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});

		// act
		repository.createSessionForUser(admin, 'test-token-hash');

		// assume
		expect(repository.getSession('test-token-hash')).toEqual({
			userId: admin.userId,
			tenantId: admin.tenantId
		});
		expect(repository.getSession('test-token')).toBeNull();
	});

	it('migrates existing tenant records idempotently without granting instance administrators cross-tenant access', () => {
		// arrange
		const databasePath = createDatabasePath();
		const legacyDatabase = new Database(databasePath);
		legacyDatabase.exec(`
			CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
			CREATE TABLE users (
				id TEXT PRIMARY KEY,
				tenant_id TEXT NOT NULL,
				username TEXT,
				display_name TEXT NOT NULL,
				password_hash TEXT,
				is_admin INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL,
				UNIQUE (id, tenant_id)
			);
			CREATE TABLE instance_roles (
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				role TEXT NOT NULL CHECK (role = 'instance_admin'),
				created_at TEXT NOT NULL,
				PRIMARY KEY (user_id, role)
			);
			CREATE TABLE sessions (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				tenant_id TEXT NOT NULL,
				token_hash TEXT NOT NULL UNIQUE,
				expires_at TEXT NOT NULL,
				created_at TEXT NOT NULL,
				revoked_at TEXT
			);
			CREATE TABLE collections (
				id TEXT PRIMARY KEY,
				tenant_id TEXT NOT NULL,
				owner_id TEXT NOT NULL,
				name TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
			CREATE TABLE items (
				id TEXT PRIMARY KEY,
				collection_id TEXT NOT NULL,
				title TEXT NOT NULL,
				price_cents INTEGER NOT NULL,
				category TEXT NOT NULL,
				condition TEXT NOT NULL,
				internal_notes TEXT NOT NULL DEFAULT '',
				created_at TEXT NOT NULL
			);
			CREATE TABLE item_images (
				id TEXT PRIMARY KEY,
				item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
				storage_key TEXT NOT NULL UNIQUE,
				position INTEGER NOT NULL CHECK (position >= 0),
				is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
				created_at TEXT NOT NULL,
				UNIQUE (item_id, position)
			);
		`);
		const createdAt = '2026-01-01T00:00:00.000Z';
		legacyDatabase.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)').run('tenant-a', 'Alpha', createdAt);
		legacyDatabase.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)').run('tenant-b', 'Beta', createdAt);
		legacyDatabase
			.prepare(
				'INSERT INTO users (id, tenant_id, username, display_name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			)
			.run('user-a', 'tenant-a', 'alpha-user', 'Alpha User', 'scrypt$alpha$hash', 1, createdAt);
		legacyDatabase
			.prepare(
				'INSERT INTO users (id, tenant_id, username, display_name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			)
			.run('user-b', 'tenant-b', 'beta-user', 'Beta User', 'scrypt$beta$hash', 0, createdAt);
		legacyDatabase
			.prepare('INSERT INTO collections (id, tenant_id, owner_id, name, created_at) VALUES (?, ?, ?, ?, ?)')
			.run('collection-a', 'tenant-a', 'user-a', 'Alpha collection', createdAt);
		legacyDatabase
			.prepare('INSERT INTO collections (id, tenant_id, owner_id, name, created_at) VALUES (?, ?, ?, ?, ?)')
			.run('collection-b', 'tenant-b', 'user-b', 'Beta collection', createdAt);
		legacyDatabase
			.prepare(
				'INSERT INTO items (id, collection_id, title, price_cents, category, condition, internal_notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.run('item-a', 'collection-a', 'Alpha item', 100, 'home', 'good', '', createdAt);
		legacyDatabase
			.prepare('INSERT INTO item_images (id, item_id, storage_key, position, is_cover, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.run('image-a', 'item-a', 'items/item-a/cover.jpg', 0, 1, createdAt);
		legacyDatabase
			.prepare('INSERT INTO instance_roles (user_id, role, created_at) VALUES (?, ?, ?)')
			.run('user-a', 'instance_admin', createdAt);
		legacyDatabase
			.prepare(
				'INSERT INTO sessions (id, user_id, tenant_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.run('session-b', 'user-b', 'tenant-b', 'beta-token', '2099-01-01T00:00:00.000Z', createdAt);
		legacyDatabase.close();

		// act
		const repository = createCollectionRepository({ databasePath });
		const instanceAdminScope = { userId: 'user-a', tenantId: 'tenant-a' };
		const normalAccountScope = { userId: 'user-b', tenantId: 'tenant-b' };

		// assume
		expect(repository.getUserForLogin('BETA-USER')).toEqual({
			...normalAccountScope,
			username: 'beta-user',
			displayName: 'Beta User',
			passwordHash: 'scrypt$beta$hash'
		});
		expect(repository.getSession('beta-token')).toEqual(normalAccountScope);
		expect(repository.getCollectionForOwner('collection-a', instanceAdminScope)).toMatchObject({
			id: 'collection-a',
			name: 'Alpha collection'
		});
		expect(repository.getCollectionForOwner('collection-b', instanceAdminScope)).toBeNull();
		expect(repository.listItemsForOwner('collection-b', instanceAdminScope)).toEqual([]);
		expect(repository.listCollectionsForOwner(normalAccountScope)).toMatchObject([
			{ id: 'collection-b', name: 'Beta collection' }
		]);

		// act
		const betaFollowUpCollection = repository.createCollection({ name: 'Beta follow-up' }, normalAccountScope);

		// assume
		expect(betaFollowUpCollection).toMatchObject({
			name: 'Beta follow-up',
			ownerName: 'Beta User'
		});

		// act
		const migratedDatabase = new Database(databasePath, { readonly: true });

		// assume
		expect(migratedDatabase.prepare('SELECT version FROM schema_migrations').all()).toEqual([
			{ version: '2026082601_tenant_schema_foundation' },
			{ version: '2026083101_item_scoped_image_keys' }
		]);
		expect(
			migratedDatabase
				.prepare('SELECT user_id, role, created_at FROM instance_roles WHERE user_id = ?')
				.all('user-a')
		).toEqual([{ user_id: 'user-a', role: 'instance_admin', created_at: createdAt }]);
		expect(
			(migratedDatabase.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(
				({ name }) => name
			)
		).not.toContain('is_admin');
		expect(
			migratedDatabase
				.prepare('SELECT tenant_id, owner_id, collection_id FROM items WHERE id = ?')
				.get('item-a')
		).toEqual({ tenant_id: 'tenant-a', owner_id: 'user-a', collection_id: 'collection-a' });
		expect(
			migratedDatabase
				.prepare(
					'SELECT id, tenant_id, item_id, storage_key, position, is_cover, created_at FROM item_images WHERE id = ?'
				)
				.get('image-a')
		).toEqual({
			id: 'image-a',
			tenant_id: 'tenant-a',
			item_id: 'item-a',
			storage_key: 'items/item-a/cover.jpg',
			position: 0,
			is_cover: 1,
			created_at: createdAt
		});
		expect(migratedDatabase.prepare('PRAGMA foreign_key_list(item_images)').all()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ from: 'item_id', table: 'items', to: 'id' }),
				expect.objectContaining({ from: 'tenant_id', table: 'items', to: 'tenant_id' })
			])
		);
		expect(migratedDatabase.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
		migratedDatabase.close();

		// act
		createCollectionRepository({ databasePath });
		const reopenedDatabase = new Database(databasePath, { readonly: true });

		// assume
		expect(reopenedDatabase.prepare('SELECT version FROM schema_migrations').all()).toEqual([
			{ version: '2026082601_tenant_schema_foundation' },
			{ version: '2026083101_item_scoped_image_keys' }
		]);
		expect(reopenedDatabase.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 2 });
		expect(reopenedDatabase.prepare('SELECT COUNT(*) AS count FROM items').get()).toEqual({ count: 1 });
		expect(reopenedDatabase.prepare('SELECT COUNT(*) AS count FROM item_images').get()).toEqual({ count: 1 });
		expect(reopenedDatabase.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
		reopenedDatabase.close();
	});

	it('revokes sessions, rejects expired sessions, enforces durable login limits, and consumes reset secrets once', () => {
		// arrange
		const databasePath = createDatabasePath();
		const repository = createCollectionRepository({ databasePath });
		const admin = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const now = new Date('2030-01-01T00:00:00.000Z');

		// act
		repository.createSessionForUser(admin, 'session-token-hash');
		repository.revokeSession('session-token-hash');
		const revokedSession = repository.getSession('session-token-hash');

		// assume
		expect(revokedSession).toBeNull();

		// act
		const database = new Database(databasePath);
		database
			.prepare('INSERT INTO sessions (id, user_id, tenant_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.run('expired-session', admin.userId, admin.tenantId, 'expired-token-hash', '2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z');
		database.close();
		const expiredSession = repository.getSession('expired-token-hash');

		// assume
		expect(expiredSession).toBeNull();

		// act
		for (let attempt = 0; attempt < 5; attempt += 1) {
			repository.recordLoginFailure(' AVERY ', '127.0.0.1', now);
		}
		const usernameLimitedStatus = repository.getLoginAttemptStatus('avery', '127.0.0.1', now);
		const addressLimitedStatus = repository.getLoginAttemptStatus('avery', '127.0.0.2', now);
		const combinedLimitedStatus = repository.getLoginAttemptStatus('blake', '127.0.0.1', now);

		// assume
		expect(usernameLimitedStatus).toEqual({ blocked: true, retryAfterSeconds: 900 });
		expect(addressLimitedStatus).toEqual({ blocked: true, retryAfterSeconds: 900 });
		expect(combinedLimitedStatus).toEqual({ blocked: true, retryAfterSeconds: 900 });

		// act
		repository.clearLoginFailures('avery', '127.0.0.1');
		const clearedAddressStatus = repository.getLoginAttemptStatus('avery', '127.0.0.9', now);
		const preservedCombinedStatus = repository.getLoginAttemptStatus('blake', '127.0.0.1', now);
		const preservedUsernameStatus = repository.getLoginAttemptStatus('avery', '127.0.0.1', now);

		// assume
		expect(clearedAddressStatus).toEqual({ blocked: false, retryAfterSeconds: 0 });
		expect(preservedCombinedStatus).toEqual({ blocked: true, retryAfterSeconds: 900 });
		expect(preservedUsernameStatus).toEqual({ blocked: true, retryAfterSeconds: 900 });

		// act
		for (let attempt = 0; attempt < 5; attempt += 1) {
			repository.recordLoginFailure('!', '127.0.0.3', now);
		}
		const unrelatedUserStatus = repository.getLoginAttemptStatus('unrelated-user', '127.0.0.3', now);

		// assume
		expect(unrelatedUserStatus).toEqual({ blocked: true, retryAfterSeconds: 900 });

		// act
		repository.createSessionForUser(admin, 'reset-issuance-session-hash');
		const createdReset = repository.createPasswordResetForUsername('avery', 'reset-secret-hash', '2030-01-02T00:00:00.000Z');
		const resetIssuanceSession = repository.getSession('reset-issuance-session-hash');
		const resetScope = repository.consumePasswordReset('avery', 'reset-secret-hash', 'scrypt$v1$16384$8$1$salt$key');
		const consumedResetScope = repository.consumePasswordReset('avery', 'reset-secret-hash', 'scrypt$v1$16384$8$1$salt$key');
		const originalSession = repository.getSession('session-token-hash');
		const resetUser = repository.getUserForLogin('avery');

		// assume
		expect(createdReset).toBe(true);
		expect(resetIssuanceSession).toBeNull();
		expect(resetScope).toEqual({ userId: admin.userId, tenantId: admin.tenantId });
		expect(consumedResetScope).toBeNull();
		expect(originalSession).toBeNull();
		expect(resetUser).toMatchObject({ passwordHash: 'scrypt$v1$16384$8$1$salt$key' });
	});

	it('adds item images with automatic cover assignment and tenant-scoped listing', () => {
		// arrange
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const owner = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const collection = repository.createCollection({ name: 'Garage' }, owner);
		const item = repository.createItem(
			{
				collectionId: collection.id,
				title: 'Bicycle',
				priceCents: 5000,
				category: 'hobby',
				condition: 'good',
				internalNotes: ''
			},
			owner
		);
		const foreignScope = { userId: 'foreign-user', tenantId: 'foreign-tenant' };

		// act
		const firstImage = repository.addItemImage(item.id, 'hash-one.png', owner);
		const secondImage = repository.addItemImage(item.id, 'hash-two.png', owner);

		// assume
		expect(firstImage).toMatchObject({ storageKey: 'hash-one.png', position: 0, isCover: true });
		expect(secondImage).toMatchObject({ storageKey: 'hash-two.png', position: 1, isCover: false });
		expect(repository.listItemImages(item.id, owner)).toEqual([firstImage, secondImage]);
		expect(repository.listItemImages(item.id, foreignScope)).toEqual([]);
	});

	it('reassigns the cover within the same item and tenant on demand', () => {
		// arrange
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const owner = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const collection = repository.createCollection({ name: 'Attic' }, owner);
		const item = repository.createItem(
			{
				collectionId: collection.id,
				title: 'Sled',
				priceCents: 2500,
				category: 'hobby',
				condition: 'fair',
				internalNotes: ''
			},
			owner
		);
		const firstImage = repository.addItemImage(item.id, 'hash-one.png', owner);
		const secondImage = repository.addItemImage(item.id, 'hash-two.png', owner);

		// act
		const changedCover = repository.setItemCover(item.id, secondImage.id, owner);
		const imagesAfterChange = repository.listItemImages(item.id, owner);

		// assume
		expect(changedCover).toEqual({ ...secondImage, isCover: true });
		expect(imagesAfterChange).toEqual([
			{ ...firstImage, isCover: false },
			{ ...secondImage, isCover: true }
		]);
	});

	it('deletes item images while preserving positions and cover state', () => {
		// arrange
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const owner = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const collection = repository.createCollection({ name: 'Basement' }, owner);
		const item = repository.createItem(
			{
				collectionId: collection.id,
				title: 'Shelf',
				priceCents: 3000,
				category: 'furniture',
				condition: 'fair',
				internalNotes: ''
			},
			owner
		);
		const firstImage = repository.addItemImage(item.id, 'hash-one.png', owner);
		const secondImage = repository.addItemImage(item.id, 'hash-two.png', owner);
		const thirdImage = repository.addItemImage(item.id, 'hash-three.png', owner);

		// act
		repository.deleteItemImage(item.id, firstImage.id, owner);
		const remainingImages = repository.listItemImages(item.id, owner);

		// assume
		expect(remainingImages).toEqual([
			{ ...secondImage, position: 0, isCover: true },
			{ ...thirdImage, position: 1, isCover: false }
		]);
	});

	it('attaches the same storage key to different items and tenants without unique conflicts', () => {
		// arrange
		const databasePath = createDatabasePath();
		const repository = createCollectionRepository({ databasePath });
		const owner = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const firstCollection = repository.createCollection({ name: 'First' }, owner);
		const secondCollection = repository.createCollection({ name: 'Second' }, owner);
		const firstItem = repository.createItem(
			{ collectionId: firstCollection.id, title: 'First item', priceCents: 100, category: 'home', condition: 'good', internalNotes: '' },
			owner
		);
		const secondItem = repository.createItem(
			{ collectionId: secondCollection.id, title: 'Second item', priceCents: 200, category: 'books', condition: 'fair', internalNotes: '' },
			owner
		);
		const database = new Database(databasePath);
		database
			.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)')
			.run('other-tenant', 'Other household', '2026-01-01T00:00:00.000Z');
		database
			.prepare('INSERT INTO users (id, tenant_id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.run('other-user', 'other-tenant', 'blake', 'Blake', 'scrypt$test-salt$test-key', '2026-01-01T00:00:00.000Z');
		database.close();
		const otherScope = { userId: 'other-user', tenantId: 'other-tenant' };
		const otherCollection = repository.createCollection({ name: 'Other' }, otherScope);
		const otherItem = repository.createItem(
			{ collectionId: otherCollection.id, title: 'Other item', priceCents: 300, category: 'tools', condition: 'poor', internalNotes: '' },
			otherScope
		);
		let duplicateContentError: unknown;

		// act
		const firstOwnerImage = repository.addItemImage(firstItem.id, 'same-content.png', owner);
		const secondOwnerImage = repository.addItemImage(secondItem.id, 'same-content.png', owner);
		const otherTenantImage = repository.addItemImage(otherItem.id, 'same-content.png', otherScope);

		// assume
		expect(duplicateContentError).toBeUndefined();
		expect(firstOwnerImage).toMatchObject({ storageKey: 'same-content.png', position: 0, isCover: true });
		expect(secondOwnerImage).toMatchObject({ storageKey: 'same-content.png', position: 0, isCover: true });
		expect(otherTenantImage).toMatchObject({ storageKey: 'same-content.png', position: 0, isCover: true });
	});

	it('migrates legacy items to carry sale fields while preserving every row', () => {
		// arrange
		const databasePath = createDatabasePath();
		const legacyDatabase = new Database(databasePath);
		legacyDatabase.exec(`
			CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
			CREATE TABLE users (
				id TEXT PRIMARY KEY,
				tenant_id TEXT NOT NULL,
				display_name TEXT NOT NULL,
				created_at TEXT NOT NULL,
				UNIQUE (id, tenant_id)
			);
			CREATE TABLE collections (
				id TEXT PRIMARY KEY,
				tenant_id TEXT NOT NULL,
				owner_id TEXT NOT NULL,
				name TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
			CREATE TABLE items (
				id TEXT PRIMARY KEY,
				collection_id TEXT NOT NULL,
				title TEXT NOT NULL,
				price_cents INTEGER NOT NULL,
				category TEXT NOT NULL,
				condition TEXT NOT NULL,
				internal_notes TEXT NOT NULL DEFAULT '',
				created_at TEXT NOT NULL
			);
		`);
		legacyDatabase
			.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)')
			.run('sale-tenant', 'Sale household', '2026-01-01T00:00:00.000Z');
		legacyDatabase
			.prepare('INSERT INTO users (id, tenant_id, display_name, created_at) VALUES (?, ?, ?, ?)')
			.run('sale-user', 'sale-tenant', 'Sale owner', '2026-01-01T00:00:00.000Z');
		legacyDatabase
			.prepare('INSERT INTO collections (id, tenant_id, owner_id, name, created_at) VALUES (?, ?, ?, ?, ?)')
			.run('sale-collection', 'sale-tenant', 'sale-user', 'Sale collection', '2026-01-01T00:00:00.000Z');
		legacyDatabase
			.prepare(
				'INSERT INTO items (id, collection_id, title, price_cents, category, condition, internal_notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.run('sold-item', 'sale-collection', 'Sold legacy item', 500, 'books', 'good', '', '2026-01-01T00:00:00.000Z');
		legacyDatabase.close();

		// act
		const repository = createCollectionRepository({ databasePath });
		const saleScope = { userId: 'sale-user', tenantId: 'sale-tenant' };
		const database = new Database(databasePath, { readonly: true });
		const itemColumns = (database.prepare('PRAGMA table_info(items)').all() as { name: string }[]).map(
			({ name }) => name
		);
		const legacyItemCount = database.prepare('SELECT COUNT(*) AS count FROM items').get();
		const foreignKeyErrors = database.prepare('PRAGMA foreign_key_check').all();
		database.close();

		// assume
		expect(itemColumns).toEqual(
			expect.arrayContaining(['sale_channel', 'sold_at', 'sale_proceeds_cents'])
		);
		expect(legacyItemCount).toEqual({ count: 1 });
		expect(foreignKeyErrors).toEqual([]);
		expect(repository.listItemsForOwner('sale-collection', saleScope)).toEqual([
			expect.objectContaining({
				id: 'sold-item',
				title: 'Sold legacy item',
				saleChannel: null,
				soldAt: null,
				saleProceedsCents: null
			})
		]);
	});

	it('marks items sold with channel, date, proceeds and clears them on reopen', () => {
		// arrange
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const owner = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const collection = repository.createCollection({ name: 'Flohmarkt' }, owner);
		const item = repository.createItem(
			{ collectionId: collection.id, title: 'Vase', priceCents: 800, category: 'decor', condition: 'good', internalNotes: '' },
			owner
		);
		const foreignScope = { userId: 'other-user', tenantId: 'other-tenant' };
		let foreignSaleError: unknown;
		let invalidChannelError: unknown;

		// act
		const soldItem = repository.markItemSold(
			item.id,
			{ channel: 'flea-market', soldAt: '2026-08-31T10:30:00.000Z', proceedsCents: 750 },
			owner
		);
		const listedItem = repository.listItemsForOwner(collection.id, owner)[0];
		try {
			repository.markItemSold(
				item.id,
				{ channel: 'flea-market', soldAt: '2026-08-31T10:30:00.000Z', proceedsCents: 750 },
				foreignScope
			);
		} catch (error) {
			foreignSaleError = error;
		}
		try {
			repository.markItemSold(
				item.id,
				{ channel: 'not-a-channel' as never, soldAt: '2026-08-31T10:30:00.000Z', proceedsCents: 750 },
				owner
			);
		} catch (error) {
			invalidChannelError = error;
		}
		const reopenedItem = repository.unmarkItemSold(item.id, owner);

		// assume
		expect(soldItem).toMatchObject({
			saleChannel: 'flea-market',
			soldAt: '2026-08-31T10:30:00.000Z',
			saleProceedsCents: 750
		});
		expect(listedItem).toMatchObject({ saleChannel: 'flea-market', saleProceedsCents: 750 });
		expect(foreignSaleError).toMatchObject({ message: 'item was not found' });
		expect(invalidChannelError).toMatchObject({ message: 'channel is not a supported sale channel' });
		expect(reopenedItem).toMatchObject({ saleChannel: null, soldAt: null, saleProceedsCents: null });
	});

	it('aggregates sale statistics per channel and month for the owning tenant only', () => {
		// arrange
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const owner = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const collection = repository.createCollection({ name: 'Flohmarkt' }, owner);
		const firstItem = repository.createItem(
			{ collectionId: collection.id, title: 'Vase', priceCents: 800, category: 'decor', condition: 'good', internalNotes: '' },
			owner
		);
		const secondItem = repository.createItem(
			{ collectionId: collection.id, title: 'Lampe', priceCents: 1500, category: 'decor', condition: 'fair', internalNotes: '' },
			owner
		);
		const thirdItem = repository.createItem(
			{ collectionId: collection.id, title: 'Buch', priceCents: 300, category: 'books', condition: 'fair', internalNotes: '' },
			owner
		);
		repository.markItemSold(firstItem.id, { channel: 'flea-market', soldAt: '2026-07-12T09:00:00.000Z', proceedsCents: 700 }, owner);
		repository.markItemSold(secondItem.id, { channel: 'flea-market', soldAt: '2026-08-02T09:00:00.000Z', proceedsCents: 1400 }, owner);
		repository.markItemSold(thirdItem.id, { channel: 'online-marketplace', soldAt: '2026-08-20T09:00:00.000Z', proceedsCents: 250 }, owner);
		const foreignScope = { userId: 'other-user', tenantId: 'other-tenant' };

		// act
		const statistics = repository.getSaleStatistics(owner);
		const foreignStatistics = repository.getSaleStatistics(foreignScope);
		const reopenedItem = repository.unmarkItemSold(secondItem.id, owner);
		const statisticsAfterReopen = repository.getSaleStatistics(owner);

		// assume
		expect(statistics).toEqual({
			soldItemCount: 3,
			totalProceedsCents: 2350,
			proceedsByChannel: [
				{ channel: 'flea-market', soldItemCount: 2, totalProceedsCents: 2100 },
				{ channel: 'online-marketplace', soldItemCount: 1, totalProceedsCents: 250 }
			],
			proceedsByMonth: [
				{ month: '2026-07', soldItemCount: 1, totalProceedsCents: 700 },
				{ month: '2026-08', soldItemCount: 2, totalProceedsCents: 1650 }
			]
		});
		expect(foreignStatistics).toEqual({
			soldItemCount: 0,
			totalProceedsCents: 0,
			proceedsByChannel: [],
			proceedsByMonth: []
		});

		// assume
		expect(reopenedItem.saleChannel).toBeNull();
		expect(statisticsAfterReopen).toEqual({
			soldItemCount: 2,
			totalProceedsCents: 950,
			proceedsByChannel: [
				{ channel: 'flea-market', soldItemCount: 1, totalProceedsCents: 700 },
				{ channel: 'online-marketplace', soldItemCount: 1, totalProceedsCents: 250 }
			],
			proceedsByMonth: [
				{ month: '2026-07', soldItemCount: 1, totalProceedsCents: 700 },
				{ month: '2026-08', soldItemCount: 1, totalProceedsCents: 250 }
			]
		});
	});

	it('returns a reduced public stand view with only unsold items of the requested collection', () => {
		// arrange
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const owner = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const standCollection = repository.createCollection({ name: 'Flohmarkt' }, owner);
		const availableItem = repository.createItem(
			{ collectionId: standCollection.id, title: 'Vase', priceCents: 800, category: 'decor', condition: 'good', internalNotes: 'Nur abends abgeben' },
			owner
		);
		const secondAvailableItem = repository.createItem(
			{ collectionId: standCollection.id, title: 'Buch', priceCents: 300, category: 'books', condition: 'fair', internalNotes: '' },
			owner
		);
		const privateNotesItem = repository.createItem(
			{ collectionId: standCollection.id, title: 'Geheime Lampe', priceCents: 1500, category: 'decor', condition: 'fair', internalNotes: 'Privates Detail' },
			owner
		);
		repository.markItemSold(availableItem.id, { channel: 'flea-market', soldAt: '2026-08-31T10:30:00.000Z', proceedsCents: 750 }, owner);
		const unknownCollectionId = '00000000-0000-0000-0000-000000000000';
		let unknownStandView: ReturnType<typeof repository.getPublicStandView>;

		// act
		const publicView = repository.getPublicStandView(standCollection.id);
		unknownStandView = repository.getPublicStandView(unknownCollectionId);

		// assume
		expect(publicView).toEqual({
			collectionName: 'Flohmarkt',
			items: [
				expect.objectContaining({ id: privateNotesItem.id, title: 'Geheime Lampe', priceCents: 1500, category: 'decor', condition: 'fair' }),
				expect.objectContaining({ id: secondAvailableItem.id, title: 'Buch', priceCents: 300, category: 'books', condition: 'fair' })
			]
		});
		for (const entry of publicView?.items ?? []) {
			expect(entry).not.toHaveProperty('internalNotes');
			expect(entry).not.toHaveProperty('saleChannel');
			expect(entry).not.toHaveProperty('soldAt');
			expect(entry).not.toHaveProperty('saleProceedsCents');
		}
		expect(unknownStandView).toBeNull();
	});
});
