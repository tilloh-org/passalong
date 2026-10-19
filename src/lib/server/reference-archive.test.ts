import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { parseZip } from '$lib/server/backup';
import { createCollectionRepository } from '$lib/server/collection-repository';
import {
	DATA_ENTRY_NAME,
	MANIFEST_ENTRY_NAME,
	parseExchangeManifest,
	type ExchangeData
} from '$lib/server/exchange-format';
import {
	referenceAdminUsername,
	referenceArchivePath,
	referenceIncompatibleUsername,
	referenceLegacyPassword,
	referenceLegacyUsername
} from '$lib/exchange-reference';
import {
	buildReferenceArchive,
	referenceArchiveCounts
} from '$lib/server/exchange-reference-archive.test-helper';
import { importInstanceArchive, validateInstanceArchive } from '$lib/server/instance-import';
import { hashPassword, needsPasswordRehash, verifyPassword } from '$lib/server/password';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const archiveFile = join(repositoryRoot, referenceArchivePath);
const administratorPassword = 'a-reference-administrator-passphrase';

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories) {
		rmSync(directory, { force: true, recursive: true });
	}
	temporaryDirectories.length = 0;
});

/**
 * Read one entry of a stored-only ZIP archive.
 *
 * @param {Buffer} archive - Archive bytes.
 * @param {string} name - Entry name.
 * @returns {Buffer} Entry payload.
 */
function readEntry(archive: Buffer, name: string): Buffer {
	const entry = parseZip(archive).get(name);
	if (!entry) {
		throw new Error(`The archive has no entry ${name}.`);
	}
	return archive.subarray(entry.payloadOffset, entry.payloadOffset + entry.size);
}

/**
 * Read the committed reference archive and its manifest.
 *
 * @returns {{ archive: Buffer; data: ExchangeData }} Archive bytes and logical content.
 */
function readReferenceArchive(): { archive: Buffer; data: ExchangeData } {
	const archive = readFileSync(archiveFile);
	const manifest = parseExchangeManifest(readEntry(archive, MANIFEST_ENTRY_NAME).toString('utf8'));
	if (!manifest.ok) {
		throw new Error(`The reference archive manifest is invalid: ${manifest.reason}`);
	}
	return {
		archive,
		data: JSON.parse(readEntry(archive, DATA_ENTRY_NAME).toString('utf8')) as ExchangeData
	};
}

/**
 * Count every table of an imported instance.
 *
 * @param {string} databasePath - Database file to inspect.
 * @returns {Record<string, number>} Row counts per table.
 */
function countRows(databasePath: string): Record<string, number> {
	const database = new Database(databasePath, { readonly: true });
	const countOf = (sql: string): number => (database.prepare(sql).get() as { count: number }).count;
	const counts = {
		users: countOf('SELECT COUNT(*) AS count FROM users'),
		tenants: countOf('SELECT COUNT(*) AS count FROM tenants'),
		collections: countOf('SELECT COUNT(*) AS count FROM collections'),
		items: countOf('SELECT COUNT(*) AS count FROM items'),
		images: countOf('SELECT COUNT(*) AS count FROM item_images'),
		marketDays: countOf('SELECT COUNT(*) AS count FROM market_days'),
		sales: countOf('SELECT COUNT(*) AS count FROM items WHERE sold_at IS NOT NULL'),
		expenses: countOf('SELECT COUNT(*) AS count FROM expenses'),
		avatars: countOf('SELECT COUNT(*) AS count FROM users WHERE avatar_storage_key IS NOT NULL')
	};
	database.close();
	return counts;
}

/**
 * Collect every tenant-scope violation the schema allows to be expressed as a join.
 *
 * @param {string} databasePath - Database file to inspect.
 * @returns {Record<string, number>} Violation counts; each value must be zero.
 */
function findTenantScopeViolations(databasePath: string): Record<string, number> {
	const database = new Database(databasePath, { readonly: true });
	const countOf = (sql: string): number => (database.prepare(sql).get() as { count: number }).count;
	const violations = {
		usersWithoutTenant: countOf(
			'SELECT COUNT(*) AS count FROM users WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE tenants.id = users.tenant_id)'
		),
		collectionsWithForeignOwner: countOf(
			'SELECT COUNT(*) AS count FROM collections WHERE NOT EXISTS (SELECT 1 FROM users WHERE users.id = collections.owner_id AND users.tenant_id = collections.tenant_id)'
		),
		itemsWithForeignCollection: countOf(
			'SELECT COUNT(*) AS count FROM items WHERE NOT EXISTS (SELECT 1 FROM collections WHERE collections.id = items.collection_id AND collections.tenant_id = items.tenant_id)'
		),
		itemsWithForeignOwner: countOf(
			'SELECT COUNT(*) AS count FROM items WHERE NOT EXISTS (SELECT 1 FROM collections WHERE collections.id = items.collection_id AND collections.owner_id = items.owner_id)'
		),
		itemsWithForeignMarketDay: countOf(
			'SELECT COUNT(*) AS count FROM items WHERE market_day_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM market_days WHERE market_days.id = items.market_day_id AND market_days.tenant_id = items.tenant_id)'
		),
		imagesWithForeignItem: countOf(
			'SELECT COUNT(*) AS count FROM item_images WHERE NOT EXISTS (SELECT 1 FROM items WHERE items.id = item_images.item_id AND items.tenant_id = item_images.tenant_id)'
		),
		marketDaysWithForeignOwner: countOf(
			'SELECT COUNT(*) AS count FROM market_days WHERE NOT EXISTS (SELECT 1 FROM users WHERE users.id = market_days.owner_id AND users.tenant_id = market_days.tenant_id)'
		),
		expensesWithForeignOwner: countOf(
			'SELECT COUNT(*) AS count FROM expenses WHERE NOT EXISTS (SELECT 1 FROM users WHERE users.id = expenses.owner_id AND users.tenant_id = expenses.tenant_id)'
		),
		expensesWithForeignMarketDay: countOf(
			'SELECT COUNT(*) AS count FROM expenses WHERE market_day_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM market_days WHERE market_days.id = expenses.market_day_id AND market_days.tenant_id = expenses.tenant_id)'
		),
		rolesWithForeignTenant: countOf(
			'SELECT COUNT(*) AS count FROM instance_roles WHERE NOT EXISTS (SELECT 1 FROM users WHERE users.id = instance_roles.user_id)'
		)
	};
	database.close();
	return violations;
}

/**
 * Hash every media file of an instance, keyed by storage key.
 *
 * @param {string} databasePath - Database file to inspect.
 * @param {string} mediaRoot - Media directory of the instance.
 * @returns {Map<string, string>} Storage key to sha256.
 */
function hashStoredMedia(databasePath: string, mediaRoot: string): Map<string, string> {
	const database = new Database(databasePath, { readonly: true });
	const keys = (
		database
			.prepare(
				'SELECT storage_key AS key FROM item_images UNION SELECT avatar_storage_key AS key FROM users WHERE avatar_storage_key IS NOT NULL'
			)
			.all() as Array<{ key: string }>
	).map((row) => row.key);
	database.close();
	const hashes = new Map<string, string>();
	for (const key of keys) {
		hashes.set(
			key,
			createHash('sha256')
				.update(readFileSync(join(mediaRoot, key)))
				.digest('hex')
		);
	}
	return hashes;
}

/**
 * Read one account row.
 *
 * @param {string} databasePath - Database file to inspect.
 * @param {string} username - Account username.
 * @returns {{ passwordHash: string | null; passwordResetRequired: boolean } | null} Account state.
 */
function readAccount(
	databasePath: string,
	username: string
): { passwordHash: string | null; passwordResetRequired: boolean } | null {
	const database = new Database(databasePath, { readonly: true });
	const row = database
		.prepare('SELECT password_hash, password_reset_required FROM users WHERE username = ?')
		.get(username) as { password_hash: string | null; password_reset_required: number } | undefined;
	database.close();
	return row
		? { passwordHash: row.password_hash, passwordResetRequired: row.password_reset_required === 1 }
		: null;
}

/**
 * Import the reference archive into a fresh, empty instance.
 *
 * @returns {Promise<{ databasePath: string; mediaRoot: string }>} Paths of the imported instance.
 */
async function importReferenceArchive(): Promise<{ databasePath: string; mediaRoot: string }> {
	const workspace = mkdtempSync(join(tmpdir(), 'passalong-reference-'));
	temporaryDirectories.push(workspace);
	const databasePath = join(workspace, 'app.sqlite');
	const mediaRoot = join(workspace, 'media');
	createCollectionRepository({ databasePath });
	await importInstanceArchive({
		archive: readFileSync(archiveFile),
		databasePath,
		mediaRoot,
		instanceAdminUsername: referenceAdminUsername,
		adminPassword: administratorPassword
	});
	return { databasePath, mediaRoot };
}

describe('reference exchange archive', () => {
	it('keeps the committed archive byte-identical to its generator', () => {
		if (process.env.REFERENCE_ARCHIVE_WRITE === '1') {
			// arrange — regeneration is explicit, never a side effect of a test run
			writeFileSync(archiveFile, buildReferenceArchive());
		}

		// act
		const archive = readFileSync(archiveFile);

		// assume
		expect(archive.length).toBeGreaterThan(0);
		expect(buildReferenceArchive().equals(archive)).toBe(true);
	});

	it('declares a checksum and a size for every entry it carries', () => {
		// arrange
		const { archive } = readReferenceArchive();
		const manifestResult = parseExchangeManifest(
			readEntry(archive, MANIFEST_ENTRY_NAME).toString('utf8')
		);

		// act
		expect(manifestResult.ok).toBe(true);
		if (!manifestResult.ok) {
			return;
		}
		const entries = parseZip(archive);

		// assume
		expect(entries.has(MANIFEST_ENTRY_NAME)).toBe(true);
		expect(entries.has(DATA_ENTRY_NAME)).toBe(true);
		for (const [name, metadata] of Object.entries(manifestResult.manifest.files)) {
			const payload = readEntry(archive, name);
			expect(payload.length).toBe(metadata.bytes);
			expect(createHash('sha256').update(payload).digest('hex')).toBe(metadata.sha256);
		}
		const mediaEntries = [...entries.keys()].filter((name) => name.startsWith('media/'));
		expect(manifestResult.manifest.media.files).toBe(mediaEntries.length);
	});

	it('declares the record counts that its own content contains', () => {
		// arrange
		const { archive, data } = readReferenceArchive();
		const manifestResult = parseExchangeManifest(
			readEntry(archive, MANIFEST_ENTRY_NAME).toString('utf8')
		);
		if (!manifestResult.ok) {
			throw new Error(manifestResult.reason);
		}

		// act
		const counted = referenceArchiveCounts(data.users);

		// assume
		expect(manifestResult.manifest.counts).toEqual(counted);
		expect(counted.users).toBeGreaterThan(1);
		expect(counted.sales).toBeGreaterThan(0);
		expect(counted.marketDays).toBeGreaterThan(0);
		expect(counted.expenses).toBeGreaterThan(0);
	});

	it('passes validation without a single finding', () => {
		// arrange
		const { archive } = readReferenceArchive();

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors).toEqual([]);
		expect(report.media.checksumsMatch).toBe(true);
		expect(report.users).toHaveLength(3);
	});

	it('imports every declared record into an empty instance', async () => {
		// arrange
		const { archive, data } = readReferenceArchive();
		const manifestResult = parseExchangeManifest(
			readEntry(archive, MANIFEST_ENTRY_NAME).toString('utf8')
		);
		if (!manifestResult.ok) {
			throw new Error(manifestResult.reason);
		}
		const expected = referenceArchiveCounts(data.users);

		// act
		const instance = await importReferenceArchive();

		// assume — the manifest counts are reproduced one to one
		const counts = countRows(instance.databasePath);
		expect(counts.users).toBe(expected.users);
		expect(counts.tenants).toBe(expected.tenants);
		expect(counts.collections).toBe(expected.collections);
		expect(counts.items).toBe(expected.items);
		expect(counts.marketDays).toBe(expected.marketDays);
		expect(counts.sales).toBe(expected.sales);
		expect(counts.expenses).toBe(expected.expenses);
		expect(counts.images).toBe(7);
		expect(counts.avatars).toBe(1);
	});

	it('stores every media file with the bytes the manifest describes', async () => {
		// arrange
		const { archive } = readReferenceArchive();
		const manifestResult = parseExchangeManifest(
			readEntry(archive, MANIFEST_ENTRY_NAME).toString('utf8')
		);
		if (!manifestResult.ok) {
			throw new Error(manifestResult.reason);
		}
		const expectedHashes = Object.entries(manifestResult.manifest.files)
			.filter(([name]) => name.startsWith('media/'))
			.map(([, metadata]) => metadata.sha256)
			.sort();

		// act
		const instance = await importReferenceArchive();

		// assume — every stored file still carries the checksum that was verified on the archive
		const stored = hashStoredMedia(instance.databasePath, instance.mediaRoot);
		expect([...stored.values()].sort()).toEqual(expectedHashes);
		for (const key of stored.keys()) {
			expect(existsSync(join(instance.mediaRoot, key))).toBe(true);
		}
	});

	it('leaves no tenant-scope violation anywhere in the database', async () => {
		// arrange
		const { data } = readReferenceArchive();

		// act
		const instance = await importReferenceArchive();

		// assume
		expect(data.users).toHaveLength(3);
		expect(findTenantScopeViolations(instance.databasePath)).toEqual({
			usersWithoutTenant: 0,
			collectionsWithForeignOwner: 0,
			itemsWithForeignCollection: 0,
			itemsWithForeignOwner: 0,
			itemsWithForeignMarketDay: 0,
			imagesWithForeignItem: 0,
			marketDaysWithForeignOwner: 0,
			expensesWithForeignOwner: 0,
			expensesWithForeignMarketDay: 0,
			rolesWithForeignTenant: 0
		});
	});

	it('gives exactly one account the instance admin role and a working password', async () => {
		// arrange — the takeover sets a fresh password for the selected administrator
		const instance = await importReferenceArchive();

		// act
		const repository = createCollectionRepository({ databasePath: instance.databasePath });
		const administrator = repository.getUserForLogin(referenceAdminUsername);

		// assume
		expect(administrator).not.toBeNull();
		expect(await verifyPassword(administratorPassword, administrator?.passwordHash ?? null)).toBe(
			true
		);
		const database = new Database(instance.databasePath, { readonly: true });
		const admins = database
			.prepare(
				`SELECT users.username FROM instance_roles
				 JOIN users ON users.id = instance_roles.user_id
				 WHERE instance_roles.role = 'instance_admin'`
			)
			.all() as Array<{ username: string }>;
		database.close();
		expect(admins.map((row) => row.username)).toEqual([referenceAdminUsername]);
	});

	it('carries the compatible hash over and drops the foreign one', async () => {
		// arrange
		const { data } = readReferenceArchive();
		const importedHash = data.users.find(
			(user) => user.username === referenceLegacyUsername
		)?.passwordHash;

		// act
		const instance = await importReferenceArchive();
		const compatible = readAccount(instance.databasePath, referenceLegacyUsername);
		const incompatible = readAccount(instance.databasePath, referenceIncompatibleUsername);

		// assume — the native hash still authenticates and is flagged for the upgrade
		expect(compatible?.passwordHash).toBe(importedHash);
		expect(await verifyPassword(referenceLegacyPassword, compatible?.passwordHash ?? null)).toBe(
			true
		);
		expect(needsPasswordRehash(compatible?.passwordHash ?? '')).toBe(true);
		// the foreign scheme is never stored; the account has to take the reset path
		expect(incompatible).toEqual({ passwordHash: null, passwordResetRequired: true });
	});

	it('replaces the carried-over hash with the current format on the first sign-in', async () => {
		// arrange — this is the upgrade step the login action runs after a successful verification
		const instance = await importReferenceArchive();
		const repository = createCollectionRepository({ databasePath: instance.databasePath });
		const account = repository.getUserForLogin(referenceLegacyUsername);
		const importedHash = account?.passwordHash ?? '';

		// act
		expect(await verifyPassword(referenceLegacyPassword, importedHash)).toBe(true);
		repository.updatePassword(
			{ userId: account!.userId, tenantId: account!.tenantId },
			await hashPassword(referenceLegacyPassword)
		);

		// assume
		const upgraded = readAccount(instance.databasePath, referenceLegacyUsername);
		expect(upgraded?.passwordHash).not.toBe(importedHash);
		expect(needsPasswordRehash(upgraded?.passwordHash ?? '')).toBe(false);
		expect(await verifyPassword(referenceLegacyPassword, upgraded?.passwordHash ?? null)).toBe(
			true
		);
	});
});
