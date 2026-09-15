import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { hasValidEndOfCentralDirectory, parseZip } from '$lib/server/backup';
import { assertArchiveWithinLimits } from '$lib/server/archive-safety';
import { classifyImportedPasswordHash, hashPassword, validatePassword } from '$lib/server/password';
import {
	CHECKSUM_ALGORITHM,
	DATA_ENTRY_NAME,
	MANIFEST_ENTRY_NAME,
	parseExchangeManifest,
	type ExchangeCollection,
	type ExchangeCounts,
	type ExchangeData,
	type ExchangeExpense,
	type ExchangeItem,
	type ExchangeMarketDay,
	type ExchangeUser
} from '$lib/server/exchange-format';
import {
	expenseCategories,
	itemCategories,
	itemConditions,
	normalizeUsernameResult,
	saleChannels
} from '$lib/server/collection-repository';

/** One user entry in the validation report. */
export interface ImportReportUser {
	sourceId: string;
	username: string;
	displayName: string;
	passwordResetRequired: boolean;
	collections: number;
	items: number;
	marketDays: number;
	expenses: number;
	sales: number;
	images: number;
}

/** A stand page that activation will publish. */
export interface ImportReportStandPage {
	username: string;
	collectionName: string;
}

/** Media totals in the validation report. */
export interface ImportReportMedia {
	files: number;
	bytes: number;
	checksumsMatch: boolean;
}

/** Entity counts in the validation report. */
export type ImportReportCounts = ExchangeCounts;

/**
 * Complete validation report for an instance archive.
 *
 * Deliberately carries **no** logical archive content: the report is rendered in the browser, so it
 * must never transport stored password hashes or the full user data. Activation re-reads the archive.
 */
export interface InstanceImportReport {
	errors: string[];
	warnings: string[];
	counts: ImportReportCounts;
	media: ImportReportMedia;
	users: ImportReportUser[];
	publicStandPages: ImportReportStandPage[];
}

/** Inputs for an instance import. */
export interface ImportInstanceOptions {
	archive: Buffer;
	databasePath: string;
	mediaRoot: string;
	instanceAdminUsername: string;
	adminPassword: string;
	validatePassword?: (password: string) => void;
}

/** Result of an instance import. */
export type ImportInstanceOutcome =
	| { imported: true; report: InstanceImportReport }
	| { imported: false; report: InstanceImportReport };

/**
 * Validate an instance exchange archive and build a complete report.
 *
 * Nothing is written and no live data is touched: this is the dry run that precedes activation.
 * Errors block activation; warnings never do.
 *
 * @param {Buffer} archive - Archive bytes.
 * @returns {InstanceImportReport} Validation report.
 */
export function validateInstanceArchive(archive: Buffer): InstanceImportReport {
	const report: InstanceImportReport = {
		errors: [],
		warnings: [],
		counts: zeroCounts(),
		media: { files: 0, bytes: 0, checksumsMatch: false },
		users: [],
		publicStandPages: []
	};

	if (!hasValidEndOfCentralDirectory(archive)) {
		report.errors.push('The archive is not a valid backup container.');
		return report;
	}
	let entries: Map<string, { name: string; payloadOffset: number; size: number }>;
	try {
		entries = parseZip(archive);
	} catch (error) {
		// A malformed or unsupported container must read as an invalid archive, never as a crash.
		// The parser only throws safe, structural messages.
		report.errors.push(
			error instanceof Error && error.message.includes('compression method')
				? 'The archive contains entries this format does not allow: every entry has to be stored uncompressed.'
				: 'The archive is not a valid backup container.'
		);
		return report;
	}
	const safety = assertArchiveWithinLimits(
		[...entries.values()].map((entry) => ({
			name: entry.name,
			size: entry.size,
			compressedSize: entry.size
		})),
		{ archiveBytes: archive.length }
	);
	if (!safety.ok) {
		report.errors.push(safety.reason);
		return report;
	}

	const manifestEntry = entries.get(MANIFEST_ENTRY_NAME);
	if (!manifestEntry) {
		report.errors.push('The archive does not contain a manifest.');
		return report;
	}
	const manifestResult = parseExchangeManifest(readEntry(archive, manifestEntry));
	if (!manifestResult.ok) {
		report.errors.push(manifestResult.reason);
		return report;
	}
	const manifest = manifestResult.manifest;

	const dataEntry = entries.get(DATA_ENTRY_NAME);
	if (!dataEntry) {
		report.errors.push('The archive does not contain its logical data file.');
		return report;
	}
	let parsedData: unknown;
	try {
		parsedData = JSON.parse(readEntry(archive, dataEntry));
	} catch {
		report.errors.push('The logical data file is not valid JSON.');
		return report;
	}
	if (!isRecord(parsedData) || !Array.isArray(parsedData.users)) {
		report.errors.push('The logical data file does not contain a user list.');
		return report;
	}
	const data: ExchangeData = { users: parsedData.users as ExchangeUser[] };

	report.media.checksumsMatch = verifyChecksums(archive, entries, manifest.files, report);
	report.media.files = Object.keys(manifest.files).filter((name) =>
		name.startsWith('media/')
	).length;
	report.media.bytes = Object.entries(manifest.files)
		.filter(([name]) => name.startsWith('media/'))
		.reduce((total, [, meta]) => total + meta.bytes, 0);

	validateUsers(data.users, entries, report);
	validateManifestCounts(
		manifest.counts,
		report,
		data.users,
		manifest.files,
		manifest.media,
		collectReferencedMedia(data.users)
	);
	return report;
}

/**
 * Import a complete instance archive into the live database in one transaction.
 *
 * The whole activation runs inside a single SQLite transaction: validation must pass first, the
 * selected admin receives a freshly set password (never the imported foreign hash), every source
 * user becomes its own tenant, and all references are remapped to new internal identifiers. A
 * failure before commit rolls back both the database and any media written during the attempt.
 *
 * @param {ImportInstanceOptions} options - Archive, target paths and admin selection.
 * @returns {Promise<ImportInstanceOutcome>} Whether the import was activated, plus the report.
 */
export async function importInstanceArchive(
	options: ImportInstanceOptions
): Promise<ImportInstanceOutcome> {
	const report = validateInstanceArchive(options.archive);
	if (report.errors.length > 0) {
		return { imported: false, report };
	}

	// The report carries no content, so read the archive again here; validation already proved it is
	// safe to parse and internally consistent.
	const validatedData = readArchiveData(options.archive);
	if (!validatedData) {
		report.errors.push('The archive content could not be read.');
		return { imported: false, report };
	}

	const normalizedAdmin = options.instanceAdminUsername.trim().toLocaleLowerCase();
	const adminUser = validatedData.users.find(
		(user) => user.username.trim().toLocaleLowerCase() === normalizedAdmin
	);
	if (!adminUser) {
		report.errors.push('The selected instance administrator is not part of the archive.');
		return { imported: false, report };
	}

	const checkPassword = options.validatePassword ?? validatePassword;
	try {
		checkPassword(options.adminPassword);
	} catch (error) {
		report.errors.push(error instanceof Error ? error.message : 'The new password was rejected.');
		return { imported: false, report };
	}

	const entries = parseZip(options.archive);
	const writtenMedia: string[] = [];
	const database = new Database(options.databasePath);
	try {
		const adminPasswordHash = await hashPassword(options.adminPassword);
		const now = new Date().toISOString();
		database.exec('BEGIN IMMEDIATE');
		try {
			database.exec('DELETE FROM sessions');
			database.exec('DELETE FROM password_resets');

			for (const user of validatedData.users) {
				writeUser(
					database,
					options,
					user,
					entries,
					writtenMedia,
					now,
					user === adminUser ? adminPasswordHash : null
				);
			}
			database.exec('COMMIT');
		} catch (error) {
			database.exec('ROLLBACK');
			for (const written of writtenMedia) {
				rmSync(written, { force: true });
			}
			// A storage failure must never reach the visitor as raw database text, so the message is
			// translated here and the internal detail is logged instead of rendered.
			if (error instanceof Error) {
				console.error('Instance import rolled back:', error.message);
			}
			report.errors.push(
				error instanceof Error && isSafeImportMessage(error.message)
					? error.message
					: 'Der Import konnte nicht abgeschlossen werden. Die Instanz wurde nicht verändert.'
			);
			return { imported: false, report };
		}
	} finally {
		database.close();
	}

	return { imported: true, report };
}

/**
 * Read the logical data from an archive that already passed validation.
 *
 * @param {Buffer} archive - Archive bytes known to be valid.
 * @returns {ExchangeData | null} Parsed logical data, or null when it cannot be read.
 */
/**
 * Decide whether an internal message may be shown to the visitor.
 *
 * Messages written by the import itself are safe; anything that looks like database or filesystem
 * wording is not, because it exposes storage internals and reads as gibberish.
 *
 * @param {string} message - Internal error message.
 * @returns {boolean} Whether the message may be rendered.
 */
function isSafeImportMessage(message: string): boolean {
	return !/constraint|SQLITE_|sqlite|UNIQUE|CHECK |FOREIGN KEY|no such table|no such column|disk I|ENOSPC|EBUSY|EROFS/i.test(
		message
	);
}

function readArchiveData(archive: Buffer): ExchangeData | null {
	const entry = parseZip(archive).get(DATA_ENTRY_NAME);
	if (!entry) {
		return null;
	}
	try {
		const parsed = JSON.parse(readEntry(archive, entry)) as { users?: unknown };
		return Array.isArray(parsed.users) ? { users: parsed.users as ExchangeUser[] } : null;
	} catch {
		return null;
	}
}

/**
 * Write one imported user as its own tenant together with all of its content.
 *
 * @param {Database.Database} database - Target database.
 * @param {ImportInstanceOptions} options - Import options carrying the media root.
 * @param {ExchangeUser} user - Source user record.
 * @param {Map<string, { payloadOffset: number; size: number }>} entries - Archive entries.
 * @param {string[]} writtenMedia - Collector for media paths written during the attempt.
 * @param {string} now - Timestamp used for created_at columns.
 * @param {string | null} adminPasswordHash - Fresh hash for the selected admin, or null.
 * @returns {void}
 */
function writeUser(
	database: Database.Database,
	options: ImportInstanceOptions,
	user: ExchangeUser,
	entries: Map<string, { payloadOffset: number; size: number }>,
	writtenMedia: string[],
	now: string,
	adminPasswordHash: string | null
): void {
	const tenantId = randomUUID();
	const userId = randomUUID();
	// Validation already proved the name is accepted by this instance; normalize it so the stored
	// value is exactly what the login path looks up.
	const usernameResult = normalizeUsernameResult(user.username);
	const importedUsername = usernameResult.ok
		? usernameResult.username
		: user.username.trim().toLowerCase();
	database
		.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)')
		.run(tenantId, user.displayName || user.username, now);
	// Only a native hash may be carried over; a foreign scheme is never written to the database, so
	// the account is flagged for a password reset and the user sets a new one themselves.
	const carriedOver =
		adminPasswordHash === null ? classifyImportedPasswordHash(user.passwordHash) : null;
	const passwordHash = adminPasswordHash ?? (carriedOver?.usable ? carriedOver.value : null);
	database
		.prepare(
			`INSERT INTO users (id, tenant_id, username, display_name, password_hash, password_reset_required, avatar_storage_key, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			userId,
			tenantId,
			importedUsername,
			user.displayName || user.username,
			passwordHash,
			passwordHash ? 0 : 1,
			user.avatarFile ? storeMedia(options, user.avatarFile, entries, writtenMedia) : null,
			now
		);
	if (adminPasswordHash) {
		database
			.prepare('INSERT INTO instance_roles (user_id, role, created_at) VALUES (?, ?, ?)')
			.run(userId, 'instance_admin', now);
	}

	const scope = { userId, tenantId };
	for (const collection of user.collections ?? []) {
		writeCollection(database, options, collection, entries, writtenMedia, scope, now);
	}
}

/**
 * Write one imported collection with its items, images, market days and expenses.
 *
 * @param {Database.Database} database - Target database.
 * @param {ImportInstanceOptions} options - Import options carrying the media root.
 * @param {ExchangeCollection} collection - Source collection record.
 * @param {Map<string, { payloadOffset: number; size: number }>} entries - Archive entries.
 * @param {string[]} writtenMedia - Collector for media paths written during the attempt.
 * @param {{ userId: string; tenantId: string }} scope - Owner scope of the imported user.
 * @param {string} now - Timestamp used for created_at columns.
 * @returns {void}
 */
function writeCollection(
	database: Database.Database,
	options: ImportInstanceOptions,
	collection: ExchangeCollection,
	entries: Map<string, { payloadOffset: number; size: number }>,
	writtenMedia: string[],
	scope: { userId: string; tenantId: string },
	now: string
): void {
	const collectionId = randomUUID();
	database
		.prepare(
			`INSERT INTO collections (id, tenant_id, owner_id, name, stand_intro, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.run(
			collectionId,
			scope.tenantId,
			scope.userId,
			collection.name,
			collection.standIntro ?? '',
			now
		);

	const marketDayIds = new Map<string, string>();
	for (const day of collection.marketDays ?? []) {
		marketDayIds.set(day.sourceId, writeMarketDay(database, day, scope, now));
	}
	for (const item of collection.items ?? []) {
		writeItem(
			database,
			options,
			item,
			entries,
			writtenMedia,
			collectionId,
			marketDayIds,
			scope,
			now
		);
	}
	for (const expense of collection.expenses ?? []) {
		writeExpense(database, expense, marketDayIds, scope, now);
	}
}

/**
 * Write one imported market day.
 *
 * @param {Database.Database} database - Target database.
 * @param {ExchangeMarketDay} day - Source market day record.
 * @param {{ userId: string; tenantId: string }} scope - Owner scope.
 * @param {string} now - Timestamp used for created_at columns.
 * @returns {string} New internal market day identifier.
 */
function writeMarketDay(
	database: Database.Database,
	day: ExchangeMarketDay,
	scope: { userId: string; tenantId: string },
	now: string
): string {
	const id = randomUUID();
	database
		.prepare(
			`INSERT INTO market_days (id, tenant_id, owner_id, name, date, start_time, end_time, location, notes, closed_at, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			id,
			scope.tenantId,
			scope.userId,
			day.name,
			day.date ?? null,
			day.startTime ?? null,
			day.endTime ?? null,
			day.location ?? '',
			day.notes ?? '',
			day.closedAt ?? null,
			now
		);
	return id;
}

/**
 * Write one imported item with its images.
 *
 * @param {Database.Database} database - Target database.
 * @param {ImportInstanceOptions} options - Import options carrying the media root.
 * @param {ExchangeItem} item - Source item record.
 * @param {Map<string, { payloadOffset: number; size: number }>} entries - Archive entries.
 * @param {string[]} writtenMedia - Collector for media paths written during the attempt.
 * @param {string} collectionId - New internal collection identifier.
 * @param {Map<string, string>} marketDayIds - Source-to-new market day identifier map.
 * @param {{ userId: string; tenantId: string }} scope - Owner scope.
 * @param {string} now - Timestamp used for created_at columns.
 * @returns {void}
 */
function writeItem(
	database: Database.Database,
	options: ImportInstanceOptions,
	item: ExchangeItem,
	entries: Map<string, { payloadOffset: number; size: number }>,
	writtenMedia: string[],
	collectionId: string,
	marketDayIds: Map<string, string>,
	scope: { userId: string; tenantId: string },
	now: string
): void {
	const id = randomUUID();
	const marketDayId = item.marketDaySourceId
		? (marketDayIds.get(item.marketDaySourceId) ?? null)
		: null;
	database
		.prepare(
			`INSERT INTO items (
				id, tenant_id, owner_id, collection_id, title, price_cents, category, condition,
				internal_notes, external_description, is_complete, is_functional, sale_channel,
				sold_at, reserved_at, sale_proceeds_cents, market_day_id, created_at
			 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			id,
			scope.tenantId,
			scope.userId,
			collectionId,
			item.title,
			item.priceCents,
			item.category,
			item.condition,
			item.internalNotes ?? '',
			item.externalDescription ?? '',
			item.isComplete ? 1 : 0,
			item.isFunctional ? 1 : 0,
			item.saleChannel ?? null,
			item.soldAt ?? null,
			item.reservedAt ?? null,
			item.saleProceedsCents ?? null,
			marketDayId,
			now
		);
	for (const image of item.images ?? []) {
		const storageKey = storeMedia(options, image.file, entries, writtenMedia);
		database
			.prepare(
				`INSERT INTO item_images (id, tenant_id, item_id, storage_key, position, is_cover, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				randomUUID(),
				scope.tenantId,
				id,
				storageKey,
				image.position ?? 0,
				image.isCover ? 1 : 0,
				now
			);
	}
}

/**
 * Write one imported expense.
 *
 * @param {Database.Database} database - Target database.
 * @param {ExchangeExpense} expense - Source expense record.
 * @param {Map<string, string>} marketDayIds - Source-to-new market day identifier map.
 * @param {{ userId: string; tenantId: string }} scope - Owner scope.
 * @param {string} now - Timestamp used for created_at columns.
 * @returns {void}
 */
function writeExpense(
	database: Database.Database,
	expense: ExchangeExpense,
	marketDayIds: Map<string, string>,
	scope: { userId: string; tenantId: string },
	now: string
): void {
	database
		.prepare(
			`INSERT INTO expenses (id, tenant_id, owner_id, market_day_id, label, category, amount_cents, expense_date, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			randomUUID(),
			scope.tenantId,
			scope.userId,
			expense.marketDaySourceId ? (marketDayIds.get(expense.marketDaySourceId) ?? null) : null,
			expense.label,
			expense.category,
			expense.amountCents,
			expense.expenseDate,
			now
		);
}

/**
 * Copy one archived media file into the media root under a fresh opaque key.
 *
 * @param {ImportInstanceOptions} options - Import options carrying the media root.
 * @param {string} entryName - Archive entry name of the media file.
 * @param {Map<string, { payloadOffset: number; size: number }>} entries - Archive entries.
 * @param {string[]} writtenMedia - Collector for media paths written during the attempt.
 * @returns {string} New storage key relative to the media root.
 */
function storeMedia(
	options: ImportInstanceOptions,
	entryName: string,
	entries: Map<string, { payloadOffset: number; size: number }>,
	writtenMedia: string[]
): string {
	const entry = entries.get(entryName);
	if (!entry) {
		throw new Error(`The media file ${entryName} is missing from the archive.`);
	}
	const extension = extensionOf(entryName);
	const storageKey = `${randomUUID()}${extension}`;
	const target = join(options.mediaRoot, storageKey);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(
		target,
		options.archive.subarray(entry.payloadOffset, entry.payloadOffset + entry.size)
	);
	writtenMedia.push(target);
	return storageKey;
}

/**
 * Derive a safe lower-case extension from an archive entry name.
 *
 * @param {string} entryName - Archive entry name.
 * @returns {string} Extension including the dot, or an empty string.
 */
function extensionOf(entryName: string): string {
	const match = /\.[A-Za-z0-9]{1,5}$/.exec(entryName);
	return match ? match[0].toLowerCase() : '';
}

/**
 * Verify every manifest entry against the archive bytes.
 *
 * @param {Buffer} archive - Archive bytes.
 * @param {Map<string, { payloadOffset: number; size: number }>} entries - Parsed entries.
 * @param {Record<string, { sha256: string; bytes: number }>} manifestFiles - Manifest file metadata.
 * @param {InstanceImportReport} report - Report receiving errors.
 * @returns {boolean} Whether every checksum matched.
 */
function verifyChecksums(
	archive: Buffer,
	entries: Map<string, { payloadOffset: number; size: number }>,
	manifestFiles: Record<string, { sha256: string; bytes: number }>,
	report: InstanceImportReport
): boolean {
	let allMatch = true;
	for (const [name, meta] of Object.entries(manifestFiles)) {
		const entry = entries.get(name);
		if (!entry) {
			report.errors.push(`The archive is missing the referenced file ${name}.`);
			allMatch = false;
			continue;
		}
		const payload = archive.subarray(entry.payloadOffset, entry.payloadOffset + entry.size);
		if (
			payload.length !== meta.bytes ||
			createHash(CHECKSUM_ALGORITHM).update(payload).digest('hex') !== meta.sha256
		) {
			report.errors.push(`The checksum of ${name} does not match the manifest.`);
			allMatch = false;
		}
	}
	return allMatch;
}

/**
 * Validate every user and its content, filling the report.
 *
 * @param {ExchangeUser[]} users - Users from the logical data file.
 * @param {Map<string, { payloadOffset: number; size: number }>} entries - Parsed archive entries.
 * @param {InstanceImportReport} report - Report receiving errors, warnings and summaries.
 * @returns {void}
 */
function validateUsers(
	users: ExchangeUser[],
	entries: Map<string, { payloadOffset: number; size: number }>,
	report: InstanceImportReport
): void {
	const normalizedUsernames = new Set<string>();
	const sourceIds = new Set<string>();

	for (const user of users) {
		if (!isRecord(user) || !isNonBlank(user.sourceId)) {
			report.errors.push('A user entry is missing its source id.');
			continue;
		}
		if (sourceIds.has(user.sourceId)) {
			report.errors.push(`The archive uses the duplicate source id ${user.sourceId}.`);
			continue;
		}
		sourceIds.add(user.sourceId);

		const rawUsername = typeof user.username === 'string' ? user.username : '';
		// The instance only accepts names its own login can use, so apply that policy here: a name
		// this instance would refuse must block the takeover instead of importing a dead account.
		const usernameResult = normalizeUsernameResult(rawUsername);
		if (!usernameResult.ok) {
			report.errors.push(`The user ${user.sourceId} cannot be imported: ${usernameResult.reason}`);
			continue;
		}
		const username = usernameResult.username;
		if (normalizedUsernames.has(username)) {
			report.errors.push(`The username ${rawUsername} appears more than once.`);
			continue;
		}
		normalizedUsernames.add(username);

		const collections = Array.isArray(user.collections) ? user.collections : [];
		const summary: ImportReportUser = {
			sourceId: user.sourceId,
			username,
			displayName: typeof user.displayName === 'string' ? user.displayName : username,
			// The report drives the operator's decision, so it has to state what activation will
			// really do: only a natively verifiable hash is carried over, anything else is reset.
			passwordResetRequired: !classifyImportedPasswordHash(user.passwordHash).usable,
			collections: collections.length,
			items: 0,
			marketDays: 0,
			expenses: 0,
			sales: 0,
			images: 0
		};

		if (user.avatarFile && !entries.has(user.avatarFile)) {
			report.errors.push(`The avatar of ${username} is missing from the archive.`);
		}
		const collectionSourceIds = new Set<string>();
		for (const collection of collections) {
			if (isRecord(collection) && isNonBlank(collection.sourceId)) {
				if (collectionSourceIds.has(collection.sourceId)) {
					report.errors.push(
						`The user ${username} uses the duplicate collection source id ${collection.sourceId}.`
					);
				} else {
					collectionSourceIds.add(collection.sourceId);
				}
			}
			validateCollection(collection, entries, report, summary, username);
		}
		report.users.push(summary);
	}

	report.counts = {
		users: report.users.length,
		tenants: report.users.length,
		collections: report.users.reduce((total, user) => total + user.collections, 0),
		items: report.users.reduce((total, user) => total + user.items, 0),
		marketDays: report.users.reduce((total, user) => total + user.marketDays, 0),
		// A sale is an item that carries a sold timestamp; the old self-assignment always read 0.
		sales: report.users.reduce((total, user) => total + user.sales, 0),
		expenses: report.users.reduce((total, user) => total + user.expenses, 0)
	};
}

/**
 * Validate one collection and its items, market days and expenses.
 *
 * @param {ExchangeCollection} collection - Collection record.
 * @param {Map<string, { payloadOffset: number; size: number }>} entries - Parsed archive entries.
 * @param {InstanceImportReport} report - Report receiving errors, warnings and summaries.
 * @param {ImportReportUser} summary - Per-user summary being filled.
 * @param {string} username - Owning username, used for messages.
 * @returns {void}
 */
function validateCollection(
	collection: ExchangeCollection,
	entries: Map<string, { payloadOffset: number; size: number }>,
	report: InstanceImportReport,
	summary: ImportReportUser,
	username: string
): void {
	if (!isRecord(collection) || !isNonBlank(collection.name)) {
		report.errors.push(`A collection of ${username} has no name.`);
		return;
	}
	const items = Array.isArray(collection.items) ? collection.items : [];
	const marketDays = Array.isArray(collection.marketDays) ? collection.marketDays : [];
	const expenses = Array.isArray(collection.expenses) ? collection.expenses : [];
	const marketDayIds = new Set<string>();

	for (const day of marketDays) {
		validateMarketDay(day, report, username);
		if (!isRecord(day) || !isNonBlank(day.sourceId)) {
			continue;
		}
		// A repeated key would silently remap every referencing item to whichever day was written
		// last, so it blocks the takeover instead of losing the relation.
		if (marketDayIds.has(day.sourceId)) {
			report.errors.push(
				`The collection ${collection.name} uses the duplicate market day source id ${day.sourceId}.`
			);
			continue;
		}
		marketDayIds.add(day.sourceId);
	}
	const itemSourceIds = new Set<string>();
	for (const item of items) {
		if (isRecord(item) && isNonBlank(item.sourceId)) {
			if (itemSourceIds.has(item.sourceId)) {
				report.errors.push(
					`The collection ${collection.name} uses the duplicate item source id ${item.sourceId}.`
				);
			} else {
				itemSourceIds.add(item.sourceId);
			}
		}
		validateItem(item, entries, report, marketDayIds, username);
	}
	const expenseSourceIds = new Set<string>();
	for (const expense of expenses) {
		if (isRecord(expense) && isNonBlank(expense.sourceId)) {
			if (expenseSourceIds.has(expense.sourceId)) {
				report.errors.push(
					`The collection ${collection.name} uses the duplicate expense source id ${expense.sourceId}.`
				);
			} else {
				expenseSourceIds.add(expense.sourceId);
			}
		}
		validateExpense(expense, report, marketDayIds, username);
	}

	if (collection.isPublished === true) {
		// Reported as data, not as prose: the UI localizes it, because server modules here are
		// English-only while visitor-facing copy runs through the i18n layer.
		report.publicStandPages.push({ username, collectionName: collection.name });
	}
	summary.items += items.length;
	summary.marketDays += marketDays.length;
	summary.expenses += expenses.length;
	summary.sales += items.filter(
		(item) => isRecord(item) && typeof item.soldAt === 'string' && item.soldAt !== ''
	).length;
	summary.images += items.reduce(
		(total, item) => total + (Array.isArray(item?.images) ? item.images.length : 0),
		0
	);
}

/**
 * Validate one market day record.
 *
 * @param {ExchangeMarketDay} day - Market day record.
 * @param {InstanceImportReport} report - Report receiving errors.
 * @param {string} username - Owning username.
 * @returns {void}
 */
function validateMarketDay(
	day: ExchangeMarketDay,
	report: InstanceImportReport,
	username: string
): void {
	if (!isRecord(day) || !isNonBlank(day.sourceId) || !isNonBlank(day.name)) {
		report.errors.push(`A market day of ${username} is incomplete.`);
		return;
	}
	// These values are stored verbatim, so free text or an impossible value would reach the database.
	if (!isCalendarDate(day.date)) {
		report.errors.push(`The market day ${day.name} of ${username} has an invalid date.`);
	}
	if (day.startTime !== null && !isClockTime(day.startTime)) {
		report.errors.push(`The market day ${day.name} of ${username} has an invalid start time.`);
	}
	if (day.endTime !== null && !isClockTime(day.endTime)) {
		report.errors.push(`The market day ${day.name} of ${username} has an invalid end time.`);
	}
	if (day.closedAt !== null && !isIsoInstant(day.closedAt)) {
		report.errors.push(`The market day ${day.name} of ${username} has an invalid closing time.`);
	}
}

/**
 * Validate one item record and its media references.
 *
 * @param {ExchangeItem} item - Item record.
 * @param {Map<string, { payloadOffset: number; size: number }>} entries - Parsed archive entries.
 * @param {InstanceImportReport} report - Report receiving errors and warnings.
 * @param {Set<string>} marketDayIds - Known market day source ids.
 * @param {string} username - Owning username.
 * @returns {void}
 */
function validateItem(
	item: ExchangeItem,
	entries: Map<string, { payloadOffset: number; size: number }>,
	report: InstanceImportReport,
	marketDayIds: Set<string>,
	username: string
): void {
	if (!isRecord(item) || !isNonBlank(item.title)) {
		report.errors.push(`An item of ${username} has no title.`);
		return;
	}
	if (!isNonNegativeInteger(item.priceCents)) {
		report.errors.push(`The item ${item.title} has an invalid price.`);
	}
	if (item.saleProceedsCents !== null && !isNonNegativeInteger(item.saleProceedsCents)) {
		report.errors.push(`The item ${item.title} has an invalid sale proceeds amount.`);
	}
	for (const [label, value] of [
		['reservation time', item.reservedAt],
		['sale time', item.soldAt]
	] as const) {
		if (value !== null && !isIsoInstant(value)) {
			report.errors.push(`The item ${item.title} has an invalid ${label}.`);
		}
	}
	if (!(itemCategories as readonly string[]).includes(item.category)) {
		report.errors.push(`The item ${item.title} has an unsupported category.`);
	}
	if (!(itemConditions as readonly string[]).includes(item.condition)) {
		report.errors.push(`The item ${item.title} has an unsupported condition.`);
	}
	if (
		item.saleChannel !== null &&
		!(saleChannels as readonly string[]).includes(item.saleChannel)
	) {
		report.errors.push(`The item ${item.title} has an unsupported sale channel.`);
	}
	if (item.marketDaySourceId !== null && !marketDayIds.has(item.marketDaySourceId)) {
		report.errors.push(`The item ${item.title} references an unknown market day.`);
	}
	if (item.saleChannel !== null && item.saleProceedsCents === null) {
		report.warnings.push(`The sold item ${item.title} has no recorded proceeds.`);
	}
	const imagePositions = new Set<number>();
	for (const image of Array.isArray(item.images) ? item.images : []) {
		if (!isRecord(image) || !isNonBlank(image.file)) {
			report.errors.push(`The item ${item.title} references an invalid image.`);
			continue;
		}
		if (!entries.has(image.file)) {
			report.errors.push(`The media file ${image.file} is missing from the archive.`);
		}
		// Positions key the image order, so a negative or repeated value would fail as a raw
		// database constraint instead of a readable reason.
		if (!isNonNegativeInteger(image.position)) {
			report.errors.push(`The item ${item.title} has an image without a valid position.`);
		} else if (imagePositions.has(image.position)) {
			report.errors.push(`The item ${item.title} has two images with the same position.`);
		} else {
			imagePositions.add(image.position);
		}
	}
}

/**
 * Validate one expense record.
 *
 * @param {ExchangeExpense} expense - Expense record.
 * @param {InstanceImportReport} report - Report receiving errors.
 * @param {Set<string>} marketDayIds - Known market day source ids.
 * @param {string} username - Owning username.
 * @returns {void}
 */
function validateExpense(
	expense: ExchangeExpense,
	report: InstanceImportReport,
	marketDayIds: Set<string>,
	username: string
): void {
	if (!isRecord(expense) || !isNonBlank(expense.label)) {
		report.errors.push(`An expense of ${username} has no label.`);
		return;
	}
	if (!(expenseCategories as readonly string[]).includes(expense.category)) {
		report.errors.push(`The expense ${expense.label} has an unsupported expense category.`);
	}
	if (!isNonNegativeInteger(expense.amountCents)) {
		report.errors.push(`The expense ${expense.label} has an invalid amount.`);
	}
	if (!isCalendarDate(expense.expenseDate)) {
		report.errors.push(`The expense ${expense.label} has an invalid date.`);
	}
	if (expense.marketDaySourceId !== null && !marketDayIds.has(expense.marketDaySourceId)) {
		report.errors.push(`The expense ${expense.label} references an unknown market day.`);
	}
}

/**
 * Compare manifest counts with the records actually present.
 *
 * @param {ExchangeCounts} counts - Counts declared by the manifest.
 * @param {InstanceImportReport} report - Report receiving errors.
 * @param {ExchangeUser[]} users - Users present in the logical data file.
 * @param {Record<string, { sha256: string; bytes: number }>} manifestFiles - Manifest file metadata.
 * @returns {void}
 */
function validateManifestCounts(
	counts: ExchangeCounts,
	report: InstanceImportReport,
	users: ExchangeUser[],
	manifestFiles: Record<string, { sha256: string; bytes: number }>,
	manifestMedia: { files: number; bytes: number },
	referencedMedia: Set<string>
): void {
	const expected = report.counts;
	if (counts.users !== expected.users) {
		report.errors.push('The manifest user count does not match the archive contents.');
	}
	if (counts.tenants !== expected.tenants) {
		report.errors.push('The manifest tenant count does not match the archive contents.');
	}
	if (counts.items !== expected.items) {
		report.errors.push('The manifest item count does not match the archive contents.');
	}
	if (counts.collections !== expected.collections) {
		report.errors.push('The manifest collection count does not match the archive contents.');
	}
	if (counts.marketDays !== expected.marketDays) {
		report.errors.push('The manifest market day count does not match the archive contents.');
	}
	if (counts.expenses !== expected.expenses) {
		report.errors.push('The manifest expense count does not match the archive contents.');
	}
	if (counts.sales !== expected.sales) {
		report.errors.push('The manifest sale count does not match the archive contents.');
	}
	const manifestMediaNames = Object.keys(manifestFiles).filter((name) => name.startsWith('media/'));
	for (const name of referencedMedia) {
		if (!Object.hasOwn(manifestFiles, name)) {
			report.media.checksumsMatch = false;
			report.errors.push(
				`The manifest does not cover the referenced media file ${name}, so its integrity cannot be verified.`
			);
		}
	}
	if (manifestMedia.files !== manifestMediaNames.length) {
		report.errors.push('The manifest media file count does not match the archive contents.');
	}
	const declaredMediaBytes = manifestMediaNames.reduce(
		(total, name) => total + (manifestFiles[name]?.bytes ?? 0),
		0
	);
	if (manifestMedia.bytes !== declaredMediaBytes) {
		report.errors.push('The manifest media byte total does not match the archive contents.');
	}
	if (users.length === 0 && manifestMediaNames.length > 0) {
		report.errors.push('The archive contains media without any user.');
	}
}

/**
 * Read one archive entry as text.
 *
 * @param {Buffer} archive - Archive bytes.
 * @param {{ payloadOffset: number; size: number }} entry - Parsed entry.
 * @returns {string} Entry contents as UTF-8 text.
 */
function readEntry(archive: Buffer, entry: { payloadOffset: number; size: number }): string {
	return archive.subarray(entry.payloadOffset, entry.payloadOffset + entry.size).toString('utf8');
}

/**
 * Collect every media file name the logical data refers to.
 *
 * Each of these has to appear in the manifest, otherwise it would be copied into the media root
 * without any checksum having been verified.
 *
 * @param {ExchangeUser[]} users - Users present in the logical data file.
 * @returns {Set<string>} Referenced media entry names.
 */
function collectReferencedMedia(users: ExchangeUser[]): Set<string> {
	const referenced = new Set<string>();
	for (const user of users) {
		if (typeof user.avatarFile === 'string' && user.avatarFile !== '') {
			referenced.add(user.avatarFile);
		}
		for (const collection of user.collections ?? []) {
			for (const item of collection.items ?? []) {
				for (const image of item.images ?? []) {
					if (typeof image.file === 'string' && image.file !== '') {
						referenced.add(image.file);
					}
				}
			}
		}
	}
	return referenced;
}

function zeroCounts(): ImportReportCounts {
	return { users: 0, tenants: 0, collections: 0, items: 0, marketDays: 0, sales: 0, expenses: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonBlank(value: unknown): value is string {
	return typeof value === 'string' && value.trim() !== '';
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const clockTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const isoInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Check a calendar date in `YYYY-MM-DD` form.
 *
 * @param {unknown} value - Candidate date.
 * @returns {boolean} Whether the value is a real calendar date.
 */
function isCalendarDate(value: unknown): boolean {
	if (typeof value !== 'string' || !calendarDatePattern.test(value)) {
		return false;
	}
	// Round-trip through Date so an impossible day such as 2026-02-31 is rejected.
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * Check a clock time in `HH:MM` form.
 *
 * @param {unknown} value - Candidate time.
 * @returns {boolean} Whether the value is a valid clock time.
 */
function isClockTime(value: unknown): boolean {
	return typeof value === 'string' && clockTimePattern.test(value);
}

/**
 * Check an ISO-8601 instant that the product can store.
 *
 * @param {unknown} value - Candidate instant.
 * @returns {boolean} Whether the value is a valid ISO instant.
 */
function isIsoInstant(value: unknown): boolean {
	return (
		typeof value === 'string' &&
		isoInstantPattern.test(value) &&
		!Number.isNaN(new Date(value).getTime())
	);
}
