import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import type { Sharp } from 'sharp';

/**
 * Image delivery: the single place where stored image bytes are prepared for a viewer.
 *
 * Everything is stored exactly as it arrived — uploads, account transfers, instance archives and
 * restores all write the received bytes unchanged, so a storage key always names the content that is
 * on disk. Cameras record the display rotation in an EXIF `Orientation` tag instead of rotating the
 * pixels, and not every consumer honours that tag: a browser does for `<img>`, a print sheet, a
 * thumbnail pass or an export does not. Baking the rotation into the pixels therefore happens here,
 * once, on the way out, which keeps it correct for every channel that ever wrote a file — including
 * media that was stored before this rule existed.
 */

/** EXIF orientation value describing an upright image; nothing has to be applied. */
const uprightOrientation = 1;

/** Image type read from a storage key when the caller cannot derive one. */
const defaultMimeType = 'image/jpeg';

/**
 * An image prepared for delivery.
 *
 * @typedef {object} DeliveredImage
 * @property {Buffer} payload - Bytes to send to the viewer.
 * @property {string} mimeType - Content type of those bytes.
 * @property {boolean} rotated - Whether the EXIF orientation was applied.
 */

/**
 * Read a stored image and apply its recorded orientation, if any.
 *
 * The returned bytes carry no metadata block, which also removes EXIF fields such as a GPS position
 * from a photo that an operator may publish on a public stand page.
 *
 * An image that needs no rotation is returned exactly as stored, so the common case costs a metadata
 * read and no re-encode. An image that cannot be decoded is served unchanged rather than withheld:
 * its bytes passed signature and size validation when it was accepted.
 *
 * @param {string} storagePath - Absolute path of the stored image.
 * @param {string} [mimeType] - Content type to encode into; defaults by extension.
 * @returns {Promise<DeliveredImage>} Bytes ready to send.
 */
export async function readImageForDelivery(
	storagePath: string,
	mimeType?: string
): Promise<{ payload: Buffer; mimeType: string; rotated: boolean }> {
	const stored = readFileSync(storagePath);
	const targetMimeType = mimeType ?? mimeTypeFromPath(storagePath);
	try {
		const normalized = await normalizeImageOrientation(stored, targetMimeType);
		return normalized;
	} catch {
		// Not decodable: serve it as stored instead of turning a listed image into a 404.
		return { payload: stored, mimeType: targetMimeType, rotated: false };
	}
}

/**
 * Apply the EXIF orientation of an image to its pixels and drop its metadata.
 *
 * @param {Buffer} payload - Stored image bytes.
 * @param {string} [mimeType] - Mime type to encode into; the payload's own format is kept when this
 *   is omitted or names an unsupported type.
 * @returns {Promise<DeliveredImage>} Bytes with the orientation applied, and whether it was.
 * @throws {Error} When the payload cannot be decoded as an image.
 */
export async function normalizeImageOrientation(
	payload: Buffer,
	mimeType?: string
): Promise<{ payload: Buffer; mimeType: string; rotated: boolean }> {
	const image = sharp(payload, { failOn: 'error' });
	let metadata;
	try {
		metadata = await image.metadata();
	} catch {
		throw new Error('image could not be read');
	}
	if (!metadata.width || !metadata.height) {
		throw new Error('image could not be read');
	}
	const targetMimeType = mimeTypeFor(mimeType, metadata.format);
	if (!metadata.orientation || metadata.orientation === uprightOrientation) {
		return { payload, mimeType: targetMimeType, rotated: false };
	}

	// `.rotate()` with no argument applies the EXIF orientation and drops the tag. No `withMetadata()`
	// call follows, so no metadata block is written and EXIF (including GPS) is gone.
	const rotated = await encode(image.rotate(), targetMimeType);
	return { payload: rotated, mimeType: targetMimeType, rotated: true };
}

/**
 * Resolve the mime type to encode into.
 *
 * @param {string | undefined} requestedMimeType - Mime type the caller asked for, if any.
 * @param {string | undefined} detectedFormat - Format sharp detected in the payload.
 * @returns {string} The mime type to encode into.
 */
function mimeTypeFor(
	requestedMimeType: string | undefined,
	detectedFormat: string | undefined
): string {
	if (
		requestedMimeType === 'image/png' ||
		requestedMimeType === 'image/webp' ||
		requestedMimeType === 'image/jpeg'
	) {
		return requestedMimeType;
	}
	if (detectedFormat === 'png' || detectedFormat === 'webp') {
		return `image/${detectedFormat}`;
	}
	return defaultMimeType;
}

/**
 * Derive a content type from a storage key extension.
 *
 * @param {string} storagePath - Path or key of the stored image.
 * @returns {string} The matching image mime type.
 */
function mimeTypeFromPath(storagePath: string): string {
	if (storagePath.endsWith('.png')) {
		return 'image/png';
	}
	if (storagePath.endsWith('.webp')) {
		return 'image/webp';
	}
	return defaultMimeType;
}

/**
 * Encode a sharp pipeline into the given mime type.
 *
 * @param {Sharp} pipeline - Prepared pipeline, orientation already applied.
 * @param {string} mimeType - Mime type to encode into.
 * @returns {Promise<Buffer>} Encoded image bytes.
 */
async function encode(pipeline: Sharp, mimeType: string): Promise<Buffer> {
	switch (mimeType) {
		case 'image/png':
			return pipeline.png().toBuffer();
		case 'image/webp':
			return pipeline.webp().toBuffer();
		default:
			return pipeline.jpeg().toBuffer();
	}
}
