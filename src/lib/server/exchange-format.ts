/**
 * Generic exchange format contract.
 *
 * The archive layout and manifest are a documented, product-neutral contract: the format name,
 * version and checksum algorithm are the only coupling between a producer and this importer.
 * Import logic must never branch on the name of the tool that produced an archive.
 */

/** Manifest entry name inside the archive. */
export const MANIFEST_ENTRY_NAME = 'manifest.json';

/** Versioned logical data entry name inside the archive. */
export const DATA_ENTRY_NAME = 'data.json';

/** Prefix for original media entries inside the archive. */
export const MEDIA_ENTRY_PREFIX = 'media/';

/** Checksum algorithm used for every manifest file entry. */
export const CHECKSUM_ALGORITHM = 'sha256';

/** Format name written into the manifest. */
export const EXCHANGE_FORMAT_NAME = 'passalong-instance-exchange';

/** Supported major format version. */
export const EXCHANGE_FORMAT_VERSION = 1;

/** Logical record counts the manifest must declare. */
export interface ExchangeCounts {
	users: number;
	tenants: number;
	collections: number;
	items: number;
	marketDays: number;
	sales: number;
	expenses: number;
}

/** Media totals the manifest must declare. */
export interface ExchangeMediaStats {
	files: number;
	bytes: number;
}

/** Checksum and size of one archive file. */
export interface ExchangeFileMetadata {
	sha256: string;
	bytes: number;
}

/** Parsed exchange manifest. */
export interface ExchangeManifest {
	format: string;
	version: number;
	archiveId: string;
	createdAt: string;
	producerId: string;
	counts: ExchangeCounts;
	media: ExchangeMediaStats;
	checksumAlgorithm: string;
	files: Record<string, ExchangeFileMetadata>;
}

/** Parse result for an exchange manifest. */
export type ExchangeManifestResult =
	{ ok: true; manifest: ExchangeManifest } | { ok: false; reason: string };

/** Image reference inside the logical data file. */
export interface ExchangeImage {
	file: string;
	isCover: boolean;
	position: number;
}

/** Item record inside the logical data file. */
export interface ExchangeItem {
	sourceId: string;
	title: string;
	priceCents: number;
	category: string;
	condition: string;
	internalNotes: string;
	externalDescription: string;
	isComplete: boolean;
	isFunctional: boolean;
	reservedAt: string | null;
	saleChannel: string | null;
	soldAt: string | null;
	saleProceedsCents: number | null;
	marketDaySourceId: string | null;
	images: ExchangeImage[];
}

/** Market day record inside the logical data file. */
export interface ExchangeMarketDay {
	sourceId: string;
	name: string;
	date: string | null;
	startTime: string | null;
	endTime: string | null;
	location: string;
	notes: string;
	closedAt: string | null;
}

/** Expense record inside the logical data file. */
export interface ExchangeExpense {
	sourceId: string;
	label: string;
	category: string;
	amountCents: number;
	expenseDate: string;
	marketDaySourceId: string | null;
}

/** Collection record inside the logical data file. */
export interface ExchangeCollection {
	sourceId: string;
	name: string;
	standIntro: string;
	isPublished: boolean;
	items: ExchangeItem[];
	marketDays: ExchangeMarketDay[];
	expenses: ExchangeExpense[];
}

/** User record inside the logical data file; carries its own tenant content. */
export interface ExchangeUser {
	sourceId: string;
	username: string;
	displayName: string;
	passwordHash: string | null;
	passwordResetRequired: boolean;
	avatarFile: string | null;
	collections: ExchangeCollection[];
}

/** Logical data file of an exchange archive. */
export interface ExchangeData {
	users: ExchangeUser[];
}

/** Parse result for the logical data file. */
export type ExchangeDataResult = { ok: true; data: ExchangeData } | { ok: false; reason: string };

/** Count fields that must be present; older archives may omit the rest with a zero default. */
const requiredCountFields = ['users', 'tenants', 'collections', 'items'] as const;

/** Count fields that default to zero when an older supported archive omits them. */
const optionalCountFields = ['marketDays', 'sales', 'expenses'] as const;

/**
 * Parse and validate an exchange manifest.
 *
 * Unknown major versions, a foreign format name, or missing required fields are rejected. Optional
 * fields of older supported versions receive the documented zero default; required fields are never
 * invented.
 *
 * @param {string} json - Raw manifest text.
 * @returns {ExchangeManifestResult} Parsed manifest or a safe rejection reason.
 */
export function parseExchangeManifest(json: string): ExchangeManifestResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return { ok: false, reason: 'manifest is not valid JSON' };
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		return { ok: false, reason: 'manifest is not an object' };
	}
	const candidate = parsed as Record<string, unknown>;

	if (candidate.format !== EXCHANGE_FORMAT_NAME) {
		return { ok: false, reason: 'manifest was produced by an unsupported format' };
	}
	if (typeof candidate.version !== 'number' || !Number.isInteger(candidate.version)) {
		return { ok: false, reason: 'manifest version is missing' };
	}
	if (candidate.version !== EXCHANGE_FORMAT_VERSION) {
		return { ok: false, reason: `unsupported format version ${candidate.version}` };
	}
	if (!isNonBlankText(candidate.archiveId)) {
		return { ok: false, reason: 'manifest archiveId is missing' };
	}
	if (!isNonBlankText(candidate.createdAt)) {
		return { ok: false, reason: 'manifest createdAt is missing' };
	}
	if (!isNonBlankText(candidate.producerId)) {
		return { ok: false, reason: 'manifest producerId is missing' };
	}
	if (candidate.checksumAlgorithm !== CHECKSUM_ALGORITHM) {
		return { ok: false, reason: 'manifest checksum algorithm is unsupported' };
	}

	const counts = candidate.counts;
	if (typeof counts !== 'object' || counts === null || Array.isArray(counts)) {
		return { ok: false, reason: 'manifest counts are missing' };
	}
	const countRecord = counts as Record<string, unknown>;
	const resolvedCounts = {} as ExchangeCounts;
	for (const field of requiredCountFields) {
		const value = countRecord[field];
		if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
			return { ok: false, reason: `manifest count ${field} is missing` };
		}
		resolvedCounts[field] = value;
	}
	for (const field of optionalCountFields) {
		const value = countRecord[field];
		resolvedCounts[field] =
			typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
	}

	const media = candidate.media;
	if (typeof media !== 'object' || media === null || Array.isArray(media)) {
		return { ok: false, reason: 'manifest media statistics are missing' };
	}
	const mediaRecord = media as Record<string, unknown>;
	if (!isNonNegativeInteger(mediaRecord.files) || !isNonNegativeInteger(mediaRecord.bytes)) {
		return { ok: false, reason: 'manifest media statistics are incomplete' };
	}

	const files = candidate.files;
	if (typeof files !== 'object' || files === null || Array.isArray(files)) {
		return { ok: false, reason: 'manifest file list is missing' };
	}
	const fileRecord = files as Record<string, unknown>;
	if (!(DATA_ENTRY_NAME in fileRecord)) {
		return { ok: false, reason: 'manifest does not describe the logical data file' };
	}
	const resolvedFiles: Record<string, ExchangeFileMetadata> = {};
	for (const [name, metadata] of Object.entries(fileRecord)) {
		if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
			return { ok: false, reason: `manifest entry ${name} is malformed` };
		}
		const entry = metadata as Record<string, unknown>;
		if (!isNonBlankText(entry.sha256) || !isNonNegativeInteger(entry.bytes)) {
			return { ok: false, reason: `manifest entry ${name} lacks a checksum or size` };
		}
		resolvedFiles[name] = { sha256: entry.sha256, bytes: entry.bytes };
	}

	return {
		ok: true,
		manifest: {
			format: EXCHANGE_FORMAT_NAME,
			version: EXCHANGE_FORMAT_VERSION,
			archiveId: candidate.archiveId as string,
			createdAt: candidate.createdAt as string,
			producerId: candidate.producerId as string,
			counts: resolvedCounts,
			media: { files: mediaRecord.files as number, bytes: mediaRecord.bytes as number },
			checksumAlgorithm: CHECKSUM_ALGORITHM,
			files: resolvedFiles
		}
	};
}

function isNonBlankText(value: unknown): value is string {
	return typeof value === 'string' && value.trim() !== '';
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
