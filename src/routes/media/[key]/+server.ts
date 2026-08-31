import { error } from '@sveltejs/kit';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { itemCategories, itemConditions, type SessionScope } from '$lib/server/collection-repository';
import { getMediaRoot } from '$lib/server/media-root';
import { getCollectionRepository } from '$lib/server/repository';
import { hashSessionToken } from '$lib/server/session-token';
import type { RequestHandler } from './$types';

const sessionCookieName = 'passalong_session';
const pngFileExtension = '.png';
const jpegFileExtension = '.jpg';
const pngMimeType = 'image/png';
const jpegMimeType = 'image/jpeg';
const webpMimeType = 'image/webp';

/**
 * Stream an uploaded image to an authenticated tenant-authorized viewer.
 *
 * @param {Parameters<RequestHandler>[0]} event - The SvelteKit request event.
 * @returns {Response} The image bytes or a 404 error.
 * @throws {HttpError} When the image is missing, not owned, or the session is invalid.
 */
export const GET: RequestHandler = ({ cookies, params }) => {
	const scope = getCollectionRepository().getSession(hashSessionToken(cookies.get(sessionCookieName) ?? ''));
	if (!scope) {
		throw error(404, 'image not found');
	}
	const image = getCollectionRepository().findImageMetadataForTenant(params.key, scope);
	if (!image) {
		throw error(404, 'image not found');
	}
	const storagePath = join(getMediaRoot(), image.storageKey);
	if (!isPathInsideMediaRoot(storagePath)) {
		throw error(404, 'image not found');
	}
	const filePayload = readFileSync(storagePath);
	return new Response(new Uint8Array(filePayload), {
		headers: {
			'Content-Type': getContentType(image.storageKey),
			'Cache-Control': 'private, no-store',
			'Content-Length': String(filePayload.length)
		}
	});
};

/**
 * Ensure a resolved storage path stays inside the configured media root.
 *
 * @param {string} storagePath - Absolute candidate path.
 * @returns {boolean} Whether the path resolves inside the media root.
 */
function isPathInsideMediaRoot(storagePath: string): boolean {
	const pathRelativeToMediaRoot = relative(getMediaRoot(), storagePath);
	return pathRelativeToMediaRoot.length > 0 && !pathRelativeToMediaRoot.startsWith('..') && !isAbsolute(pathRelativeToMediaRoot);
}

/**
 * Map a storage key extension to its safe response content type.
 *
 * @param {string} storageKey - Content-derived file name.
 * @returns {string} The verified image MIME type.
 */
function getContentType(storageKey: string): string {
	if (storageKey.endsWith(pngFileExtension)) {
		return pngMimeType;
	}
	if (storageKey.endsWith(jpegFileExtension)) {
		return jpegMimeType;
	}
	return webpMimeType;
}