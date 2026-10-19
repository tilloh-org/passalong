/**
 * Thumbnail URL construction for templates and components.
 *
 * This lives outside `$lib/server` because a Svelte component runs in the browser too: importing the
 * server module there is blocked by SvelteKit's boundary check, and rightly so. Naming is the only
 * thing the client needs to know; the sizes and the route are the shared contract.
 */

/** Longest edge used when a caller does not ask for a specific size. */
export const defaultThumbnailEdge = 480;

/** Thumbnail route prefix. */
const thumbnailRoute = '/thumb';

/** Extensions a thumbnail can be derived for. */
const supportedExtensions = ['.jpg', '.png', '.webp'] as const;

/**
 * Build the URL that serves a thumbnail of a stored image.
 *
 * The delivery route reverses exactly this naming, so the name and the requested size cannot drift
 * apart — the file name carries the size and the route reads it from there.
 *
 * @param {string} storageKey - Stored key of the original image.
 * @param {number} [edge] - Requested longest edge in pixels.
 * @returns {string} URL of the thumbnail.
 */
export function thumbnailUrl(storageKey: string, edge: number = defaultThumbnailEdge): string {
	const extensionIndex = storageKey.lastIndexOf('.');
	if (extensionIndex <= 0) {
		// Not a supported key: fall back to the original rather than producing a broken URL.
		return `/media/${encodeURIComponent(storageKey)}`;
	}
	const extension = storageKey.slice(extensionIndex).toLowerCase();
	const baseName = storageKey.slice(0, extensionIndex);
	if (!(supportedExtensions as readonly string[]).includes(extension)) {
		return `/media/${encodeURIComponent(storageKey)}`;
	}
	const name = `${baseName}-${Math.max(1, Math.trunc(edge))}w${extension}`;
	return `${thumbnailRoute}/${encodeURIComponent(name)}`;
}
