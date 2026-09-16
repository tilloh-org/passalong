import sharp from 'sharp';
import type { Sharp } from 'sharp';

/**
 * EXIF orientation normalization for uploaded and imported images.
 *
 * Cameras store a photo in sensor order and record how it must be rotated for display in the EXIF
 * `Orientation` tag. Browsers honour that tag for `<img>`, but a second consumer — a print sheet, a
 * thumbnail generator, an export — may not, so the stored file itself has to be upright.
 *
 * Normalizing therefore means baking the orientation into the pixels once, at the boundary where an
 * image enters the instance. The result carries no EXIF block at all, which also removes GPS
 * coordinates and camera identifiers from an image the operator may publish on a stand page.
 */

/** EXIF orientation value that describes an upright image; nothing has to be baked in. */
const uprightOrientation = 1;

/**
 * Result of normalizing one image.
 *
 * @typedef {object} NormalizedImage
 * @property {Buffer} payload - The bytes to store.
 * @property {string} mimeType - Mime type of the stored bytes.
 * @property {boolean} changed - Whether the payload differs from the input.
 */

/**
 * Bake the EXIF orientation into the pixels of an image.
 *
 * An image that is already upright, or that carries no orientation at all, is returned unchanged:
 * storage keys are derived from the content, so re-encoding a correct image would change the key of
 * every existing file for no benefit. The caller compares `changed` to decide whether to write.
 *
 * @param {Buffer} payload - Raw uploaded or archived image bytes.
 * @param {string} [mimeType] - Mime type to encode into. When omitted, or when it is not one of the
 *   supported image types, the format detected in the payload is kept.
 * @returns {Promise<NormalizedImage>} The normalized payload and whether it changed.
 * @throws {Error} When the payload cannot be decoded as an image.
 */
export async function normalizeImageOrientation(
	payload: Buffer,
	mimeType?: string
): Promise<{ payload: Buffer; mimeType: string; changed: boolean }> {
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
		return { payload, mimeType: targetMimeType, changed: false };
	}

	// `.rotate()` with no argument applies the EXIF orientation and drops the tag. No `withMetadata()`
	// call follows, so no metadata block is written and EXIF (including GPS) is gone.
	const normalized = await encode(image.rotate(), targetMimeType);
	return { payload: normalized, mimeType: targetMimeType, changed: true };
}

/**
 * Resolve the mime type to encode into.
 *
 * The declared type is used when it names a supported image type; otherwise the format libvips
 * detected in the payload is kept, so an archive entry without a trustworthy mime type is still
 * re-encoded into its own format rather than converted.
 *
 * @param {string | undefined} declaredMimeType - Mime type the caller declared, if any.
 * @param {string | undefined} detectedFormat - Format sharp detected in the payload.
 * @returns {string} The mime type to encode into.
 */
function mimeTypeFor(
	declaredMimeType: string | undefined,
	detectedFormat: string | undefined
): string {
	if (
		declaredMimeType === 'image/png' ||
		declaredMimeType === 'image/webp' ||
		declaredMimeType === 'image/jpeg'
	) {
		return declaredMimeType;
	}
	if (detectedFormat === 'png' || detectedFormat === 'webp') {
		return `image/${detectedFormat}`;
	}
	return 'image/jpeg';
}

/**
 * Encode a sharp pipeline back into the mime type the caller declared.
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
