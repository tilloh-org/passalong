import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { verifyPasswordSync } from './password';

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

export const saleChannels = [
	'flea-market',
	'online-marketplace',
	'shop',
	'private-sale',
	'other'
] as const;

export type ItemCategory = (typeof itemCategories)[number];
export type ItemCondition = (typeof itemConditions)[number];
export type SaleChannel = (typeof saleChannels)[number];

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
	externalDescription: string;
	isComplete: boolean;
	isFunctional: boolean;
	saleChannel: SaleChannel | null;
	soldAt: string | null;
	saleProceedsCents: number | null;
}

export interface MarkItemSoldInput {
	channel: SaleChannel;
	soldAt: string;
	proceedsCents: number;
}

export interface SaleChannelProceeds {
	channel: SaleChannel;
	soldItemCount: number;
	totalProceedsCents: number;
}

export interface SaleMonthProceeds {
	month: string;
	soldItemCount: number;
	totalProceedsCents: number;
}

export interface SaleStatistics {
	soldItemCount: number;
	totalProceedsCents: number;
	proceedsByChannel: SaleChannelProceeds[];
	proceedsByMonth: SaleMonthProceeds[];
}

export interface PublicStandItem {
	id: string;
	title: string;
	priceCents: number;
	category: ItemCategory;
	condition: ItemCondition;
	externalDescription: string;
}

export interface PublicStandView {
	collectionName: string;
	items: PublicStandItem[];
}

export interface CreateInitialAdminInput {
	username: string;
	displayName: string;
	passwordHash: string;
}

export interface BootstrapProvisionAccount {
	tenantName: string;
	username: string;
	displayName: string;
	password: string;
	passwordHash: string;
	instanceAdmin: boolean;
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
	externalDescription: string;
	isComplete: boolean;
	isFunctional: boolean;
}

export interface ItemImage {
	id: string;
	storageKey: string;
	position: number;
	isCover: boolean;
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
	passwordResetRequired?: true;
}

export interface BootstrapAccountDetails {
	username: string;
	displayName: string;
	passwordHash: string;
	tenantName: string;
	instanceAdmin: boolean;
}

export interface LoginRateLimitStatus {
	blocked: boolean;
	retryAfterSeconds: number;
}

export interface CollectionRepository {
	hasAdminAccount(): boolean;
	hasAccounts(): boolean;
	createInitialAdmin(input: CreateInitialAdminInput): AdminAccount;
	provisionBootstrapAccounts(accounts: BootstrapProvisionAccount[]): void;
	getBootstrapAccount(username: string): BootstrapAccountDetails | null;
	getUserForLogin(username: string): LoginAccount | null;
	createCollection(input: CreateCollectionInput, scope: SessionScope): Collection;
	getCollectionForOwner(collectionId: string, scope: SessionScope): Collection | null;
	getItemForOwner(itemId: string, scope: SessionScope): Item | null;
	listCollectionsForOwner(scope: SessionScope): Collection[];
	createSessionForUser(scope: SessionScope, tokenHash: string): void;
	getSession(tokenHash: string): SessionScope | null;
	isInstanceAdmin(scope: SessionScope): boolean;
	revokeSession(tokenHash: string): void;
	revokeSessionsForUser(scope: SessionScope): void;
	getLoginAttemptStatus(username: string, requestIp: string, now?: Date): LoginRateLimitStatus;
	recordLoginFailure(username: string, requestIp: string, now?: Date): LoginRateLimitStatus;
	clearLoginFailures(username: string, requestIp: string): void;
	createPasswordResetForUsername(username: string, secretHash: string, expiresAt: string): boolean;
	consumePasswordReset(username: string, secretHash: string, passwordHash: string): SessionScope | null;
	getPasswordHashForScope(scope: SessionScope): string | null;
	updatePassword(scope: SessionScope, passwordHash: string): void;
	createItem(input: CreateItemInput, scope: SessionScope): Item;
	listItemsForOwner(collectionId: string, scope: SessionScope): Item[];
	markItemSold(itemId: string, sale: MarkItemSoldInput, scope: SessionScope): Item;
	unmarkItemSold(itemId: string, scope: SessionScope): Item;
	getSaleStatistics(scope: SessionScope): SaleStatistics;
	getPublicStandView(collectionId: string): PublicStandView | null;
	addItemImage(itemId: string, storageKey: string, scope: SessionScope): ItemImage;
	setItemCover(itemId: string, imageId: string, scope: SessionScope): ItemImage;
	listItemImages(itemId: string, scope: SessionScope): ItemImage[];
	deleteItemImage(itemId: string, imageId: string, scope: SessionScope): void;
	findImageMetadataForTenant(storageKey: string, scope: SessionScope): ItemImage | null;
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
	external_description: string;
	is_complete: number;
	is_functional: number;
	sale_channel: SaleChannel | null;
	sold_at: string | null;
	sale_proceeds_cents: number | null;
}

interface ImageRow {
	id: string;
	storage_key: string;
	position: number;
	is_cover: number;
}

const tenantSchemaFoundationVersion = '2026082601_tenant_schema_foundation';
const authHardeningVersion = '2026083001_auth_hardening';
const itemScopedImageKeysVersion = '2026083101_item_scoped_image_keys';
const saleStatusVersion = '2026083102_item_sale_status';
const itemDetailFieldsVersion = '2026090101_item_detail_fields';
const requiredInstanceAdministratorCount = 1;
const singleDatabaseRowChange = 1;
const sqliteTrue = 1;
const initialFailureCount = 1;
const minimumRetryAfterSeconds = 1;
const loginAttemptLimit = 5;
const millisecondsPerSecond = 1000;
const secondsPerMinute = 60;
const minutesPerHour = 60;
const hoursPerDay = 24;
const loginAttemptWindowMinutes = 15;
const sessionLifetimeDays = 30;
const loginAttemptWindowMilliseconds = loginAttemptWindowMinutes * secondsPerMinute * millisecondsPerSecond;
const sessionLifetimeMilliseconds = sessionLifetimeDays * hoursPerDay * minutesPerHour * secondsPerMinute * millisecondsPerSecond;
const databaseBusyTimeoutMilliseconds = 5000;
const minimumRequestIpLength = 1;
const maximumRequestIpLength = 45;
const minimumUsernameLength = 3;
const maximumUsernameLength = 64;
const usernamePattern = new RegExp(`^[a-z0-9._+-]{${minimumUsernameLength},${maximumUsernameLength}}$`);
const requestIpPattern = new RegExp(`^[0-9a-fA-F:.]{${minimumRequestIpLength},${maximumRequestIpLength}}$`);
const categoryValues = itemCategories.map((category) => `'${category}'`).join(', ');
const conditionValues = itemConditions.map((condition) => `'${condition}'`).join(', ');
const saleChannelValues = saleChannels.map((channel) => `'${channel}'`).join(', ');

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
	database.pragma(`busy_timeout = ${databaseBusyTimeoutMilliseconds}`);
	initializeSchema(database);

	return {
		hasAdminAccount() {
			return Boolean(database.prepare('SELECT 1 FROM users LIMIT 1').get());
		},

		/**
		 * Determine whether the instance has at least one account globally.
		 *
		 * @returns {boolean} Whether any account exists.
		 */
		hasAccounts() {
			return Boolean(database.prepare('SELECT 1 FROM users LIMIT 1').get());
		},

		createInitialAdmin(input) {
			const username = normalizeUsername(input.username);
			const displayName = requireText(input.displayName, 'displayName');
			const passwordHash = requireText(input.passwordHash, 'passwordHash');
			const tenantId = randomUUID();
			const userId = randomUUID();
			const createdAt = new Date().toISOString();

			runImmediateTransaction(database, () => {
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
			});

			return { userId, tenantId, username, displayName };
		},

		/**
		 * Create bootstrap accounts once without changing existing records.
		 *
		 * Every immutable comparison and insert runs under the same immediate transaction,
		 * so a conflicting concurrent startup cannot apply a partial manifest.
		 *
		 * @param {BootstrapProvisionAccount[]} accounts - Validated bootstrap accounts.
		 * @returns {void}
		 * @throws {Error} When the manifest conflicts or would add another instance administrator.
		 */
		provisionBootstrapAccounts(accounts) {
			const normalizedAccounts = accounts.map((account) => ({
				tenantName: requireText(account.tenantName, 'tenantName'),
				username: normalizeUsername(account.username),
				displayName: requireText(account.displayName, 'displayName'),
				password: requirePassword(account.password),
				passwordHash: requireText(account.passwordHash, 'passwordHash'),
				instanceAdmin: account.instanceAdmin
			}));

			runImmediateTransaction(database, () => {
				const hasAccounts = Boolean(database.prepare('SELECT 1 FROM users LIMIT 1').get());
				const existingAdministratorCount = (
					database.prepare("SELECT COUNT(*) AS count FROM instance_roles WHERE role = 'instance_admin'").get() as {
						count: number;
					}
				).count;
				const accountsToCreate = normalizedAccounts.filter((account) => {
					const existingAccount = readBootstrapAccount(database, account.username);
					if (!existingAccount) {
						return true;
					}
					if (
						existingAccount.tenantName !== account.tenantName ||
						existingAccount.displayName !== account.displayName ||
						existingAccount.instanceAdmin !== account.instanceAdmin ||
						!verifyPasswordSync(account.password, existingAccount.passwordHash)
					) {
						throw new Error('Bootstrap configuration conflicts with an existing account.');
					}
					return false;
				});
				const newAdministratorCount = accountsToCreate.filter(({ instanceAdmin }) => instanceAdmin).length;

				if (
					!hasAccounts &&
					normalizedAccounts.length > 0 &&
					normalizedAccounts.filter(({ instanceAdmin }) => instanceAdmin).length !== requiredInstanceAdministratorCount
				) {
					throw new Error('bootstrap configuration requires exactly one instance administrator');
				}
				if (hasAccounts && newAdministratorCount > 0) {
					throw new Error('bootstrap configuration cannot create another instance administrator');
				}
				if (existingAdministratorCount > requiredInstanceAdministratorCount) {
					throw new Error('instance administrator role is not unique');
				}

				for (const account of accountsToCreate) {
					const tenantId = randomUUID();
					const userId = randomUUID();
					const createdAt = new Date().toISOString();
					database
						.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)')
						.run(tenantId, account.tenantName, createdAt);
					database
						.prepare(
							`INSERT INTO users (id, tenant_id, username, display_name, password_hash, created_at)
							 VALUES (?, ?, ?, ?, ?, ?)`
						)
						.run(userId, tenantId, account.username, account.displayName, account.passwordHash, createdAt);
					if (account.instanceAdmin) {
						database
							.prepare('INSERT INTO instance_roles (user_id, role, created_at) VALUES (?, ?, ?)')
							.run(userId, 'instance_admin', createdAt);
					}
				}
			});
		},

		/**
		 * Read the immutable bootstrap-relevant fields for an existing account.
		 *
		 * @param {string} username - Case-insensitive account username.
		 * @returns {BootstrapAccountDetails | null} Existing bootstrap account details, or null.
		 */
		getBootstrapAccount(username) {
			const row = database
				.prepare(
					`SELECT users.username, users.display_name, users.password_hash, tenants.name AS tenant_name,
					 EXISTS(SELECT 1 FROM instance_roles WHERE instance_roles.user_id = users.id AND instance_roles.role = 'instance_admin') AS instance_admin
					 FROM users
					 JOIN tenants ON tenants.id = users.tenant_id
					 WHERE users.username = ?`
				)
				.get(normalizeUsername(username)) as
				| {
						username: string;
						display_name: string;
						password_hash: string;
						tenant_name: string;
						instance_admin: number;
					  }
				| undefined;
			return row
				? {
						username: row.username,
						displayName: row.display_name,
						passwordHash: row.password_hash,
						tenantName: row.tenant_name,
						instanceAdmin: row.instance_admin === sqliteTrue
					}
				: null;
		},

		getUserForLogin(username) {
			const row = database
				.prepare(
					`SELECT id, tenant_id, username, display_name, password_hash, password_reset_required
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
						password_reset_required: number;
					  }
				| undefined;
			return row
				? {
						userId: row.id,
						tenantId: row.tenant_id,
						username: row.username,
						displayName: row.display_name,
						passwordHash: row.password_hash,
						...(row.password_reset_required === sqliteTrue ? { passwordResetRequired: true } : {})
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
			if (result.changes !== singleDatabaseRowChange) {
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

		getItemForOwner(itemId, scope) {
			const row = database
				.prepare(
					'SELECT * FROM items WHERE id = ? AND owner_id = ? AND tenant_id = ?'
				)
				.get(itemId, scope.userId, scope.tenantId) as ItemRow | undefined;
			return row ? mapItemRow(row) : null;
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
					new Date(Date.now() + sessionLifetimeMilliseconds).toISOString(),
					new Date().toISOString(),
					scope.userId,
					scope.tenantId
				);
			if (result.changes !== singleDatabaseRowChange) {
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

		/**
		 * Determine whether an authenticated scope holds the singleton instance-admin role.
		 *
		 * The tenant match makes the authorization check safe even if a caller constructs
		 * a scope with a valid user ID but an unrelated tenant ID.
		 *
		 * @param {SessionScope} scope - Authenticated user and tenant scope.
		 * @returns {boolean} Whether the scope is authorized for instance-wide operations.
		 */
		isInstanceAdmin(scope) {
			const row = database
				.prepare(
					`SELECT EXISTS(
						SELECT 1
						FROM instance_roles
						JOIN users ON users.id = instance_roles.user_id
						WHERE instance_roles.user_id = ?
						  AND users.tenant_id = ?
						  AND instance_roles.role = 'instance_admin'
					) AS is_instance_admin`
				)
				.get(scope.userId, scope.tenantId) as { is_instance_admin: number };
			return row.is_instance_admin === sqliteTrue;
		},

		revokeSession(tokenHash) {
			database
				.prepare('UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE token_hash = ?')
				.run(new Date().toISOString(), tokenHash);
		},

		revokeSessionsForUser(scope) {
			database
				.prepare('UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ? AND tenant_id = ?')
				.run(new Date().toISOString(), scope.userId, scope.tenantId);
		},

		getLoginAttemptStatus(username, requestIp, now = new Date()) {
			return getLoginAttemptStatus(database, username, requestIp, now);
		},

		recordLoginFailure(username, requestIp, now = new Date()) {
			const normalizedUsername = normalizeLoginAttemptUsername(username);
			const normalizedIp = normalizeRequestIp(requestIp);
			const nowMilliseconds = now.getTime();
			runImmediateTransaction(database, () => {
				const windowStartedAt = nowMilliseconds - loginAttemptWindowMilliseconds;
				database.prepare('DELETE FROM login_attempts WHERE window_started_at <= ?').run(windowStartedAt);
				for (const attempt of [
					{ scope: 'username', subject: normalizedUsername },
					{ scope: 'ip', subject: normalizedIp }
				]) {
					const existing = database
						.prepare('SELECT failure_count FROM login_attempts WHERE scope = ? AND subject = ?')
						.get(attempt.scope, attempt.subject) as { failure_count: number } | undefined;
					if (existing) {
						database
							.prepare('UPDATE login_attempts SET failure_count = ?, last_attempt_at = ? WHERE scope = ? AND subject = ?')
							.run(existing.failure_count + initialFailureCount, nowMilliseconds, attempt.scope, attempt.subject);
					} else {
						database
							.prepare('INSERT INTO login_attempts (scope, subject, failure_count, window_started_at, last_attempt_at) VALUES (?, ?, ?, ?, ?)')
							.run(attempt.scope, attempt.subject, initialFailureCount, nowMilliseconds, nowMilliseconds);
					}
				}
			});
			return getLoginAttemptStatus(database, normalizedUsername, normalizedIp, now);
		},

		clearLoginFailures(username, _requestIp) {
			database
				.prepare("DELETE FROM login_attempts WHERE scope = 'username' AND subject = ?")
				.run(normalizeLoginAttemptUsername(username));
		},

		createPasswordResetForUsername(username, secretHash, expiresAt) {
			const normalizedUsername = normalizeUsername(username);
			const validatedSecretHash = requireText(secretHash, 'secretHash');
			const validatedExpiry = requireText(expiresAt, 'expiresAt');
			return runImmediateTransaction(database, () => {
				const account = database
					.prepare('SELECT id, tenant_id FROM users WHERE username = ?')
					.get(normalizedUsername) as { id: string; tenant_id: string } | undefined;
				if (!account) {
					return false;
				}
				const now = new Date().toISOString();
				database.prepare('UPDATE password_resets SET consumed_at = ? WHERE user_id = ? AND tenant_id = ? AND consumed_at IS NULL').run(now, account.id, account.tenant_id);
				database.prepare('UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ? AND tenant_id = ?').run(now, account.id, account.tenant_id);
				database
					.prepare('INSERT INTO password_resets (id, user_id, tenant_id, secret_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
					.run(randomUUID(), account.id, account.tenant_id, validatedSecretHash, validatedExpiry, now);
				database.prepare('UPDATE users SET password_reset_required = 1 WHERE id = ? AND tenant_id = ?').run(account.id, account.tenant_id);
				return true;
			});
		},

		consumePasswordReset(username, secretHash, passwordHash) {
			const normalizedUsername = normalizeUsername(username);
			const validatedSecretHash = requireText(secretHash, 'secretHash');
			const validatedPasswordHash = requireText(passwordHash, 'passwordHash');
			return runImmediateTransaction(database, () => {
				const row = database
					.prepare(
						`SELECT users.id AS user_id, users.tenant_id
						 FROM users
						 JOIN password_resets ON password_resets.user_id = users.id AND password_resets.tenant_id = users.tenant_id
						 WHERE users.username = ? AND password_resets.secret_hash = ?
						 AND password_resets.consumed_at IS NULL AND password_resets.expires_at > ?`
					)
					.get(normalizedUsername, validatedSecretHash, new Date().toISOString()) as { user_id: string; tenant_id: string } | undefined;
				if (!row) {
					return null;
				}
				const scope = { userId: row.user_id, tenantId: row.tenant_id };
				const now = new Date().toISOString();
				database.prepare('UPDATE password_resets SET consumed_at = ? WHERE user_id = ? AND tenant_id = ? AND consumed_at IS NULL').run(now, scope.userId, scope.tenantId);
				database.prepare('UPDATE users SET password_hash = ?, password_reset_required = 0 WHERE id = ? AND tenant_id = ?').run(validatedPasswordHash, scope.userId, scope.tenantId);
				database.prepare('UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ? AND tenant_id = ?').run(now, scope.userId, scope.tenantId);
				return scope;
			});
		},

		getPasswordHashForScope(scope) {
			const row = database
				.prepare('SELECT password_hash FROM users WHERE id = ? AND tenant_id = ?')
				.get(scope.userId, scope.tenantId) as { password_hash: string } | undefined;
			return row?.password_hash ?? null;
		},

		updatePassword(scope, passwordHash) {
			const result = database
				.prepare('UPDATE users SET password_hash = ?, password_reset_required = 0 WHERE id = ? AND tenant_id = ?')
				.run(requireText(passwordHash, 'passwordHash'), scope.userId, scope.tenantId);
			if (result.changes !== singleDatabaseRowChange) {
				throw new Error('authenticated owner was not found');
			}
		},

		createItem(input, scope) {
			const title = requireText(input.title, 'title');
			const internalNotes = input.internalNotes.trim();
			const externalDescription = input.externalDescription.trim();
			validateItemInput(input);
			const item: Item = {
				id: randomUUID(),
				collectionId: input.collectionId,
				title,
				priceCents: input.priceCents,
				category: input.category,
				condition: input.condition,
				internalNotes,
				externalDescription,
				isComplete: input.isComplete,
				isFunctional: input.isFunctional,
				saleChannel: null,
				soldAt: null,
				saleProceedsCents: null
			};

			const result = database
				.prepare(
					`INSERT INTO items (
						id, tenant_id, owner_id, collection_id, title, price_cents, category, condition, internal_notes, external_description, is_complete, is_functional, created_at
					) SELECT ?, collections.tenant_id, collections.owner_id, collections.id, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
					item.externalDescription,
					item.isComplete ? 1 : 0,
					item.isFunctional ? 1 : 0,
					new Date().toISOString(),
					item.collectionId,
					scope.userId,
					scope.tenantId
				);
			if (result.changes !== singleDatabaseRowChange) {
				throw new Error('collection was not found');
			}
			return item;
		},

		markItemSold(itemId, sale, scope) {
			const channel = requireValidSaleChannel(sale.channel);
			const soldAt = requireIsoTimestamp(sale.soldAt);
			const proceedsCents = requireNonNegativeInteger(sale.proceedsCents, 'proceedsCents');
			return runImmediateTransaction(database, () => {
				const updated = database
					.prepare(
						'UPDATE items SET sale_channel = ?, sold_at = ?, sale_proceeds_cents = ? WHERE id = ? AND owner_id = ? AND tenant_id = ?'
					)
					.run(channel, soldAt, proceedsCents, itemId, scope.userId, scope.tenantId);
				if (updated.changes !== singleDatabaseRowChange) {
					throw new Error('item was not found');
				}
				return mapItemRow(
					database
						.prepare('SELECT * FROM items WHERE id = ? AND tenant_id = ?')
						.get(itemId, scope.tenantId) as ItemRow
				);
			});
		},

		unmarkItemSold(itemId, scope) {
			return runImmediateTransaction(database, () => {
				const updated = database
					.prepare(
						'UPDATE items SET sale_channel = NULL, sold_at = NULL, sale_proceeds_cents = NULL WHERE id = ? AND owner_id = ? AND tenant_id = ?'
					)
					.run(itemId, scope.userId, scope.tenantId);
				if (updated.changes !== singleDatabaseRowChange) {
					throw new Error('item was not found');
				}
				return mapItemRow(
					database
						.prepare('SELECT * FROM items WHERE id = ? AND tenant_id = ?')
						.get(itemId, scope.tenantId) as ItemRow
				);
			});
		},

		getSaleStatistics(scope) {
			const saleMonthExpression = "substr(sold_at, 1, 7)";
			const soldItemFilter = 'WHERE tenant_id = ? AND owner_id = ? AND sold_at IS NOT NULL';
			const totals = database
				.prepare(
					`SELECT COUNT(*) AS sold_item_count, COALESCE(SUM(sale_proceeds_cents), 0) AS total_proceeds_cents FROM items ${soldItemFilter}`
				)
				.get(scope.tenantId, scope.userId) as { sold_item_count: number; total_proceeds_cents: number };
			const proceedsByChannel = (
				database
					.prepare(
						`SELECT sale_channel AS channel, COUNT(*) AS sold_item_count, SUM(sale_proceeds_cents) AS total_proceeds_cents
						 FROM items ${soldItemFilter} GROUP BY sale_channel ORDER BY total_proceeds_cents DESC, channel ASC`
					)
					.all(scope.tenantId, scope.userId) as { channel: SaleChannel; sold_item_count: number; total_proceeds_cents: number }[]
			).map((row) => ({ channel: row.channel, soldItemCount: row.sold_item_count, totalProceedsCents: row.total_proceeds_cents }));
			const proceedsByMonth = (
				database
					.prepare(
						`SELECT ${saleMonthExpression} AS month, COUNT(*) AS sold_item_count, SUM(sale_proceeds_cents) AS total_proceeds_cents
						 FROM items ${soldItemFilter} GROUP BY ${saleMonthExpression} ORDER BY month ASC`
					)
					.all(scope.tenantId, scope.userId) as { month: string; sold_item_count: number; total_proceeds_cents: number }[]
			).map((row) => ({ month: row.month, soldItemCount: row.sold_item_count, totalProceedsCents: row.total_proceeds_cents }));
			return {
				soldItemCount: totals.sold_item_count,
				totalProceedsCents: totals.total_proceeds_cents,
				proceedsByChannel,
				proceedsByMonth
			};
		},

		getPublicStandView(collectionId) {
			const collection = database
				.prepare('SELECT name FROM collections WHERE id = ?')
				.get(collectionId) as { name: string } | undefined;
			if (!collection) {
				return null;
			}
			const items = (
				database
					.prepare(
						'SELECT id, title, price_cents, category, condition, external_description FROM items WHERE collection_id = ? AND sold_at IS NULL ORDER BY created_at DESC, id DESC'
						)
						.all(collectionId) as { id: string; title: string; price_cents: number; category: ItemCategory; condition: ItemCondition; external_description: string }[]
						).map((row) => ({
						id: row.id,
						title: row.title,
						priceCents: row.price_cents,
						category: row.category,
						condition: row.condition,
						externalDescription: row.external_description
						}));
			return { collectionName: collection.name, items };
		},

		listItemsForOwner(collectionId, scope) {
			return database
				.prepare(
					`SELECT items.id, items.collection_id, items.title, items.price_cents, items.category, items.condition, items.internal_notes, items.external_description, items.is_complete, items.is_functional, items.sale_channel, items.sold_at, items.sale_proceeds_cents
					 FROM items
					 JOIN collections ON collections.id = items.collection_id AND collections.tenant_id = items.tenant_id
					 JOIN users ON users.id = collections.owner_id AND users.tenant_id = collections.tenant_id
					 WHERE items.collection_id = ? AND items.owner_id = ? AND items.tenant_id = ?
					 ORDER BY items.created_at DESC, items.id DESC`
				)
				.all(collectionId, scope.userId, scope.tenantId)
				.map((row) => mapItemRow(row as ItemRow));
			},

		addItemImage(itemId, storageKey, scope) {
			const validatedStorageKey = requireText(storageKey, 'storageKey');
			return runImmediateTransaction(database, () => {
				const item = requireOwnedItem(database, itemId, scope);
				const existingImage = database
					.prepare('SELECT id, storage_key, position, is_cover FROM item_images WHERE item_id = ? AND tenant_id = ? AND storage_key = ?')
					.get(item.id, scope.tenantId, validatedStorageKey) as ImageRow | undefined;
				if (existingImage) {
					return mapImageRow(existingImage);
				}
				const nextPosition = (
					database
						.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM item_images WHERE item_id = ? AND tenant_id = ?')
						.get(item.id, scope.tenantId) as { next_position: number }
				).next_position;
				const imageCount = (
					database
						.prepare('SELECT COUNT(*) AS count FROM item_images WHERE item_id = ? AND tenant_id = ?')
						.get(item.id, scope.tenantId) as { count: number }
				).count;
				const isCover = imageCount === 0;
				const imageId = randomUUID();
				database
					.prepare(
						'INSERT INTO item_images (id, tenant_id, item_id, storage_key, position, is_cover, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
					)
					.run(imageId, scope.tenantId, item.id, validatedStorageKey, nextPosition, isCover ? sqliteTrue : 0, new Date().toISOString());
				return { id: imageId, storageKey: validatedStorageKey, position: nextPosition, isCover };
			});
		},

		setItemCover(itemId, imageId, scope) {
			return runImmediateTransaction(database, () => {
				requireOwnedItem(database, itemId, scope);
				const updated = database
					.prepare('UPDATE item_images SET is_cover = ? WHERE id = ? AND item_id = ? AND tenant_id = ?')
					.run(sqliteTrue, requireText(imageId, 'imageId'), itemId, scope.tenantId);
				if (updated.changes !== singleDatabaseRowChange) {
					throw new Error('image was not found');
				}
				database
					.prepare('UPDATE item_images SET is_cover = 0 WHERE item_id = ? AND tenant_id = ? AND id != ?')
					.run(itemId, scope.tenantId, imageId);
				return mapImageRow(
					database
						.prepare('SELECT id, storage_key, position, is_cover FROM item_images WHERE id = ? AND tenant_id = ?')
						.get(imageId, scope.tenantId) as ImageRow
				);
			});
		},

		listItemImages(itemId, scope) {
			if (!itemIsOwnedBy(database, itemId, scope)) {
				return [];
			}
			return (
				database
					.prepare('SELECT id, storage_key, position, is_cover FROM item_images WHERE item_id = ? AND tenant_id = ? ORDER BY position ASC, id ASC')
					.all(itemId, scope.tenantId) as ImageRow[]
			).map(mapImageRow);
		},

		deleteItemImage(itemId, imageId, scope) {
			runImmediateTransaction(database, () => {
				requireOwnedItem(database, itemId, scope);
				const deletedImage = database
					.prepare('SELECT id, is_cover FROM item_images WHERE id = ? AND item_id = ? AND tenant_id = ?')
					.get(requireText(imageId, 'imageId'), itemId, scope.tenantId) as { id: string; is_cover: number } | undefined;
				if (!deletedImage) {
					throw new Error('image was not found');
				}
				database.prepare('DELETE FROM item_images WHERE id = ? AND item_id = ? AND tenant_id = ?').run(deletedImage.id, itemId, scope.tenantId);
				const remainingImages = database
					.prepare('SELECT id, storage_key, position, is_cover FROM item_images WHERE item_id = ? AND tenant_id = ? ORDER BY position ASC, id ASC')
					.all(itemId, scope.tenantId) as ImageRow[];
				renormalizeImagePositions(remainingImages, database, scope.tenantId);
				const wasCover = deletedImage.is_cover === sqliteTrue;
				if (wasCover && remainingImages.length > 0) {
					database
						.prepare('UPDATE item_images SET is_cover = ? WHERE id = ? AND item_id = ? AND tenant_id = ?')
						.run(sqliteTrue, remainingImages[0].id, itemId, scope.tenantId);
				}
			});
		},

		findImageMetadataForTenant(storageKey, scope) {
			const validatedStorageKey = requireText(storageKey, 'storageKey');
			const row = database
				.prepare(
					`SELECT item_images.id, item_images.storage_key, item_images.position, item_images.is_cover
					 FROM item_images
					 JOIN items ON items.id = item_images.item_id AND items.tenant_id = item_images.tenant_id
					 JOIN collections ON collections.id = items.collection_id AND collections.tenant_id = items.tenant_id
					 WHERE item_images.storage_key = ? AND item_images.tenant_id = ? AND collections.owner_id = ?`
				)
				.get(validatedStorageKey, scope.tenantId, scope.userId) as ImageRow | undefined;
			return row ? mapImageRow(row) : null;
		}
	};
}

/**
 * Read immutable bootstrap attributes for one normalized username.
 *
 * @param {Database.Database} database - The SQLite connection.
 * @param {string} username - Normalized account username.
 * @returns {BootstrapAccountDetails | null} Existing account details or null.
 */
function readBootstrapAccount(database: Database.Database, username: string): BootstrapAccountDetails | null {
	const row = database
		.prepare(
			`SELECT users.username, users.display_name, users.password_hash, tenants.name AS tenant_name,
			 EXISTS(SELECT 1 FROM instance_roles WHERE instance_roles.user_id = users.id AND instance_roles.role = 'instance_admin') AS instance_admin
			 FROM users
			 JOIN tenants ON tenants.id = users.tenant_id
			 WHERE users.username = ?`
		)
		.get(username) as
		| {
				username: string;
				display_name: string;
				password_hash: string;
				tenant_name: string;
				instance_admin: number;
			  }
		| undefined;
	return row
		? {
				username: row.username,
				displayName: row.display_name,
				passwordHash: row.password_hash,
				tenantName: row.tenant_name,
				instanceAdmin: row.instance_admin === sqliteTrue
			}
		: null;
}

/**
 * Require a non-empty password without trimming its secret bytes.
 *
 * @param {string} value - Plaintext password supplied only for bootstrap verification.
 * @returns {string} The unchanged password value.
 * @throws {Error} If the password is empty.
 */
function requirePassword(value: string): string {
	if (value.length === 0) {
		throw new Error('password must not be empty');
	}
	return value;
}

/**
 * Execute a SQLite transaction that serializes writers before checking account state.
 *
 * @template T
 * @param {Database.Database} database - SQLite connection to lock.
 * @param {() => T} operation - Transactional operation.
 * @returns {T} The operation result.
 * @throws {unknown} When the operation fails after rolling back its writes.
 */
function runImmediateTransaction<T>(database: Database.Database, operation: () => T): T {
	database.exec('BEGIN IMMEDIATE');
	try {
		const result = operation();
		database.exec('COMMIT');
		return result;
	} catch (error) {
		database.exec('ROLLBACK');
		throw error;
	}
}

/**
 * Require that an item exists and belongs to the authenticated owner and tenant.
 *
 * @param {Database.Database} database - The SQLite connection.
 * @param {string} itemId - Identifier of the targeted item.
 * @param {SessionScope} scope - Authenticated user and tenant scope.
 * @returns {{ id: string }} The owned item row.
 * @throws {Error} If no item is visible to the authenticated owner.
 */
function requireOwnedItem(database: Database.Database, itemId: string, scope: SessionScope): { id: string } {
	const row = database
		.prepare('SELECT id FROM items WHERE id = ? AND owner_id = ? AND tenant_id = ?')
		.get(itemId, scope.userId, scope.tenantId) as { id: string } | undefined;
	if (!row) {
		throw new Error('item was not found');
	}
	return row;
}

/**
 * Check tenant-scoped visibility of an item without throwing.
 *
 * @param {Database.Database} database - The SQLite connection.
 * @param {string} itemId - The target item identifier.
 * @param {SessionScope} scope - Authenticated user and tenant scope.
 * @returns {boolean} Whether the item belongs to the authenticated owner and tenant.
 */
function itemIsOwnedBy(database: Database.Database, itemId: string, scope: SessionScope): boolean {
	return (
		database
			.prepare('SELECT 1 FROM items WHERE id = ? AND owner_id = ? AND tenant_id = ?')
			.get(itemId, scope.userId, scope.tenantId) !== undefined
	);
}

/**
 * Map a persisted image row to its public shape.
 *
 * @param {ImageRow} row - Raw image row from SQLite.
 * @returns {ItemImage} The tenant-agnostic image value.
 */
function mapImageRow(row: ImageRow): ItemImage {
	return {
		id: row.id,
		storageKey: row.storage_key,
		position: row.position,
		isCover: row.is_cover === sqliteTrue
	};
}

/**
 * Rewrite image position numbers so they stay gap-free after a deletion.
 *
 * @param {ImageRow[]} orderedImages - Remaining images sorted by current position.
 * @param {Database.Database} database - The SQLite connection to update.
 * @returns {void}
 */
function renormalizeImagePositions(orderedImages: ImageRow[], database: Database.Database, tenantId: string): void {
	const renumberStatement = database.prepare('UPDATE item_images SET position = ? WHERE id = ? AND tenant_id = ?');
	orderedImages.forEach((image, index) => {
		renumberStatement.run(index, image.id, tenantId);
	});
}

/**
 * Initialize an empty database or atomically migrate an existing one.
 *
 * @param {Database.Database} database - The SQLite connection to initialize.
 * @returns {void}
 */
function initializeSchema(database: Database.Database): void {
	if (isEmptyDatabase(database)) {
		database.transaction(() => {
			createSchema(database);
			assertForeignKeys(database);
			createIndexes(database);
			const appliedAt = new Date().toISOString();
			database
				.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?), (?, ?), (?, ?), (?, ?), (?, ?)')
				.run(tenantSchemaFoundationVersion, appliedAt, authHardeningVersion, appliedAt, itemScopedImageKeysVersion, appliedAt, saleStatusVersion, appliedAt, itemDetailFieldsVersion, appliedAt);
		})();
		return;
	}

	migrateSchema(database);
}

/**
 * Determine whether a SQLite database has no application tables.
 *
 * @param {Database.Database} database - The SQLite connection to inspect.
 * @returns {boolean} Whether the database contains no application tables.
 */
function isEmptyDatabase(database: Database.Database): boolean {
	return !database
		.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1")
		.get();
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
			password_reset_required INTEGER NOT NULL DEFAULT 0 CHECK (password_reset_required IN (0, 1)),
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
		CREATE TABLE IF NOT EXISTS password_resets (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			secret_hash TEXT NOT NULL UNIQUE,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL,
			consumed_at TEXT,
			FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE CASCADE
		);
		CREATE TABLE IF NOT EXISTS login_attempts (
			scope TEXT NOT NULL CHECK (scope IN ('username', 'ip')),
			subject TEXT NOT NULL,
			failure_count INTEGER NOT NULL CHECK (failure_count > 0),
			window_started_at INTEGER NOT NULL,
			last_attempt_at INTEGER NOT NULL,
			PRIMARY KEY (scope, subject)
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
			external_description TEXT NOT NULL DEFAULT '',
			is_complete INTEGER NOT NULL DEFAULT 0 CHECK (is_complete IN (0, 1)),
			is_functional INTEGER NOT NULL DEFAULT 0 CHECK (is_functional IN (0, 1)),
			sale_channel TEXT CHECK (sale_channel IS NULL OR sale_channel IN (${saleChannelValues})),
			sold_at TEXT,
			sale_proceeds_cents INTEGER CHECK (sale_proceeds_cents IS NULL OR sale_proceeds_cents >= 0),
			created_at TEXT NOT NULL,
			UNIQUE (id, tenant_id),
			FOREIGN KEY (owner_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE RESTRICT,
			FOREIGN KEY (collection_id, tenant_id) REFERENCES collections(id, tenant_id) ON DELETE CASCADE
		);
		CREATE TABLE IF NOT EXISTS item_images (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			item_id TEXT NOT NULL,
			storage_key TEXT NOT NULL,
			position INTEGER NOT NULL CHECK (position >= 0),
			is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
			created_at TEXT NOT NULL,
			UNIQUE (item_id, tenant_id, position),
			UNIQUE (item_id, tenant_id, storage_key),
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
		CREATE UNIQUE INDEX IF NOT EXISTS instance_roles_single_instance_admin_idx ON instance_roles(role) WHERE role = 'instance_admin';
		CREATE INDEX IF NOT EXISTS sessions_tenant_user_idx ON sessions(tenant_id, user_id);
		CREATE INDEX IF NOT EXISTS sessions_token_active_idx ON sessions(token_hash, expires_at) WHERE revoked_at IS NULL;
		CREATE INDEX IF NOT EXISTS password_resets_active_user_idx ON password_resets(user_id, tenant_id, expires_at) WHERE consumed_at IS NULL;
		CREATE INDEX IF NOT EXISTS login_attempts_window_idx ON login_attempts(window_started_at);
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
	if (!hasMigrationVersion(database, tenantSchemaFoundationVersion)) {
		database.pragma('foreign_keys = OFF');
		try {
			database.transaction(() => {
				createSchema(database);
				const legacyAdminUserIds = hasColumn(database, 'users', 'is_admin')
					? (database.prepare('SELECT id FROM users WHERE is_admin = 1').all() as { id: string }[]).map(
							({ id }) => id
						)
					: [];
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
				assertForeignKeys(database);
				createIndexes(database);
				database
					.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
					.run(tenantSchemaFoundationVersion, new Date().toISOString());
			})();
		} finally {
			database.pragma('foreign_keys = ON');
		}
	}

	migrateAuthHardeningSchema(database);
	migrateTenantScopedImageKeys(database);
	migrateSaleStatus(database);
	migrateItemDetailFields(database);
}

/**
 * Add buyer-facing description and completeness/functionality flags to items
 * on databases that predate the detail-page fields.
 *
 * @param {Database.Database} database - The SQLite connection to migrate.
 * @returns {void}
 */
function migrateItemDetailFields(database: Database.Database): void {
	if (hasMigrationVersion(database, itemDetailFieldsVersion)) {
		return;
	}

	database.transaction(() => {
		if (!hasColumn(database, 'items', 'external_description')) {
			database.exec("ALTER TABLE items ADD COLUMN external_description TEXT NOT NULL DEFAULT ''");
		}
		if (!hasColumn(database, 'items', 'is_complete')) {
			database.exec('ALTER TABLE items ADD COLUMN is_complete INTEGER NOT NULL DEFAULT 0 CHECK (is_complete IN (0, 1))');
		}
		if (!hasColumn(database, 'items', 'is_functional')) {
			database.exec('ALTER TABLE items ADD COLUMN is_functional INTEGER NOT NULL DEFAULT 0 CHECK (is_functional IN (0, 1))');
		}
		database
			.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
			.run(itemDetailFieldsVersion, new Date().toISOString());
	});
}

/**
 * Add sale-tracking fields to items on databases that predate sale support.
 *
 * @param {Database.Database} database - The SQLite connection to migrate.
 * @returns {void}
 */
function migrateSaleStatus(database: Database.Database): void {
	if (hasMigrationVersion(database, saleStatusVersion)) {
		return;
	}

	database.transaction(() => {
		if (!hasColumn(database, 'items', 'sale_channel')) {
			database.exec('ALTER TABLE items ADD COLUMN sale_channel TEXT CHECK (sale_channel IS NULL OR sale_channel IN (' + saleChannelValues + '))');
		}
		if (!hasColumn(database, 'items', 'sold_at')) {
			database.exec('ALTER TABLE items ADD COLUMN sold_at TEXT');
		}
		if (!hasColumn(database, 'items', 'sale_proceeds_cents')) {
			database.exec('ALTER TABLE items ADD COLUMN sale_proceeds_cents INTEGER CHECK (sale_proceeds_cents IS NULL OR sale_proceeds_cents >= 0)');
		}
		database
			.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
			.run(saleStatusVersion, new Date().toISOString());
	});
}

/**
 * Scope item-image storage keys per item so one item cannot attach the same
 * file twice, while different items and tenants may reference identical content.
 *
 * Existing databases with the global `UNIQUE(storage_key)` column constraint are
 * rebuilt onto the tenant-scoped composite constraint while preserving every row.
 *
 * @param {Database.Database} database - The SQLite connection to migrate.
 * @returns {void}
 */
function migrateTenantScopedImageKeys(database: Database.Database): void {
	if (hasMigrationVersion(database, itemScopedImageKeysVersion)) {
		return;
	}

	database.pragma('foreign_keys = OFF');
	try {
		database.transaction(() => {
			const hasGlobalStorageKeyUnique = (database.prepare('PRAGMA index_list(item_images)').all() as {
				name: string;
				unique: number;
				origin: string;
			}[]).some(
				(index) =>
					index.unique === sqliteTrue &&
					index.origin === 'u' &&
					getIndexColumns(database, index.name).length === 1 &&
					getIndexColumns(database, index.name)[0] === 'storage_key'
			);
			if (hasGlobalStorageKeyUnique) {
				database.pragma('foreign_keys = OFF');
				database.transaction(() => {
					rebuildItemImagesForTenantScopedKeys(database);
					assertCopiedRowCount(database, 'item_images', 'item_images_next');
					database.exec('DROP TABLE item_images; ALTER TABLE item_images_next RENAME TO item_images;');
				})();
			}
			assertForeignKeys(database);
			createIndexes(database);
			database
				.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
				.run(itemScopedImageKeysVersion, new Date().toISOString());
		})();
	} finally {
		database.pragma('foreign_keys = ON');
	}
}

/**
 * Copy every image row into the tenant-scoped-key replacement table.
 *
 * @param {Database.Database} database - The SQLite connection to migrate.
 * @returns {void}
 */
function rebuildItemImagesForTenantScopedKeys(database: Database.Database): void {
	database.exec(`
		CREATE TABLE item_images_next (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			item_id TEXT NOT NULL,
			storage_key TEXT NOT NULL,
			position INTEGER NOT NULL CHECK (position >= 0),
			is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
			created_at TEXT NOT NULL,
			UNIQUE (item_id, tenant_id, position),
			UNIQUE (item_id, tenant_id, storage_key),
			FOREIGN KEY (item_id, tenant_id) REFERENCES items(id, tenant_id) ON DELETE CASCADE
		);
		INSERT INTO item_images_next (id, tenant_id, item_id, storage_key, position, is_cover, created_at)
		SELECT id, tenant_id, item_id, storage_key, position, is_cover, created_at
		FROM item_images;
	`);
}

/**
 * Read the indexed columns of a trusted SQLite index.
 *
 * @param {Database.Database} database - The SQLite connection.
 * @param {string} indexName - Trusted index name from `PRAGMA index_list`.
 * @returns {string[]} Ordered column names of the index.
 */
function getIndexColumns(database: Database.Database, indexName: string): string[] {
	return (database.prepare(`PRAGMA index_info(${indexName})`).all() as { name: string }[]).map(
		({ name }) => name
	);
}

/**
 * Add durable authentication-hardening fields to databases that already use the tenant schema.
 *
 * @param {Database.Database} database - The SQLite connection to migrate.
 * @returns {void}
 */
function migrateAuthHardeningSchema(database: Database.Database): void {
	if (hasMigrationVersion(database, authHardeningVersion)) {
		database.transaction(() => {
			createIndexes(database);
		})();
		return;
	}

	database.transaction(() => {
		if (!hasColumn(database, 'users', 'password_reset_required')) {
			database.exec('ALTER TABLE users ADD COLUMN password_reset_required INTEGER NOT NULL DEFAULT 0 CHECK (password_reset_required IN (0, 1))');
		}
		database.exec(`
			CREATE TABLE IF NOT EXISTS password_resets (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				tenant_id TEXT NOT NULL,
				secret_hash TEXT NOT NULL UNIQUE,
				expires_at TEXT NOT NULL,
				created_at TEXT NOT NULL,
				consumed_at TEXT,
				FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE CASCADE
			);
			CREATE TABLE IF NOT EXISTS login_attempts (
				scope TEXT NOT NULL CHECK (scope IN ('username', 'ip')),
				subject TEXT NOT NULL,
				failure_count INTEGER NOT NULL CHECK (failure_count > 0),
				window_started_at INTEGER NOT NULL,
				last_attempt_at INTEGER NOT NULL,
				PRIMARY KEY (scope, subject)
			);
		`);
		createIndexes(database);
		database
			.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
			.run(authHardeningVersion, new Date().toISOString());
	});
}

/**
 * Determine whether a migration version has already been applied.
 *
 * @param {Database.Database} database - The SQLite connection to inspect.
 * @param {string} version - Migration version to find.
 * @returns {boolean} Whether the version has been recorded.
 */
function hasMigrationVersion(database: Database.Database, version: string): boolean {
	return hasTable(database, 'schema_migrations') && Boolean(database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version));
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
			password_reset_required INTEGER NOT NULL DEFAULT 0 CHECK (password_reset_required IN (0, 1)),
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
			external_description TEXT NOT NULL DEFAULT '',
			is_complete INTEGER NOT NULL DEFAULT 0 CHECK (is_complete IN (0, 1)),
			is_functional INTEGER NOT NULL DEFAULT 0 CHECK (is_functional IN (0, 1)),
			sale_channel TEXT CHECK (sale_channel IS NULL OR sale_channel IN (${saleChannelValues})),
			sold_at TEXT,
			sale_proceeds_cents INTEGER CHECK (sale_proceeds_cents IS NULL OR sale_proceeds_cents >= 0),
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
			storage_key TEXT NOT NULL,
			position INTEGER NOT NULL CHECK (position >= 0),
			is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
			created_at TEXT NOT NULL,
			UNIQUE (item_id, tenant_id, position),
			UNIQUE (item_id, tenant_id, storage_key),
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
 * Determine whether a trusted SQLite table exists.
 *
 * @param {Database.Database} database - The SQLite connection to inspect.
 * @param {string} tableName - Trusted internal table name.
 * @returns {boolean} Whether the table exists.
 */
function hasTable(database: Database.Database, tableName: string): boolean {
	return Boolean(
		database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)
	);
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
		internalNotes: row.internal_notes,
		externalDescription: row.external_description,
		isComplete: row.is_complete === 1,
		isFunctional: row.is_functional === 1,
		saleChannel: row.sale_channel,
		soldAt: row.sold_at,
		saleProceedsCents: row.sale_proceeds_cents
	};
}

const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/**
 * Validate the submitted sale channel against the supported allowlist.
 *
 * @param {SaleChannel} channel - Channel claimed by the caller.
 * @returns {SaleChannel} The validated channel.
 * @throws {Error} If the channel is not supported.
 */
function requireValidSaleChannel(channel: SaleChannel): SaleChannel {
	if (!(saleChannels as readonly string[]).includes(channel)) {
		throw new Error('channel is not a supported sale channel');
	}
	return channel;
}

/**
 * Require a canonical ISO-8601 UTC timestamp string.
 *
 * @param {string} value - Timestamp supplied by the caller.
 * @returns {string} The validated timestamp.
 * @throws {Error} If the timestamp is not canonical UTC ISO format.
 */
function requireIsoTimestamp(value: string): string {
	if (!isoTimestampPattern.test(value) || Number.isNaN(Date.parse(value))) {
		throw new Error('soldAt must be a canonical UTC ISO timestamp');
	}
	return value;
}

/**
 * Require a safe non-negative integer amount.
 *
 * @param {number} value - Amount supplied by the caller.
 * @param {string} fieldName - Field name used in validation errors.
 * @returns {number} The validated amount.
 * @throws {Error} If the amount is not a safe non-negative integer.
 */
function requireNonNegativeInteger(value: number, fieldName: string): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${fieldName} must be a non-negative integer`);
	}
	return value;
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
 * Read the current bounded login-attempt state after pruning expired windows.
 *
 * @param {Database.Database} database - The SQLite connection.
 * @param {string} username - Submitted account username.
 * @param {string} requestIp - Client network address.
 * @param {Date} now - Current time used for the bounded window.
 * @returns {LoginRateLimitStatus} Whether login is blocked and its retry delay.
 */
function getLoginAttemptStatus(database: Database.Database, username: string, requestIp: string, now: Date): LoginRateLimitStatus {
	const normalizedUsername = normalizeLoginAttemptUsername(username);
	const normalizedIp = normalizeRequestIp(requestIp);
	const nowMilliseconds = now.getTime();
	const windowStartedAt = nowMilliseconds - loginAttemptWindowMilliseconds;
	database.prepare('DELETE FROM login_attempts WHERE window_started_at <= ?').run(windowStartedAt);
	const attempts = database
		.prepare(
			"SELECT failure_count, window_started_at FROM login_attempts WHERE (scope = 'username' AND subject = ?) OR (scope = 'ip' AND subject = ?)"
		)
		.all(normalizedUsername, normalizedIp) as { failure_count: number; window_started_at: number }[];
	const blockingAttempt = attempts.find(({ failure_count }) => failure_count >= loginAttemptLimit);
	if (!blockingAttempt) {
		return { blocked: false, retryAfterSeconds: 0 };
	}
	return {
		blocked: true,
		retryAfterSeconds: Math.max(
			minimumRetryAfterSeconds,
			Math.ceil((blockingAttempt.window_started_at + loginAttemptWindowMilliseconds - nowMilliseconds) / millisecondsPerSecond)
		)
	};
}

/**
 * Normalize a direct client address to a bounded SQLite key.
 *
 * @param {string} value - Client address provided by the server adapter.
 * @returns {string} A validated address key.
 * @throws {Error} If the address cannot be represented safely.
 */
function normalizeRequestIp(value: string): string {
	const normalized = value.trim();
	if (!requestIpPattern.test(normalized)) {
		throw new Error('request IP is invalid');
	}
	return normalized.toLowerCase();
}

/**
 * Normalize a login attempt key without allowing malformed usernames to bypass IP throttling.
 *
 * @param {string} value - The untrusted submitted username.
 * @returns {string} A valid username or a stable invalid-attempt bucket.
 */
function normalizeLoginAttemptUsername(value: string): string {
	try {
		return normalizeUsername(value);
	} catch {
		return 'invalid-login-attempt';
	}
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
	if (!usernamePattern.test(normalized)) {
		throw new Error(
			`username must contain ${minimumUsernameLength} to ${maximumUsernameLength} lowercase letters, numbers, periods, underscores, plus signs, or hyphens`
		);
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
