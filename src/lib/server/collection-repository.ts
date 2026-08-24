import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';

export const itemCategories = [
	'clothing',
	'books',
	'electronics',
	'home',
	'toys',
	'decor',
	'furniture',
	'tools',
	'hobby',
	'other'
] as const;

export const itemConditions = ['new', 'like-new', 'good', 'fair', 'poor'] as const;

export type ItemCategory = (typeof itemCategories)[number];
export type ItemCondition = (typeof itemConditions)[number];

export interface Collection {
	id: string;
	name: string;
	ownerName: string;
}

export interface Item {
	id: string;
	collectionId: string;
	title: string;
	priceCents: number;
	category: ItemCategory;
	condition: ItemCondition;
	internalNotes: string;
}

export interface CreateInitialAdminInput {
	username: string;
	displayName: string;
	passwordHash: string;
}

export interface CreateCollectionInput {
	name: string;
}

export interface CreateItemInput {
	collectionId: string;
	title: string;
	priceCents: number;
	category: ItemCategory;
	condition: ItemCondition;
	internalNotes: string;
}

export interface SessionScope {
	userId: string;
	tenantId: string;
}

export interface AdminAccount extends SessionScope {
	username: string;
	displayName: string;
}

export interface LoginAccount extends AdminAccount {
	passwordHash: string;
}

export interface CollectionRepository {
	hasAdminAccount(): boolean;
	createInitialAdmin(input: CreateInitialAdminInput): AdminAccount;
	getUserForLogin(username: string): LoginAccount | null;
	createCollection(input: CreateCollectionInput, scope: SessionScope): Collection;
	getCollectionForOwner(collectionId: string, scope: SessionScope): Collection | null;
	listCollectionsForOwner(scope: SessionScope): Collection[];
	createSessionForUser(scope: SessionScope, tokenHash: string): void;
	getSession(tokenHash: string): SessionScope | null;
	createItem(input: CreateItemInput, scope: SessionScope): Item;
	listItemsForOwner(collectionId: string, scope: SessionScope): Item[];
}

interface CreateCollectionRepositoryOptions {
	databasePath: string;
}

interface ItemRow {
	id: string;
	collection_id: string;
	title: string;
	price_cents: number;
	category: ItemCategory;
	condition: ItemCondition;
	internal_notes: string;
}

const categoryValues = itemCategories.map((category) => `'${category}'`).join(', ');
const conditionValues = itemConditions.map((condition) => `'${condition}'`).join(', ');

/**
 * Create a SQLite-backed repository for passalong's core collection domain.
 *
 * @param {CreateCollectionRepositoryOptions} options - Connection configuration.
 * @returns {CollectionRepository} The collection repository.
 */
export function createCollectionRepository(
	options: CreateCollectionRepositoryOptions
): CollectionRepository {
	const database = new Database(options.databasePath);
	database.pragma('foreign_keys = ON');
	database.pragma('journal_mode = WAL');
	database.pragma('busy_timeout = 5000');
	createSchema(database);
	migrateSchema(database);

	return {
		hasAdminAccount() {
			return Boolean(
				database.prepare('SELECT 1 FROM users WHERE is_admin = 1 LIMIT 1').get()
			);
		},

		createInitialAdmin(input) {
			const username = normalizeUsername(input.username);
			const displayName = requireText(input.displayName, 'displayName');
			const passwordHash = requireText(input.passwordHash, 'passwordHash');
			const tenantId = randomUUID();
			const userId = randomUUID();
			const createdAt = new Date().toISOString();

			try {
				database.transaction(() => {
					if (database.prepare('SELECT 1 FROM users WHERE is_admin = 1 LIMIT 1').get()) {
						throw new Error('an admin account already exists');
					}
					database
						.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)')
						.run(tenantId, `${displayName}'s household`, createdAt);
					database
						.prepare(
							`INSERT INTO users (
								id, tenant_id, username, display_name, password_hash, is_admin, created_at
							) VALUES (?, ?, ?, ?, ?, 1, ?)`
						)
						.run(userId, tenantId, username, displayName, passwordHash, createdAt);
				})();
			} catch (error) {
				if (error instanceof Error && error.message.includes('UNIQUE constraint failed: users.is_admin')) {
					throw new Error('an admin account already exists');
				}
				throw error;
			}

			return { userId, tenantId, username, displayName };
		},

		getUserForLogin(username) {
			const row = database
				.prepare(
					`SELECT id, tenant_id, username, display_name, password_hash
					 FROM users
					 WHERE username = ? AND is_admin = 1`
				)
				.get(normalizeUsername(username)) as
				| {
						id: string;
						tenant_id: string;
						username: string;
						display_name: string;
						password_hash: string;
					  }
				| undefined;
			return row
				? {
						userId: row.id,
						tenantId: row.tenant_id,
						username: row.username,
						displayName: row.display_name,
						passwordHash: row.password_hash
					}
				: null;
		},

		createCollection(input, scope) {
			const name = requireText(input.name, 'name');
			const collectionId = randomUUID();
			const result = database
				.prepare(
					`INSERT INTO collections (id, tenant_id, owner_id, name, created_at)
					 SELECT ?, tenant_id, id, ?, ?
					 FROM users
					 WHERE id = ? AND tenant_id = ? AND is_admin = 1`
				)
				.run(collectionId, name, new Date().toISOString(), scope.userId, scope.tenantId);
			if (result.changes !== 1) {
				throw new Error('authenticated owner was not found');
			}
			return { id: collectionId, name, ownerName: getOwnerDisplayName(database, scope) };
		},

		getCollectionForOwner(collectionId, scope) {
			const row = database
				.prepare(
					`SELECT collections.id, collections.name, users.display_name AS owner_name
					 FROM collections
					 JOIN users ON users.id = collections.owner_id AND users.tenant_id = collections.tenant_id
					 WHERE collections.id = ? AND collections.owner_id = ? AND collections.tenant_id = ?
					 AND users.is_admin = 1`
				)
				.get(collectionId, scope.userId, scope.tenantId) as
				| { id: string; name: string; owner_name: string }
				| undefined;
			return row ? { id: row.id, name: row.name, ownerName: row.owner_name } : null;
		},

		listCollectionsForOwner(scope) {
			return database
				.prepare(
					`SELECT collections.id, collections.name, users.display_name AS owner_name
					 FROM collections
					 JOIN users ON users.id = collections.owner_id AND users.tenant_id = collections.tenant_id
					 WHERE collections.owner_id = ? AND collections.tenant_id = ? AND users.is_admin = 1
					 ORDER BY collections.created_at ASC, collections.id ASC`
				)
				.all(scope.userId, scope.tenantId)
				.map((row) => {
					const collection = row as { id: string; name: string; owner_name: string };
					return { id: collection.id, name: collection.name, ownerName: collection.owner_name };
				});
		},

		createSessionForUser(scope, tokenHash) {
			const result = database
				.prepare(
					`INSERT INTO sessions (id, user_id, tenant_id, token_hash, expires_at, created_at)
					 SELECT ?, id, tenant_id, ?, ?, ?
					 FROM users
					 WHERE id = ? AND tenant_id = ? AND is_admin = 1`
				)
				.run(
					randomUUID(),
					tokenHash,
					new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
					new Date().toISOString(),
					scope.userId,
					scope.tenantId
				);
			if (result.changes !== 1) {
				throw new Error('authenticated owner was not found');
			}
		},

		getSession(tokenHash) {
			const row = database
				.prepare(
					`SELECT sessions.user_id, sessions.tenant_id FROM sessions
					 JOIN users ON users.id = sessions.user_id AND users.tenant_id = sessions.tenant_id
					 WHERE sessions.token_hash = ? AND sessions.revoked_at IS NULL AND sessions.expires_at > ?
					 AND users.is_admin = 1`
				)
				.get(tokenHash, new Date().toISOString()) as
				| { user_id: string; tenant_id: string }
				| undefined;
			return row ? { userId: row.user_id, tenantId: row.tenant_id } : null;
		},

		createItem(input, scope) {
			const title = requireText(input.title, 'title');
			const internalNotes = input.internalNotes.trim();
			validateItemInput(input);
			const item: Item = {
				id: randomUUID(),
				collectionId: input.collectionId,
				title,
				priceCents: input.priceCents,
				category: input.category,
				condition: input.condition,
				internalNotes
			};

			const result = database
				.prepare(
					`INSERT INTO items (
						id, collection_id, title, price_cents, category, condition, internal_notes, created_at
					) SELECT ?, collections.id, ?, ?, ?, ?, ?, ?
					FROM collections
					JOIN users ON users.id = collections.owner_id AND users.tenant_id = collections.tenant_id
					WHERE collections.id = ? AND collections.owner_id = ? AND collections.tenant_id = ?
					AND users.is_admin = 1`
				)
				.run(
					item.id,
					item.title,
					item.priceCents,
					item.category,
					item.condition,
					item.internalNotes,
					new Date().toISOString(),
					item.collectionId,
					scope.userId,
					scope.tenantId
				);
			if (result.changes !== 1) {
				throw new Error('collection was not found');
			}
			return item;
		},

		listItemsForOwner(collectionId, scope) {
			return database
				.prepare(
					`SELECT items.id, items.collection_id, items.title, items.price_cents, items.category, items.condition, items.internal_notes
					 FROM items
					 JOIN collections ON collections.id = items.collection_id
					 JOIN users ON users.id = collections.owner_id AND users.tenant_id = collections.tenant_id
					 WHERE items.collection_id = ? AND collections.owner_id = ? AND collections.tenant_id = ?
					 AND users.is_admin = 1
					 ORDER BY items.created_at DESC, items.id DESC`
				)
				.all(collectionId, scope.userId, scope.tenantId)
				.map((row) => mapItemRow(row as ItemRow));
		}
	};
}

/**
 * Create the current schema for new SQLite databases.
 *
 * @param {Database.Database} database - The SQLite connection to initialize.
 * @returns {void}
 */
function createSchema(database: Database.Database): void {
	database.exec(`
		CREATE TABLE IF NOT EXISTS tenants (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL CHECK (length(trim(name)) > 0),
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			username TEXT,
			display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
			password_hash TEXT,
			is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
			created_at TEXT NOT NULL,
			UNIQUE (id, tenant_id)
		);
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL,
			revoked_at TEXT,
			FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE CASCADE
		);
		CREATE TABLE IF NOT EXISTS collections (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			owner_id TEXT NOT NULL,
			name TEXT NOT NULL CHECK (length(trim(name)) > 0),
			created_at TEXT NOT NULL,
			FOREIGN KEY (owner_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE RESTRICT
		);
		CREATE TABLE IF NOT EXISTS items (
			id TEXT PRIMARY KEY,
			collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
			title TEXT NOT NULL CHECK (length(trim(title)) > 0),
			price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
			category TEXT NOT NULL CHECK (category IN (${categoryValues})),
			condition TEXT NOT NULL CHECK (condition IN (${conditionValues})),
			internal_notes TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS item_images (
			id TEXT PRIMARY KEY,
			item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
			storage_key TEXT NOT NULL UNIQUE,
			position INTEGER NOT NULL CHECK (position >= 0),
			is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
			created_at TEXT NOT NULL,
			UNIQUE (item_id, position)
		);
		CREATE INDEX IF NOT EXISTS items_collection_id_idx ON items(collection_id);
		CREATE INDEX IF NOT EXISTS item_images_item_id_idx ON item_images(item_id);
	`);
}

/**
 * Add account columns and indexes to databases created before account login existed.
 * Existing collections and items are preserved; old owner records remain non-admin.
 *
 * @param {Database.Database} database - The SQLite connection to migrate.
 * @returns {void}
 */
function migrateSchema(database: Database.Database): void {
	const userColumns = new Set(
		(database.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((column) => column.name)
	);
	const migrations: Array<[string, string]> = [
		['username', 'ALTER TABLE users ADD COLUMN username TEXT'],
		['password_hash', 'ALTER TABLE users ADD COLUMN password_hash TEXT'],
		['is_admin', 'ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1))']
	];

	database.transaction(() => {
		for (const [column, statement] of migrations) {
			if (!userColumns.has(column)) {
				database.exec(statement);
			}
		}
		database.exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users(username) WHERE username IS NOT NULL;
			CREATE UNIQUE INDEX IF NOT EXISTS users_single_admin_idx ON users(is_admin) WHERE is_admin = 1;
		`);
	})();
}

/**
 * Look up the display name that belongs to a validated authenticated scope.
 *
 * @param {Database.Database} database - The SQLite connection.
 * @param {SessionScope} scope - Authenticated user and tenant scope.
 * @returns {string} The owner's display name.
 * @throws {Error} If the authenticated owner no longer exists.
 */
function getOwnerDisplayName(database: Database.Database, scope: SessionScope): string {
	const row = database
		.prepare('SELECT display_name FROM users WHERE id = ? AND tenant_id = ? AND is_admin = 1')
		.get(scope.userId, scope.tenantId) as { display_name: string } | undefined;
	if (!row) {
		throw new Error('authenticated owner was not found');
	}
	return row.display_name;
}

/**
 * Map a database row into the application's public item shape.
 *
 * @param {ItemRow} row - The selected database row.
 * @returns {Item} A core collection item.
 */
function mapItemRow(row: ItemRow): Item {
	return {
		id: row.id,
		collectionId: row.collection_id,
		title: row.title,
		priceCents: row.price_cents,
		category: row.category,
		condition: row.condition,
		internalNotes: row.internal_notes
	};
}

/**
 * Require non-empty text after trimming whitespace.
 *
 * @param {string} value - The text to validate.
 * @param {string} fieldName - Name included in validation errors.
 * @returns {string} The normalized text.
 * @throws {Error} If the text is empty.
 */
function requireText(value: string, fieldName: string): string {
	const normalized = value.trim();
	if (!normalized) {
		throw new Error(`${fieldName} must not be empty`);
	}
	return normalized;
}

/**
 * Normalize and validate a login username.
 *
 * @param {string} value - The untrusted username.
 * @returns {string} The normalized lowercase username.
 * @throws {Error} If the username is outside the allowed format.
 */
function normalizeUsername(value: string): string {
	const normalized = value.trim().toLowerCase();
	if (!/^[a-z0-9_-]{3,64}$/.test(normalized)) {
		throw new Error('username must contain 3 to 64 lowercase letters, numbers, underscores, or hyphens');
	}
	return normalized;
}

/**
 * Validate item fields before attempting persistence.
 *
 * @param {CreateItemInput} input - Item values to validate.
 * @returns {void}
 * @throws {Error} If a value is invalid.
 */
function validateItemInput(input: CreateItemInput): void {
	if (!Number.isSafeInteger(input.priceCents) || input.priceCents < 0) {
		throw new Error('priceCents must be a non-negative integer');
	}
	if (!itemCategories.includes(input.category)) {
		throw new Error('category is not supported');
	}
	if (!itemConditions.includes(input.condition)) {
		throw new Error('condition is not supported');
	}
}
