import { error } from '@sveltejs/kit';
import { isAbsolute, join, relative } from 'node:path';
import { readImageForDelivery } from '$lib/server/image-delivery';
import { getMediaRoot } from '$lib/server/media-root';
import { getCollectionRepository } from '$lib/server/repository';
import { hashSessionToken } from '$lib/server/session-token';
import {
	maximumThumbnailEdge,
	parseThumbnailName,
	readThumbnail,
	writeThumbnail
} from '$lib/server/thumbnails';
import type { RequestHandler } from './$types';

const sessionCookieName = 'passalong_session';

/**
 * Serve a small derivative of a stored image for tiles and grids.
 *
 * Authorization is intentionally identical to `/media/<key>`: a thumbnail is the same picture, so it
 * must not become a way around the tenant scoping, the public-stand rule, or the disappearance of a
 * sold item's images. The caller names the original key; this route derives the thumbnail name from
 * it and never accepts a path.
 *
 * @param {Parameters<RequestHandler>[0]} event - The SvelteKit request event.
 * @returns {Response} The thumbnail bytes or a 404 error.
 * @throws {HttpError} When the original is missing, not owned, or the session is invalid.
 */
export const GET: RequestHandler = async ({ cookies, params }) => {
	const repository = getCollectionRepository();
	const parsed = parseThumbnailName(params.key);
	if (!parsed) {
		throw error(404, 'image not found');
	}
	const { storageKey } = parsed;
	const edge = Math.min(parsed.edge, maximumThumbnailEdge);
	const sessionToken = cookies.get(sessionCookieName) ?? '';
	const scope = sessionToken ? repository.getSession(hashSessionToken(sessionToken)) : null;
	const image = scope ? repository.findImageMetadataForTenant(storageKey, scope) : null;
	const isProfileAvatar =
		scope && !image ? repository.findProfileAvatarForTenant(storageKey, scope) : false;
	let isPublic = false;
	if (!image && !isProfileAvatar) {
		if (repository.findPublicItemImage(storageKey)) {
			isPublic = true;
		} else if (repository.findPublicOwnerAvatar(storageKey)) {
			isPublic = true;
		} else {
			throw error(404, 'image not found');
		}
	}

	const mediaRoot = getMediaRoot();
	const originalPath = join(mediaRoot, storageKey);
	if (!isPathInsideMediaRoot(originalPath)) {
		throw error(404, 'image not found');
	}

	// Generate on first request: a cached thumbnail is a file read, and an instance restored without
	// thumbnails simply rebuilds them.
	let thumbnail = await readThumbnail(mediaRoot, storageKey, edge);
	if (!thumbnail) {
		const delivered = await readImageForDelivery(originalPath, contentTypeFor(storageKey));
		try {
			await writeThumbnail(mediaRoot, storageKey, edge, delivered.payload);
		} catch {
			// Derived data is an optimization: an image that cannot be thumbnailed is still served,
			// just at full size.
			return imageResponse(delivered.payload, delivered.mimeType, isPublic);
		}
		thumbnail = await readThumbnail(mediaRoot, storageKey, edge);
	}
	if (!thumbnail) {
		throw error(404, 'image not found');
	}
	return imageResponse(thumbnail, 'image/jpeg', isPublic);
};

/**
 * Build the response for image bytes.
 *
 * @param {Buffer} payload - Bytes to send.
 * @param {string} mimeType - Content type.
 * @param {boolean} isPublic - Whether the image is visible to anonymous visitors.
 * @returns {Response} The image response.
 */
function imageResponse(payload: Buffer, mimeType: string, isPublic: boolean): Response {
	return new Response(new Uint8Array(payload), {
		headers: {
			'Content-Type': mimeType,
			'Cache-Control': isPublic ? 'public, max-age=3600' : 'private, no-store',
			'Content-Length': String(payload.length)
		}
	});
}

/**
 * Ensure a resolved storage path stays inside the configured media root.
 *
 * @param {string} storagePath - Absolute candidate path.
 * @returns {boolean} Whether the path resolves inside the media root.
 */
function isPathInsideMediaRoot(storagePath: string): boolean {
	const pathRelativeToMediaRoot = relative(getMediaRoot(), storagePath);
	return (
		pathRelativeToMediaRoot.length > 0 &&
		!pathRelativeToMediaRoot.startsWith('..') &&
		!isAbsolute(pathRelativeToMediaRoot)
	);
}

/**
 * Map a storage key extension to its content type.
 *
 * @param {string} storageKey - Content-derived file name.
 * @returns {string} The verified image MIME type.
 */
function contentTypeFor(storageKey: string): string {
	if (storageKey.endsWith('.png')) {
		return 'image/png';
	}
	if (storageKey.endsWith('.webp')) {
		return 'image/webp';
	}
	return 'image/jpeg';
}
