import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import sharp from 'sharp';

/**
 * Thumbnails: small derivatives of stored images, used wherever an image is rendered as a tile.
 *
 * A grid renders the same photo at roughly 180 px wide; serving the original costs the visitor
 * megabytes of transfer and the server a full-size decode per tile. A thumbnail is a derived file,
 * not a replacement: the original stays untouched and is still what the detail view serves.
 *
 * Thumbnails live in a subdirectory of the media root (`<media>/.thumbs/<key>-<size>w.<ext>`) rather
 * than beside the originals, so they cannot be mistaken for stored media during a restore, and they
 * are covered by the instance backup, whose media walk is recursive — the requirement is that
 * originals *and* thumbnails survive a restart.
 *
 * Thumbnails are never referenced from the database: the key and size are enough to find them, so an
 * instance restored from a backup without thumbnails simply regenerates them on the next request.
 */

/** Directory below the media root that holds derived thumbnails. */
const thumbnailDirectoryName = '.thumbs';

/** Largest thumbnail edge the caller may request. */
export const maximumThumbnailEdge = 1024;

/** Smallest thumbnail edge worth generating. */
const minimumThumbnailEdge = 32;

/** Quality of the encoded thumbnail. */
const thumbnailQuality = 78;

/** Extensions this module can produce a thumbnail for. */
const supportedExtensions = ['.jpg', '.png', '.webp'] as const;

/**
 * Resolve the thumbnail root below a media root.
 *
 * @param {string} mediaRoot - Absolute media root.
 * @returns {string} Absolute thumbnail root.
 */
export function thumbnailRootFor(mediaRoot: string): string {
	return join(mediaRoot, thumbnailDirectoryName);
}

/**
 * Derive the thumbnail file name for a stored key and edge length.
 *
 * @param {string} storageKey - Stored key, for example `abc123.jpg`.
 * @param {number} edge - Requested longest edge in pixels.
 * @returns {string} Thumbnail file name.
 * @throws {Error} When the key is not a plain supported image file name.
 */
export function thumbnailKeyFor(storageKey: string, edge: number): string {
	if (!isSupportedKey(storageKey)) {
		throw new Error('storage key is not a supported image file name');
	}
	const extension = storageKey.slice(storageKey.lastIndexOf('.'));
	const baseName = storageKey.slice(0, storageKey.length - extension.length);
	return `${baseName}-${clampEdge(edge)}w${extension}`;
}

/**
 * Resolve the absolute path of a thumbnail, refusing anything outside the thumbnail root.
 *
 * @param {string} mediaRoot - Absolute media root.
 * @param {string} storageKey - Stored key of the original.
 * @param {number} edge - Requested longest edge in pixels.
 * @returns {string} Absolute thumbnail path.
 * @throws {Error} When the key is unsupported or would escape the thumbnail root.
 */
export function thumbnailPathFor(mediaRoot: string, storageKey: string, edge: number): string {
	const root = resolve(thumbnailRootFor(mediaRoot));
	const candidate = resolve(root, thumbnailKeyFor(storageKey, edge));
	if (!candidate.startsWith(root + sep)) {
		throw new Error('thumbnail key escapes the thumbnail root');
	}
	return candidate;
}

/**
 * Recover the original storage key and edge from a thumbnail file name.
 *
 * This is the exact inverse of `thumbnailKeyFor`, which is what makes the naming a contract: the
 * delivery route never accepts a path, only a name it can prove it produced.
 *
 * @param {string} thumbnailName - Thumbnail file name, for example `abc123-480w.jpg`.
 * @returns {{ storageKey: string; edge: number } | null} Original key and edge, or null when the
 *   name is not a thumbnail name.
 */
export function parseThumbnailName(
	thumbnailName: string
): { storageKey: string; edge: number } | null {
	const match = /^(?<base>.+)-(?<edge>\d{1,5})w\.(?<extension>jpg|png|webp)$/i.exec(thumbnailName);
	if (!match?.groups) {
		return null;
	}
	const edge = Number.parseInt(match.groups.edge, 10);
	if (!Number.isFinite(edge) || edge <= 0) {
		return null;
	}
	const storageKey = `${match.groups.base}.${match.groups.extension.toLowerCase()}`;
	// A name is only a thumbnail name if it names a file in the thumbnail root: no separators, no
	// traversal. The route accepts a name, never a path.
	if (!isSupportedKey(storageKey)) {
		return null;
	}
	return { storageKey, edge };
}

/**
 * Read an existing thumbnail.
 *
 * @param {string} mediaRoot - Absolute media root.
 * @param {string} storageKey - Stored key of the original.
 * @param {number} edge - Requested longest edge in pixels.
 * @returns {Promise<Buffer | null>} Thumbnail bytes, or null when it has not been generated.
 */
export async function readThumbnail(
	mediaRoot: string,
	storageKey: string,
	edge: number
): Promise<Buffer | null> {
	const path = thumbnailPathFor(mediaRoot, storageKey, edge);
	if (!existsSync(path)) {
		return null;
	}
	try {
		return readFileSync(path);
	} catch {
		// A file that vanished between the check and the read is treated as not generated.
		return null;
	}
}

/**
 * Generate a thumbnail from an already-delivered image payload and store it.
 *
 * The caller passes the bytes the viewer would receive, so the orientation is already applied and
 * the thumbnail can never be sideways. The write is atomic: a crash mid-encode must not leave a
 * truncated file that later requests would happily serve.
 *
 * @param {string} mediaRoot - Absolute media root.
 * @param {string} storageKey - Stored key of the original.
 * @param {number} edge - Requested longest edge in pixels.
 * @param {Buffer} deliveredPayload - Bytes of the (orientation-applied) original.
 * @returns {Promise<string>} The thumbnail file name.
 * @throws {Error} When the payload cannot be decoded or written.
 */
export async function writeThumbnail(
	mediaRoot: string,
	storageKey: string,
	edge: number,
	deliveredPayload: Buffer
): Promise<string> {
	const path = thumbnailPathFor(mediaRoot, storageKey, edge);
	const thumbnail = await sharp(deliveredPayload, { failOn: 'error' })
		// `withoutEnlargement` keeps a small photo at its own size instead of inflating it.
		.resize({ width: clampEdge(edge), withoutEnlargement: true })
		.jpeg({ quality: thumbnailQuality })
		.toBuffer();
	mkdirSync(dirname(path), { recursive: true });
	const temporaryPath = `${path}.${process.pid}.tmp`;
	writeFileSync(temporaryPath, thumbnail);
	renameSync(temporaryPath, path);
	return thumbnailKeyFor(storageKey, edge);
}

/**
 * Clamp a requested edge into the supported range.
 *
 * @param {number} edge - Requested edge in pixels.
 * @returns {number} A usable edge length.
 * @throws {Error} When the edge is not a positive whole number.
 */
function clampEdge(edge: number): number {
	if (!Number.isInteger(edge) || edge <= 0) {
		throw new Error('thumbnail edge must be a positive whole number');
	}
	return Math.min(Math.max(edge, minimumThumbnailEdge), maximumThumbnailEdge);
}

/**
 * Decide whether a storage key is a plain supported image file name.
 *
 * @param {string} storageKey - Candidate key.
 * @returns {boolean} Whether a thumbnail can be derived for it.
 */
function isSupportedKey(storageKey: string): boolean {
	if (!storageKey || storageKey.includes('/') || storageKey.includes('\\')) {
		return false;
	}
	const lowered = storageKey.toLowerCase();
	return supportedExtensions.some(
		(extension) => lowered.endsWith(extension) && lowered.length > extension.length
	);
}
