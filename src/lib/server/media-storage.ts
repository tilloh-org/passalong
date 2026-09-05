import { accessSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { rm } from 'node:fs/promises';

export const maximumImageBytes = 5 * 1024 * 1024;
const digestEncoding = 'hex';

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpegSignature = Buffer.from([0xff, 0xd8, 0xff]);
const webpContainerSignature = Buffer.from('RIFF');
const webpFormatMarker = 'WEBP';
const webpFormatMarkerOffset = 8;
const webpFormatMarkerLength = 4;

const supportedTypes = [
	{
		mimeType: 'image/png',
		extension: 'png',
		hasSignature(payload: Buffer): boolean {
			return payload.subarray(0, pngSignature.length).equals(pngSignature);
		}
	},
	{
		mimeType: 'image/jpeg',
		extension: 'jpg',
		hasSignature(payload: Buffer): boolean {
			return payload.subarray(0, jpegSignature.length).equals(jpegSignature);
		}
	},
	{
		mimeType: 'image/webp',
		extension: 'webp',
		hasSignature(payload: Buffer): boolean {
			return (
				payload.subarray(0, webpContainerSignature.length).equals(webpContainerSignature) &&
				payload.subarray(webpFormatMarkerOffset, webpFormatMarkerOffset + webpFormatMarkerLength).toString('latin1') === webpFormatMarker
			);
		}
	}
] as const;

/**
 * Persist an uploaded image under a content-derived key inside the media root.
 *
 * @param {string} mediaRoot - Absolute directory that stores image files.
 * @param {string} declaredMimeType - MIME type claimed by the upload.
 * @param {Buffer} payload - Raw uploaded bytes.
 * @returns {Promise<string>} Storage key relative to the media root.
 * @throws {Error} When the upload is empty, unsupported, oversized, or not a real image.
 */
export async function saveUploadedImage(
	mediaRoot: string,
	declaredMimeType: string,
	payload: Buffer
): Promise<string> {
	const type = supportedTypes.find((candidate) => candidate.mimeType === declaredMimeType);
	if (!type) {
		throw new Error('upload is not a supported image type');
	}
	if (payload.length === 0) {
		throw new Error('upload is empty');
	}
	if (payload.length > maximumImageBytes) {
		throw new Error('image exceeds the allowed size');
	}
	if (!type.hasSignature(payload)) {
		throw new Error('upload is not a supported image');
	}

	const digest = createHash('sha256').update(payload).digest(digestEncoding);
	const storageKey = `${digest}.${type.extension}`;
	const destination = join(mediaRoot, storageKey);

	await mkdir(dirname(destination), { recursive: true });
	await writeFile(destination, payload, { flag: payloadAlreadyExists(mediaRoot, storageKey) ? 'w' : 'wx' });
	return storageKey;
}

function payloadAlreadyExists(mediaRoot: string, storageKey: string): boolean {
	try {
		accessSync(join(mediaRoot, storageKey));
		return true;
	} catch {
		return false;
	}
}

/**
 * Remove a stored media file from the media root.
 *
 * Rejects paths that escape the media root so tenant keys cannot delete arbitrary files.
 *
 * @param {string} mediaRoot - Absolute directory that stores image files.
 * @param {string} storageKey - Storage key relative to the media root.
 * @returns {Promise<void>} Resolves when the file is gone or was never present.
 */
export async function removeStoredMedia(mediaRoot: string, storageKey: string): Promise<void> {
	const normalizedRoot = resolve(mediaRoot);
	const target = resolve(normalizedRoot, storageKey);
	if (!target.startsWith(normalizedRoot + sep)) {
		throw new Error('storage key escapes the media root');
	}
	await rm(target, { force: true });
}