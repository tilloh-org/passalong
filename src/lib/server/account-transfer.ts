import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { Buffer } from 'node:buffer';
import { buildZip, hasValidEndOfCentralDirectory, parseZip } from '$lib/server/backup';
import { saveUploadedImage, removeStoredMedia } from '$lib/server/media-storage';
import type {
	CollectionRepository,
	ItemCategory,
	ItemCondition,
	SaleChannel,
	SessionScope
} from '$lib/server/collection-repository';

const transferManifestEntryName = 'manifest.json';
const transferFormat = 'passalong-account-transfer';
const transferVersion = 1 as const;
const hashEncoding = 'hex';

interface ArchiveEntry {
	payloadOffset: number;
	size: number;
}

export interface AccountExportFileMetadata {
	sha256: string;
	bytes: number;
}

export interface AccountExportImage {
	key: string;
	file: string;
	isCover: boolean;
}

export interface AccountExportItem {
	key: string;
	title: string;
	priceCents: number;
	category: ItemCategory;
	condition: ItemCondition;
	internalNotes: string;
	externalDescription: string;
	isComplete: boolean;
	isFunctional: boolean;
	reservedAt: string | null;
	saleChannel: SaleChannel | null;
	soldAt: string | null;
	saleProceedsCents: number | null;
	images: AccountExportImage[];
}

export interface AccountExportCollection {
	key: string;
	name: string;
	standIntro: string;
	items: AccountExportItem[];
}

export interface AccountExportManifest {
	format: typeof transferFormat;
	version: typeof transferVersion;
	createdAt: string;
	files: Record<string, AccountExportFileMetadata>;
	collections: AccountExportCollection[];
}

export interface AccountExportArchive {
	manifest: AccountExportManifest;
	zip: Buffer;
}

export interface AccountImportSummary {
	collectionsImported: number;
	itemsImported: number;
	imagesImported: number;
}

interface ImportedMediaFile {
	path: string;
	storageKey: string;
	created: boolean;
}

function hashBytes(payload: Buffer): string {
	return createHash('sha256').update(payload).digest(hashEncoding);
}

function storageKeyExtension(storageKey: string): string {
	return extname(storageKey).toLowerCase();
}

function mimeTypeFromStorageKey(storageKey: string): string {
	switch (storageKeyExtension(storageKey)) {
		case '.png':
			return 'image/png';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.webp':
			return 'image/webp';
		default:
			throw new Error('unsupported media format in export archive');
	}
}

function fileNameFromStorageKey(storageKey: string): string {
	const extension = storageKeyExtension(storageKey);
	if (!extension) {
		throw new Error('unsupported media format in export archive');
	}
	return extension;
}

function archiveFilePath(...segments: string[]): string {
	return ['media', ...segments].join('/');
}

function archivePathToBuffer(archive: Buffer, entry: ArchiveEntry): Buffer {
	return archive.subarray(entry.payloadOffset, entry.payloadOffset + entry.size);
}

function readArchiveEntry(archive: Buffer, entries: Map<string, ArchiveEntry>, path: string): Buffer {
	const entry = entries.get(path);
	if (!entry) {
		throw new Error('export archive is missing a required file');
	}
	return archivePathToBuffer(archive, entry);
}

function verifyArchiveManifestFile(archive: Buffer): { manifest: AccountExportManifest; entries: Map<string, ArchiveEntry> } {
	if (!hasValidEndOfCentralDirectory(archive)) {
		throw new Error('export archive is not a valid account export');
	}
	const entries = parseZip(archive) as Map<string, ArchiveEntry>;
	const manifestEntry = entries.get(transferManifestEntryName);
	if (!manifestEntry) {
		throw new Error('export archive is not a valid account export');
	}
	const manifestPayload = archivePathToBuffer(archive, manifestEntry);
	let manifest: AccountExportManifest;
	try {
		manifest = JSON.parse(manifestPayload.toString('utf8')) as AccountExportManifest;
	} catch {
		throw new Error('export archive is not a valid account export');
	}
	if (!manifest || manifest.format !== transferFormat || manifest.version !== transferVersion) {
		throw new Error('export archive is not a valid account export');
	}
	return { manifest, entries };
}

function addFile(
	files: Array<[string, Buffer]>,
	manifestFiles: Record<string, AccountExportFileMetadata>,
	path: string,
	payload: Buffer
): void {
	files.push([path, payload]);
	manifestFiles[path] = {
		sha256: hashBytes(payload),
		bytes: payload.length
	};
}


/**
 * Create a portable account archive containing the current user's collections,
 * items, item images, and optional avatar.
 *
 * @param {CollectionRepository} repository - The collection repository.
 * @param {SessionScope} scope - The authenticated account scope.
 * @param {string} mediaRoot - Absolute media directory.
 * @returns {AccountExportArchive} ZIP archive and its manifest.
 */
export async function createAccountExport(
	repository: CollectionRepository,
	scope: SessionScope,
	mediaRoot: string
): Promise<AccountExportArchive> {
	const files: Array<[string, Buffer]> = [];
	const manifestFiles: Record<string, AccountExportFileMetadata> = {};
	const collections = repository.listCollectionsForOwner(scope);
	const exportedCollections = collections.map((collection, collectionIndex) => {
		const collectionKey = `collection-${collectionIndex + 1}`;
		const items = repository.listItemsForOwner(collection.id, scope);
		const exportedItems: AccountExportItem[] = [];
		for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
			const item = items[itemIndex];
			const itemKey = `item-${collectionIndex + 1}-${itemIndex + 1}`;
			const images = repository.listItemImages(item.id, scope);
			const exportedImages: AccountExportImage[] = [];
			for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
				const image = images[imageIndex];
				const imageKey = `image-${collectionIndex + 1}-${itemIndex + 1}-${imageIndex + 1}`;
				const imagePath = archiveFilePath(collectionKey, itemKey, `${imageKey}${fileNameFromStorageKey(image.storageKey)}`);
				const payload = readFileSync(join(mediaRoot, image.storageKey));
				addFile(files, manifestFiles, imagePath, payload);
				exportedImages.push({ key: imageKey, file: imagePath, isCover: image.isCover });
			}
			exportedItems.push({
				key: itemKey,
				title: item.title,
				priceCents: item.priceCents,
				category: item.category,
				condition: item.condition,
				internalNotes: item.internalNotes,
				externalDescription: item.externalDescription,
				isComplete: item.isComplete,
				isFunctional: item.isFunctional,
				reservedAt: item.reservedAt,
				saleChannel: item.saleChannel,
				soldAt: item.soldAt,
				saleProceedsCents: item.saleProceedsCents,
				images: exportedImages
			});
		}
		return {
			key: collectionKey,
			name: collection.name,
			standIntro: collection.standIntro,
			items: exportedItems
		};
	});
	const manifest: AccountExportManifest = {
		format: transferFormat,
		version: transferVersion,
		createdAt: new Date().toISOString(),
		files: manifestFiles,
		collections: exportedCollections
	};
	const manifestPayload = Buffer.from(JSON.stringify(manifest, null, '\t'), 'utf8');
	const zip = buildZip([[transferManifestEntryName, manifestPayload], ...files]);
	return { manifest, zip };
}

/**
 * Restore the portable account archive into the authenticated account as
 * additive data. Existing data remains untouched.
 *
 * @param {Object} options - Restore inputs.
 * @param {CollectionRepository} options.repository - The collection repository.
 * @param {SessionScope} options.scope - The authenticated account scope.
 * @param {string} options.mediaRoot - Absolute media directory.
 * @param {Buffer} options.archive - ZIP archive bytes from the export flow.
 * @returns {Promise<AccountImportSummary>} Summary of imported objects.
 */
export async function importAccountExport({
	repository,
	scope,
	mediaRoot,
	archive
}: {
	repository: CollectionRepository;
	scope: SessionScope;
	mediaRoot: string;
	archive: Buffer;
}): Promise<AccountImportSummary> {
	const { manifest, entries } = verifyArchiveManifestFile(archive);
	const mediaFilesToImport = new Set<string>();
	for (const collection of manifest.collections) {
		for (const item of collection.items) {
			for (const image of item.images) {
				mediaFilesToImport.add(image.file);
			}
		}
	}
	for (const filePath of mediaFilesToImport) {
		if (!manifest.files[filePath]) {
			throw new Error('export archive is missing required file metadata');
		}
		const entry = entries.get(filePath);
		if (!entry) {
			throw new Error('export archive is missing a required file');
		}
		const payload = archivePathToBuffer(archive, entry);
		const metadata = manifest.files[filePath];
		if (payload.length !== metadata.bytes || hashBytes(payload) !== metadata.sha256) {
			throw new Error('export archive failed integrity checks');
		}
	}

	const importedMedia: ImportedMediaFile[] = [];
	const preparedMedia = new Map<string, string>();
	const saveMedia = async (filePath: string): Promise<string> => {
		const entry = entries.get(filePath);
		if (!entry) {
			throw new Error('export archive is missing a required file');
		}
		const payload = archivePathToBuffer(archive, entry);
		const mimeType = mimeTypeFromStorageKey(filePath);
		const candidateStorageKey = `${hashBytes(payload)}${storageKeyExtension(filePath)}`;
		const alreadyExisted = existsSync(join(mediaRoot, candidateStorageKey));
		const storageKey = await saveUploadedImage(mediaRoot, mimeType, payload);
		importedMedia.push({ path: filePath, storageKey, created: !alreadyExisted });
		preparedMedia.set(filePath, storageKey);
		return storageKey;
	};

	for (const filePath of mediaFilesToImport) {
		await saveMedia(filePath);
	}

	const summary: AccountImportSummary = {
		collectionsImported: 0,
		itemsImported: 0,
		imagesImported: 0
	};

	try {
		repository.transaction(() => {
			for (const exportedCollection of manifest.collections) {
				const collection = repository.createCollection({ name: exportedCollection.name }, scope);
				repository.updateStandIntro(collection.id, exportedCollection.standIntro, scope);
				summary.collectionsImported += 1;
				for (const exportedItem of [...exportedCollection.items].reverse()) {
					const item = repository.createItem(
						{
							collectionId: collection.id,
							title: exportedItem.title,
							priceCents: exportedItem.priceCents,
							category: exportedItem.category,
							condition: exportedItem.condition,
							internalNotes: exportedItem.internalNotes,
							externalDescription: exportedItem.externalDescription,
							isComplete: exportedItem.isComplete,
							isFunctional: exportedItem.isFunctional
						},
						scope
					);
					if (exportedItem.reservedAt) {
						repository.setItemReservation(item.id, true, scope);
					}
					if (exportedItem.saleChannel && exportedItem.soldAt && exportedItem.saleProceedsCents !== null) {
						repository.markItemSold(item.id, {
							channel: exportedItem.saleChannel,
							soldAt: exportedItem.soldAt,
							proceedsCents: exportedItem.saleProceedsCents
						}, scope);
					}
					let coverImageId: string | null = null;
					for (const exportedImage of exportedItem.images) {
						const storageKey = preparedMedia.get(exportedImage.file);
						if (!storageKey) {
							throw new Error('export archive is missing a required file');
						}
						const image = repository.addItemImage(item.id, storageKey, scope);
						if (exportedImage.isCover) {
							coverImageId = image.id;
						}
						summary.imagesImported += 1;
					}
					if (coverImageId) {
						repository.setItemCover(item.id, coverImageId, scope);
					}
					summary.itemsImported += 1;
				}
			}
		});
		return summary;
	} catch (error) {
		for (const media of importedMedia.reverse()) {
			if (media.created) {
				await removeStoredMedia(mediaRoot, media.storageKey);
			}
		}
		throw error;
	}
}
