import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { buildZip } from '$lib/server/backup';
import {
	CHECKSUM_ALGORITHM,
	DATA_ENTRY_NAME,
	EXCHANGE_FORMAT_NAME,
	EXCHANGE_FORMAT_VERSION,
	MANIFEST_ENTRY_NAME,
	MEDIA_ENTRY_PREFIX,
	type ExchangeData,
	type ExchangeUser
} from '$lib/server/exchange-format';

/** Fixture user shape with required fields filled in. */
export interface FixtureUserOptions {
	sourceId: string;
	username: string;
	displayName?: string;
	passwordHash?: string | null;
	passwordResetRequired?: boolean;
	avatarFile?: string | null;
	items?: number;
	published?: boolean;
}

/**
 * Build one fixture user with one collection.
 *
 * @param {FixtureUserOptions} options - User identity and content size.
 * @returns {ExchangeUser} Fixture user record.
 */
export function fixtureUser(options: FixtureUserOptions): ExchangeUser {
	const items = Array.from({ length: options.items ?? 1 }, (_, index) => ({
		sourceId: `${options.sourceId}-item-${index + 1}`,
		title: `Item ${index + 1}`,
		priceCents: 500 + index,
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
		images: [
			{
				file: `${MEDIA_ENTRY_PREFIX}${options.sourceId}/photo-${index + 1}.jpg`,
				isCover: true,
				position: 0
			}
		]
	}));
	return {
		sourceId: options.sourceId,
		username: options.username,
		displayName: options.displayName ?? options.username,
		passwordHash: options.passwordHash ?? null,
		passwordResetRequired: options.passwordResetRequired ?? false,
		avatarFile: options.avatarFile ?? null,
		collections: [
			{
				sourceId: `${options.sourceId}-collection-1`,
				name: 'Flohmarkt',
				standIntro: 'Hallo',
				isPublished: options.published ?? false,
				items,
				marketDays: [
					{
						sourceId: `${options.sourceId}-day-1`,
						name: 'Samstag',
						date: '2026-09-05',
						startTime: '08:00',
						endTime: '14:00',
						location: 'Parkplatz',
						notes: '',
						closedAt: null
					}
				],
				expenses: [
					{
						sourceId: `${options.sourceId}-expense-1`,
						label: 'Standgebühr',
						category: 'fee',
						amountCents: 1200,
						expenseDate: '2026-09-05',
						marketDaySourceId: `${options.sourceId}-day-1`
					}
				]
			}
		]
	};
}

/**
 * Build a complete, checksum-consistent exchange archive.
 *
 * @param {ExchangeUser[]} users - Users to include.
 * @param {{ mediaFiles?: string[]; mediaBytes?: Buffer }} [options] - Media entries to add.
 * @returns {Buffer} Archive bytes.
 */
export function fixtureArchive(
	users: ExchangeUser[],
	options: { mediaFiles?: string[]; mediaBytes?: Buffer } = {}
): Buffer {
	const data: ExchangeData = { users };
	const dataPayload = Buffer.from(JSON.stringify(data, null, '\t'), 'utf8');
	const mediaFiles = options.mediaFiles ?? [
		...new Set(
			users.flatMap((user) => [
				...user.collections.flatMap((collection) =>
					collection.items.flatMap((item) => item.images.map((image) => image.file))
				),
				...(user.avatarFile ? [user.avatarFile] : [])
			])
		)
	];
	const mediaPayload = options.mediaBytes ?? Buffer.from('image-bytes', 'utf8');
	const files: Array<[string, Buffer]> = [
		[MANIFEST_ENTRY_NAME, Buffer.from('{}', 'utf8')],
		[DATA_ENTRY_NAME, dataPayload],
		...mediaFiles.map((name): [string, Buffer] => [name, mediaPayload])
	];
	const manifestFiles: Record<string, { sha256: string; bytes: number }> = {};
	for (const [name, payload] of files) {
		if (name === MANIFEST_ENTRY_NAME) {
			continue;
		}
		manifestFiles[name] = {
			sha256: createHash(CHECKSUM_ALGORITHM).update(payload).digest('hex'),
			bytes: payload.length
		};
	}
	const totals = users.reduce(
		(accumulator, user) => {
			accumulator.items += user.collections.reduce(
				(inner, collection) => inner + collection.items.length,
				0
			);
			accumulator.collections += user.collections.length;
			accumulator.marketDays += user.collections.reduce(
				(inner, collection) => inner + collection.marketDays.length,
				0
			);
			accumulator.expenses += user.collections.reduce(
				(inner, collection) => inner + collection.expenses.length,
				0
			);
			return accumulator;
		},
		{ items: 0, collections: 0, marketDays: 0, expenses: 0 }
	);
	const manifest = {
		format: EXCHANGE_FORMAT_NAME,
		version: EXCHANGE_FORMAT_VERSION,
		archiveId: 'fixture-archive',
		createdAt: '2026-09-15T10:00:00.000Z',
		producerId: 'fixture-producer',
		counts: {
			users: users.length,
			tenants: users.length,
			collections: totals.collections,
			items: totals.items,
			marketDays: totals.marketDays,
			sales: 0,
			expenses: totals.expenses
		},
		media: { files: mediaFiles.length, bytes: mediaPayload.length * mediaFiles.length },
		checksumAlgorithm: CHECKSUM_ALGORITHM,
		files: manifestFiles
	};
	files[0] = [MANIFEST_ENTRY_NAME, Buffer.from(JSON.stringify(manifest, null, '\t'), 'utf8')];
	return buildZip(files);
}
