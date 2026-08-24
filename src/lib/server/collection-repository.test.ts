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

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe('collection repository', () => {
	it('creates exactly one initial admin account with a persisted password hash', () => {
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });

		expect(repository.hasAdminAccount()).toBe(false);
		const admin = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});

		expect(repository.hasAdminAccount()).toBe(true);
		expect(repository.getUserForLogin('avery')).toEqual({
			...admin,
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		expect(() =>
			repository.createInitialAdmin({
				username: 'blake',
				displayName: 'Blake',
				passwordHash: 'scrypt$another-salt$another-key'
			})
		).toThrow('an admin account already exists');
	});

	it('lets an authenticated admin create a collection and persist an item', () => {
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const admin = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
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
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const admin = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const collection = repository.createCollection({ name: 'Books' }, admin);
		const anotherScope = { userId: 'another-user', tenantId: admin.tenantId };

		expect(repository.getCollectionForOwner(collection.id, anotherScope)).toBeNull();
		expect(repository.listCollectionsForOwner(anotherScope)).toEqual([]);
		expect(repository.listItemsForOwner(collection.id, anotherScope)).toEqual([]);
		expect(() =>
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
			)
		).toThrow('collection was not found');
	});

	it('migrates a legacy owner schema without deleting existing records', () => {
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

		const repository = createCollectionRepository({ databasePath });
		const admin = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const migratedDatabase = new Database(databasePath, { readonly: true });

		expect(repository.getCollectionForOwner('legacy-collection', admin)).toBeNull();
		expect(
			migratedDatabase
				.prepare('SELECT display_name, username, password_hash, is_admin FROM users WHERE id = ?')
				.get('legacy-user')
		).toEqual({ display_name: 'Legacy owner', username: null, password_hash: null, is_admin: 0 });
		migratedDatabase.close();
	});

	it('stores only hashes for browser sessions and resolves their owner scope', () => {
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const admin = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});

		repository.createSessionForUser(admin, 'test-token-hash');

		expect(repository.getSession('test-token-hash')).toEqual({
			userId: admin.userId,
			tenantId: admin.tenantId
		});
		expect(repository.getSession('test-token')).toBeNull();
	});
});
