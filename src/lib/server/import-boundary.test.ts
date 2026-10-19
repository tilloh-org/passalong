import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { buildZip } from '$lib/server/backup';
import { createCollectionRepository } from '$lib/server/collection-repository';
import {
	CHECKSUM_ALGORITHM,
	DATA_ENTRY_NAME,
	EXCHANGE_FORMAT_NAME,
	EXCHANGE_FORMAT_VERSION,
	MANIFEST_ENTRY_NAME
} from '$lib/server/exchange-format';
import { importInstanceArchive, validateInstanceArchive } from '$lib/server/instance-import';

/**
 * Build an archive from a raw logical payload, bypassing the fixture helper.
 *
 * @param {unknown} data - Logical data payload.
 * @param {string[]} [extraNames] - Extra placeholder entries besides manifest and data.
 * @returns {Buffer} Archive bytes.
 */
function archiveWith(data: unknown, extraNames: string[] = []): Buffer {
	const dataPayload = Buffer.from(JSON.stringify(data), 'utf8');
	const files: Record<string, { sha256: string; bytes: number }> = {
		[DATA_ENTRY_NAME]: {
			sha256: createHash(CHECKSUM_ALGORITHM).update(dataPayload).digest('hex'),
			bytes: dataPayload.length
		}
	};
	const entries: Array<[string, Buffer]> = [
		[MANIFEST_ENTRY_NAME, Buffer.from('{}', 'utf8')],
		[DATA_ENTRY_NAME, dataPayload]
	];
	for (const name of extraNames) {
		const payload = Buffer.from('x', 'utf8');
		files[name] = {
			sha256: createHash(CHECKSUM_ALGORITHM).update(payload).digest('hex'),
			bytes: payload.length
		};
		entries.push([name, payload]);
	}
	const users = Array.isArray((data as { users?: unknown }).users)
		? ((data as { users: unknown[] }).users ?? [])
		: [];
	// Count the real content so the manifest matches, which the validator checks.
	const records = users.filter((user) => user !== null && typeof user === 'object');
	const collectionsOf = records.flatMap((user) => {
		const c = (user as { collections?: unknown }).collections;
		return Array.isArray(c) ? c : [];
	});
	const countOf = (key: string): number =>
		collectionsOf.reduce((total, collection) => {
			const v = (collection as Record<string, unknown> | null)?.[key];
			return total + (Array.isArray(v) ? v.length : 0);
		}, 0);
	const manifest = {
		format: EXCHANGE_FORMAT_NAME,
		version: EXCHANGE_FORMAT_VERSION,
		archiveId: 'probe-archive',
		createdAt: '2026-09-15T10:00:00.000Z',
		producerId: 'probe',
		counts: {
			users: records.length,
			tenants: records.length,
			collections: collectionsOf.length,
			items: countOf('items'),
			marketDays: countOf('marketDays'),
			sales: 0,
			expenses: countOf('expenses')
		},
		media: { files: 0, bytes: 0 },
		checksumAlgorithm: CHECKSUM_ALGORITHM,
		files
	};
	entries[0] = [MANIFEST_ENTRY_NAME, Buffer.from(JSON.stringify(manifest), 'utf8')];
	return buildZip(entries);
}

/**
 * Build a user whose collection carries one item, for boundary probes.
 *
 * @param {Record<string, unknown>} userOverrides - User-level overrides.
 * @param {Record<string, unknown>} [itemOverrides] - Item-level overrides.
 * @returns {Record<string, unknown>} User record.
 */
function userWithItem(
	userOverrides: Record<string, unknown> = {},
	itemOverrides: Record<string, unknown> = {}
): Record<string, unknown> {
	return {
		sourceId: 'u1',
		username: 'avery',
		displayName: 'Avery',
		passwordHash: null,
		passwordResetRequired: true,
		avatarFile: null,
		collections: [
			{
				sourceId: 'c1',
				name: 'Flohmarkt',
				standIntro: 'Hallo',
				isPublished: false,
				marketDays: [],
				expenses: [],
				items: [
					{
						sourceId: 'i1',
						title: 'Lampe',
						priceCents: 500,
						category: 'decor',
						condition: 'good',
						internalNotes: '',
						externalDescription: '',
						isComplete: false,
						isFunctional: true,
						reservedAt: null,
						saleChannel: null,
						soldAt: null,
						saleProceedsCents: null,
						marketDaySourceId: null,
						images: [],
						...itemOverrides
					}
				],
				...userOverrides
			}
		],
		...userOverrides
	};
}

describe('hostile shapes never crash the validator', () => {
	it('survives a null user entry', () => {
		// arrange
		const archive = archiveWith({ users: [null] });

		// act + assume
		expect(() => validateInstanceArchive(archive)).not.toThrow();
		expect(validateInstanceArchive(archive).errors.length).toBeGreaterThan(0);
	});

	it('survives a user whose collections is an object', () => {
		// arrange
		const archive = archiveWith({
			users: [{ sourceId: 'u1', username: 'avery', collections: { images: 1 } }]
		});

		// act + assume
		expect(() => validateInstanceArchive(archive)).not.toThrow();
	});

	it('survives an item whose images is an object', () => {
		// arrange
		const archive = archiveWith({
			users: [userWithItem({}, { images: { a: 1 } })]
		});

		// act + assume
		expect(() => validateInstanceArchive(archive)).not.toThrow();
	});

	it('survives a collection whose items is a string', () => {
		// arrange
		const archive = archiveWith({
			users: [
				{
					sourceId: 'u1',
					username: 'avery',
					collections: [{ sourceId: 'c1', name: 'C', items: 'nope' }]
				}
			]
		});

		// act + assume
		expect(() => validateInstanceArchive(archive)).not.toThrow();
	});
});

describe('text fields must be strings, not silently coerced', () => {
	it('refuses a blank display name instead of failing later at activation', () => {
		// arrange — the report is the operator's only preview, so it must not claim clean.
		const archive = archiveWith({ users: [userWithItem({ displayName: '   ' })] });

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/display name|name/i);
	});

	it('refuses a numeric display name instead of storing a coerced string', () => {
		// arrange
		const archive = archiveWith({ users: [userWithItem({ displayName: 42 })] });

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/display name/i);
	});

	it('refuses a numeric stand intro instead of storing a coerced string', () => {
		// arrange
		const archive = archiveWith({ users: [userWithItem({ standIntro: 1e6 })] });

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/intro/i);
	});

	it('accepts a normal archive with proper strings', () => {
		// arrange
		const archive = archiveWith({ users: [userWithItem()] });

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors).toEqual([]);
	});
});

describe('numeric fields must stay inside the storable range', () => {
	it('refuses a price beyond the safe integer range', () => {
		// arrange — SQLite would store an out-of-range REAL and bypass the CHECK constraint.
		const archive = archiveWith({ users: [userWithItem({}, { priceCents: 1e21 })] });

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/price/i);
	});

	it('refuses sale proceeds beyond the safe integer range', () => {
		// arrange
		const archive = archiveWith({
			users: [userWithItem({}, { soldAt: '2026-09-05T12:00:00.000Z', saleProceedsCents: 1e20 })]
		});

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/proceeds/i);
	});

	it('refuses an expense amount beyond the safe integer range', () => {
		// arrange
		const user = userWithItem();
		(user.collections as Array<Record<string, unknown>>)[0].expenses = [
			{
				sourceId: 'e1',
				label: 'Standgebühr',
				category: 'fee',
				amountCents: 1e21,
				expenseDate: '2026-09-05',
				marketDaySourceId: null
			}
		];
		const archive = archiveWith({ users: [user] });

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/amount/i);
	});
});

describe('ISO instants are validated like calendar dates', () => {
	it('refuses an impossible day inside an ISO instant', () => {
		// arrange — the market-day date already round-trips; sold_at must not be laxer.
		const archive = archiveWith({
			users: [userWithItem({}, { soldAt: '2026-02-30T00:00:00.000Z' })]
		});

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/sale time/i);
	});

	it('refuses an impossible day inside a reservation instant', () => {
		// arrange
		const archive = archiveWith({
			users: [userWithItem({}, { reservedAt: '2026-04-31T10:00:00.000Z' })]
		});

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/reservation time/i);
	});
});

describe('storage failures never expose internals to the visitor', () => {
	it('does not render raw driver text when activation fails', async () => {
		// arrange — make the target unwritable so the transaction fails inside the driver.
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-probe-'));
		const databasePath = join(workspace, 'app.sqlite');
		const mediaRoot = join(workspace, 'media');
		createCollectionRepository({ databasePath });
		const archive = archiveWith({ users: [userWithItem()] });
		const database = new Database(databasePath);
		database.exec(
			"CREATE TRIGGER probe_block_users BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT, 'probe: blocked'); END"
		);
		database.close();

		// act
		const outcome = await importInstanceArchive({
			archive,
			databasePath,
			mediaRoot,
			instanceAdminUsername: 'avery',
			adminPassword: 'a-freshly-chosen-passphrase'
		});

		// assume — the message must be translated, never a driver string or a path.
		const text = outcome.report.errors.join(' ');
		expect(outcome.imported).toBe(false);
		expect(text).not.toMatch(
			/no such table|SQLITE_|parameter values|EACCES|EEXIST|ENOENT|probe:|\/tmp\//i
		);
		expect(text).toMatch(/nicht abgeschlossen|nicht verändert/i);
		rmSync(workspace, { force: true, recursive: true });
	});
});
