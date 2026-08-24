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

export interface CreateCollectionInput {
	ownerName: string;
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

export interface CollectionRepository {
	createCollection(input: CreateCollectionInput): Collection;
	getCollection(collectionId: string): Collection | null;
	getCollectionForOwner(collectionId: string, scope: SessionScope): Collection | null;
	createSessionForCollection(collectionId: string, tokenHash: string): void;
	getSession(tokenHash: string): SessionScope | null;
	listCollections(): Collection[];
	createItem(input: CreateItemInput): Item;
	listItemsForOwner(collectionId: string, scope: SessionScope): Item[];
	listItems(collectionId: string): Item[];
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

	return {
		createCollection(input) {
			const ownerName = requireText(input.ownerName, 'ownerName');
			const name = requireText(input.name, 'name');
			const tenantId = randomUUID();
			const ownerId = randomUUID();
			const collectionId = randomUUID();
			const createdAt = new Date().toISOString();

			database.transaction(() => {
				database
					.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)')
					.run(tenantId, `${ownerName}'s household`, createdAt);
				database
					.prepare(
						'INSERT INTO users (id, tenant_id, display_name, created_at) VALUES (?, ?, ?, ?)'
					)
					.run(ownerId, tenantId, ownerName, createdAt);
				database
					.prepare(
						'INSERT INTO collections (id, tenant_id, owner_id, name, created_at) VALUES (?, ?, ?, ?, ?)'
					)
					.run(collectionId, tenantId, ownerId, name, createdAt);
			})();

			return { id: collectionId, name, ownerName };
		},

		getCollection(collectionId) {
			const row = database
				.prepare(
					`SELECT collections.id, collections.name, users.display_name AS owner_name
					 FROM collections
					 JOIN users ON users.id = collections.owner_id
					 WHERE collections.id = ?`
				)
				.get(collectionId) as { id: string; name: string; owner_name: string } | undefined;
			return row ? { id: row.id, name: row.name, ownerName: row.owner_name } : null;
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

		createSessionForCollection(collectionId, tokenHash) {
			const session = database
				.prepare('SELECT owner_id, tenant_id FROM collections WHERE id = ?')
				.get(collectionId) as { owner_id: string; tenant_id: string } | undefined;
			if (!session) {
				throw new Error('collection was not found');
			}
			database
				.prepare(
					`INSERT INTO sessions (id, user_id, tenant_id, token_hash, expires_at, created_at)
					 VALUES (?, ?, ?, ?, ?, ?)`
				)
				.run(
					randomUUID(),
					session.owner_id,
					session.tenant_id,
					tokenHash,
					new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
					new Date().toISOString()
				);
		},

		getSession(tokenHash) {
			const row = database
				.prepare(
					`SELECT user_id, tenant_id FROM sessions
					 WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`
				)
				.get(tokenHash, new Date().toISOString()) as
				| { user_id: string; tenant_id: string }
				| undefined;
			return row ? { userId: row.user_id, tenantId: row.tenant_id } : null;
		},

		listCollections() {
			return database
				.prepare(
					`SELECT collections.id, collections.name, users.display_name AS owner_name
					 FROM collections
					 JOIN users ON users.id = collections.owner_id
					 ORDER BY collections.created_at ASC, collections.id ASC`
				)
				.all()
				.map((row) => {
					const collection = row as { id: string; name: string; owner_name: string };
					return { id: collection.id, name: collection.name, ownerName: collection.owner_name };
				});
		},

		createItem(input) {
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

			database
				.prepare(
					`INSERT INTO items (
						id, collection_id, title, price_cents, category, condition, internal_notes, created_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.run(
					item.id,
					item.collectionId,
					item.title,
					item.priceCents,
					item.category,
					item.condition,
					item.internalNotes,
					new Date().toISOString()
				);

			return item;
		},

		listItemsForOwner(collectionId, scope) {
			return database
				.prepare(
					`SELECT items.id, items.collection_id, items.title, items.price_cents, items.category, items.condition, items.internal_notes
					 FROM items
					 JOIN collections ON collections.id = items.collection_id
					 WHERE items.collection_id = ? AND collections.owner_id = ? AND collections.tenant_id = ?
					 ORDER BY items.created_at DESC, items.id DESC`
				)
				.all(collectionId, scope.userId, scope.tenantId)
				.map((row) => mapItemRow(row as ItemRow));
		},

		listItems(collectionId) {
			return database
				.prepare(
					`SELECT id, collection_id, title, price_cents, category, condition, internal_notes
					 FROM items
					 WHERE collection_id = ?
					 ORDER BY created_at DESC, id DESC`
				)
				.all(collectionId)
				.map((row) => mapItemRow(row as ItemRow));
		}
	};
}

/**
 * Create the schema shared by all core collection repositories.
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
			display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
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
