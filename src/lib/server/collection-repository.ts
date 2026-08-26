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

const tenantSchemaFoundationVersion = '2026082601_tenant_schema_foundation';
const categoryValues = itemCategories.map((category) => `'${category}'`).join(', ');
const conditionValues = itemConditions.map((condition) => `'${condition}'`).join(', ');

/**
 * Create a SQLite-backed repository for the core collection domain.
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
	createIndexes(database);

	return {
		hasAdminAccount() {
			return Boolean(database.prepare('SELECT 1 FROM users LIMIT 1').get());
		},

		createInitialAdmin(input) {
			const username = normalizeUsername(input.username);
			const displayName = requireText(input.displayName, 'displayName');
			const passwordHash = requireText(input.passwordHash, 'passwordHash');
			const tenantId = randomUUID();
			const userId = randomUUID();
			const createdAt = new Date().toISOString();

			database.transaction(() => {
				if (database.prepare('SELECT 1 FROM users LIMIT 1').get()) {
					throw new Error('an initial admin account already exists');
				}
				database
					.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)')
					.run(tenantId, `${displayName}'s household`, createdAt);
				database
					.prepare(
						`INSERT INTO users (id, tenant_id, username, display_name, password_hash, created_at)
						 VALUES (?, ?, ?, ?, ?, ?)`
					)
					.run(userId, tenantId, username, displayName, passwordHash, createdAt);
				database
					.prepare('INSERT INTO instance_roles (user_id, role, created_at) VALUES (?, ?, ?)')
					.run(userId, 'instance_admin', createdAt);
			})();

			return { userId, tenantId, username, displayName };
		},

		getUserForLogin(username) {
			const row = database
				.prepare(
					`SELECT id, tenant_id, username, display_name, password_hash
					 FROM users
					 WHERE username = ?`
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
					 WHERE id = ? AND tenant_id = ?`
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
					 WHERE collections.id = ? AND collections.owner_id = ? AND collections.tenant_id = ?`
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
					 WHERE collections.owner_id = ? AND collections.tenant_id = ?
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
					 WHERE id = ? AND tenant_id = ?`
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
					`SELECT sessions.user_id, sessions.tenant_id
					 FROM sessions
					 JOIN users ON users.id = sessions.user_id AND users.tenant_id = sessions.tenant_id
					 WHERE sessions.token_hash = ? AND sessions.revoked_at IS NULL AND sessions.expires_at > ?`
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
						id, tenant_id, owner_id, collection_id, title, price_cents, category, condition, internal_notes, created_at
					) SELECT ?, collections.tenant_id, collections.owner_id, collections.id, ?, ?, ?, ?, ?, ?
					FROM collections
					WHERE collections.id = ? AND collections.owner_id = ? AND collections.tenant_id = ?`
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
					 JOIN collections ON collections.id = items.collection_id AND collections.tenant_id = items.tenant_id
					 JOIN users ON users.id = collections.owner_id AND users.tenant_id = collections.tenant_id
					 WHERE items.collection_id = ? AND items.owner_id = ? AND items.tenant_id = ?
					 ORDER BY items.created_at DESC, items.id DESC`
				)
				.all(collectionId, scope.userId, scope.tenantId)
				.map((row) => mapItemRow(row as ItemRow));
		}
	};
}

/**
 * Create the current schema for a new SQLite database.
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
			username TEXT COLLATE NOCASE UNIQUE,
			display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
			password_hash TEXT,
			created_at TEXT NOT NULL,
			UNIQUE (id, tenant_id)
		);
		CREATE TABLE IF NOT EXISTS instance_roles (
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			role TEXT NOT NULL CHECK (role = 'instance_admin'),
			created_at TEXT NOT NULL,
			PRIMARY KEY (user_id, role)
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
			UNIQUE (id, tenant_id),
			FOREIGN KEY (owner_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE RESTRICT
		);
		CREATE TABLE IF NOT EXISTS items (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			owner_id TEXT NOT NULL,
			collection_id TEXT NOT NULL,
			title TEXT NOT NULL CHECK (length(trim(title)) > 0),
			price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
			category TEXT NOT NULL CHECK (category IN (${categoryValues})),
			condition TEXT NOT NULL CHECK (condition IN (${conditionValues})),
			internal_notes TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			UNIQUE (id, tenant_id),
			FOREIGN KEY (owner_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE RESTRICT,
			FOREIGN KEY (collection_id, tenant_id) REFERENCES collections(id, tenant_id) ON DELETE CASCADE
		);
		CREATE TABLE IF NOT EXISTS item_images (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			item_id TEXT NOT NULL,
			storage_key TEXT NOT NULL UNIQUE,
			position INTEGER NOT NULL CHECK (position >= 0),
			is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
			created_at TEXT NOT NULL,
			UNIQUE (item_id, tenant_id, position),
			FOREIGN KEY (item_id, tenant_id) REFERENCES items(id, tenant_id) ON DELETE CASCADE
		);
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TEXT NOT NULL
		);
	`);
}

/**
 * Create indexes only after every legacy table has the current columns.
 *
 * @param {Database.Database} database - The SQLite connection to initialize.
 * @returns {void}
 */
function createIndexes(database: Database.Database): void {
	database.exec(`
		CREATE INDEX IF NOT EXISTS users_tenant_id_idx ON users(tenant_id, id);
		CREATE INDEX IF NOT EXISTS instance_roles_role_idx ON instance_roles(role, user_id);
		CREATE INDEX IF NOT EXISTS sessions_tenant_user_idx ON sessions(tenant_id, user_id);
		CREATE INDEX IF NOT EXISTS sessions_token_active_idx ON sessions(token_hash, expires_at) WHERE revoked_at IS NULL;
		CREATE INDEX IF NOT EXISTS collections_tenant_owner_created_idx ON collections(tenant_id, owner_id, created_at, id);
		CREATE INDEX IF NOT EXISTS items_tenant_collection_created_idx ON items(tenant_id, collection_id, created_at, id);
		CREATE INDEX IF NOT EXISTS items_tenant_owner_created_idx ON items(tenant_id, owner_id, created_at, id);
		CREATE INDEX IF NOT EXISTS item_images_tenant_item_position_idx ON item_images(tenant_id, item_id, position);
	`);
}

/**
 * Apply the tenant-schema foundation once while preserving every prior record.
 *
 * @param {Database.Database} database - The SQLite connection to migrate.
 * @returns {void}
 */
function migrateSchema(database: Database.Database): void {
	if (
		database
			.prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
			.get(tenantSchemaFoundationVersion)
	) {
		return;
	}

	const legacyAdminUserIds = hasColumn(database, 'users', 'is_admin')
		? (database.prepare('SELECT id FROM users WHERE is_admin = 1').all() as { id: string }[]).map(
			({ id }) => id
		)
		: [];

	database.pragma('foreign_keys = OFF');
	try {
		database.transaction(() => {
			rebuildUsers(database);
			rebuildSessions(database);
			rebuildCollections(database);
			rebuildItems(database);
			rebuildItemImages(database);
			replaceFoundationTables(database);
			for (const userId of legacyAdminUserIds) {
				database
					.prepare(
						'INSERT OR IGNORE INTO instance_roles (user_id, role, created_at) VALUES (?, ?, ?)'
					)
					.run(userId, 'instance_admin', new Date().toISOString());
			}
			createSchema(database);
			assertForeignKeys(database);
			database
				.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
				.run(tenantSchemaFoundationVersion, new Date().toISOString());
		})();
	} finally {
		database.pragma('foreign_keys = ON');
	}
}

/**
 * Rebuild users without the legacy global administrator flag.
 *
 * @param {Database.Database} database - The SQLite connection to migrate.
 * @returns {void}
 */
function rebuildUsers(database: Database.Database): void {
	const username = hasColumn(database, 'users', 'username') ? 'username' : 'NULL';
	const passwordHash = hasColumn(database, 'users', 'password_hash') ? 'password_hash' : 'NULL';
	database.exec(`
		CREATE TABLE users_next (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			username TEXT COLLATE NOCASE UNIQUE,
			display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
			password_hash TEXT,
			created_at TEXT NOT NULL,
			UNIQUE (id, tenant_id)
		);
		INSERT INTO users_next (id, tenant_id, username, display_name, password_hash, created_at)
		SELECT id, tenant_id, ${username}, display_name, ${passwordHash}, created_at FROM users;
	`);
	assertCopiedRowCount(database, 'users', 'users_next');
}

/**
 * Rebuild sessions with a tenant-safe composite user relationship.
 *
 * @param {Database.Database} database - The SQLite connection to migrate.
 * @returns {void}
 */
function rebuildSessions(database: Database.Database): void {
	database.exec(`
		CREATE TABLE sessions_next (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL,
			revoked_at TEXT,
			FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE CASCADE
		);
		INSERT INTO sessions_next (id, user_id, tenant_id, token_hash, expires_at, created_at, revoked_at)
		SELECT id, user_id, tenant_id, token_hash, expires_at, created_at, revoked_at FROM sessions;
	`);
	assertCopiedRowCount(database, 'sessions', 'sessions_next');
}

/**
 * Rebuild collections with a tenant-safe composite owner relationship.
 *
 * @param {Database.Database} database - The SQLite connection to migrate.
 * @returns {void}
 */
function rebuildCollections(database: Database.Database): void {
	database.exec(`
		CREATE TABLE collections_next (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			owner_id TEXT NOT NULL,
			name TEXT NOT NULL CHECK (length(trim(name)) > 0),
			created_at TEXT NOT NULL,
			UNIQUE (id, tenant_id),
			FOREIGN KEY (owner_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE RESTRICT
		);
		INSERT INTO collections_next (id, tenant_id, owner_id, name, created_at)
		SELECT id, tenant_id, owner_id, name, created_at FROM collections;
	`);
	assertCopiedRowCount(database, 'collections', 'collections_next');
}

/**
 * Rebuild items and derive their tenant and owner from their existing collection.
 *
 * @param {Database.Database} database - The SQLite connection to migrate.
 * @returns {void}
 */
function rebuildItems(database: Database.Database): void {
	database.exec(`
		CREATE TABLE items_next (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			owner_id TEXT NOT NULL,
			collection_id TEXT NOT NULL,
			title TEXT NOT NULL CHECK (length(trim(title)) > 0),
			price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
			category TEXT NOT NULL CHECK (category IN (${categoryValues})),
			condition TEXT NOT NULL CHECK (condition IN (${conditionValues})),
			internal_notes TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			UNIQUE (id, tenant_id),
			FOREIGN KEY (owner_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE RESTRICT,
			FOREIGN KEY (collection_id, tenant_id) REFERENCES collections(id, tenant_id) ON DELETE CASCADE
		);
		INSERT INTO items_next (
			id, tenant_id, owner_id, collection_id, title, price_cents, category, condition, internal_notes, created_at
		)
		SELECT
			items.id, collections.tenant_id, collections.owner_id, items.collection_id, items.title,
			items.price_cents, items.category, items.condition, items.internal_notes, items.created_at
		FROM items
		JOIN collections ON collections.id = items.collection_id;
	`);
	assertCopiedRowCount(database, 'items', 'items_next');
}

/**
 * Rebuild item images with a tenant-safe composite item relationship.
 *
 * @param {Database.Database} database - The SQLite connection to migrate.
 * @returns {void}
 */
function rebuildItemImages(database: Database.Database): void {
	database.exec(`
		CREATE TABLE item_images_next (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			item_id TEXT NOT NULL,
			storage_key TEXT NOT NULL UNIQUE,
			position INTEGER NOT NULL CHECK (position >= 0),
			is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
			created_at TEXT NOT NULL,
			UNIQUE (item_id, tenant_id, position),
			FOREIGN KEY (item_id, tenant_id) REFERENCES items(id, tenant_id) ON DELETE CASCADE
		);
		INSERT INTO item_images_next (id, tenant_id, item_id, storage_key, position, is_cover, created_at)
		SELECT item_images.id, items_next.tenant_id, item_images.item_id, item_images.storage_key,
			item_images.position, item_images.is_cover, item_images.created_at
		FROM item_images
		JOIN items_next ON items_next.id = item_images.item_id;
	`);
	assertCopiedRowCount(database, 'item_images', 'item_images_next');
}

/**
 * Replace legacy tables only after their complete copies have been created.
 *
 * @param {Database.Database} database - The SQLite connection to migrate.
 * @returns {void}
 */
function replaceFoundationTables(database: Database.Database): void {
	database.exec(`
		DROP TABLE item_images;
		DROP TABLE items;
		DROP TABLE sessions;
		DROP TABLE collections;
		DROP TABLE users;
		ALTER TABLE users_next RENAME TO users;
		ALTER TABLE sessions_next RENAME TO sessions;
		ALTER TABLE collections_next RENAME TO collections;
		ALTER TABLE items_next RENAME TO items;
		ALTER TABLE item_images_next RENAME TO item_images;
	`);
}

/**
 * Assert that a copy operation retained every source row.
 *
 * @param {Database.Database} database - The SQLite connection to inspect.
 * @param {string} sourceTable - Source table name.
 * @param {string} targetTable - Copied table name.
 * @returns {void}
 * @throws {Error} If a relationship prevented a complete copy.
 */
function assertCopiedRowCount(database: Database.Database, sourceTable: string, targetTable: string): void {
	const sourceCount = getTableRowCount(database, sourceTable);
	const targetCount = getTableRowCount(database, targetTable);
	if (sourceCount !== targetCount) {
		throw new Error(`migration could not copy every ${sourceTable} record`);
	}
}

/**
 * Return the number of rows in a trusted internal table name.
 *
 * @param {Database.Database} database - The SQLite connection to inspect.
 * @param {string} tableName - Trusted internal table name.
 * @returns {number} Row count.
 */
function getTableRowCount(database: Database.Database, tableName: string): number {
	return (database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as { count: number }).count;
}

/**
 * Determine whether a table contains a named column.
 *
 * @param {Database.Database} database - The SQLite connection to inspect.
 * @param {string} tableName - Trusted internal table name.
 * @param {string} columnName - Expected column name.
 * @returns {boolean} Whether the column exists.
 */
function hasColumn(database: Database.Database, tableName: string, columnName: string): boolean {
	return (database.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]).some(
		({ name }) => name === columnName
	);
}

/**
 * Fail the migration if SQLite detects any invalid foreign-key relationship.
 *
 * @param {Database.Database} database - The SQLite connection to validate.
 * @returns {void}
 * @throws {Error} If the rebuilt schema has invalid foreign keys.
 */
function assertForeignKeys(database: Database.Database): void {
	const violations = database.prepare('PRAGMA foreign_key_check').all();
	if (violations.length > 0) {
		throw new Error('migration produced invalid foreign-key relationships');
	}
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
		.prepare('SELECT display_name FROM users WHERE id = ? AND tenant_id = ?')
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
