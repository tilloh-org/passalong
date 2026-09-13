const itemRoutePrefix = '/items/';
const neutralQrRoutePrefix = '/q/';
const supportedRoutePrefixes = [itemRoutePrefix, neutralQrRoutePrefix] as const;

/**
 * Normalize a scanned value to an article route that is safe to navigate to.
 *
 * Accepts absolute article URLs, relative article paths, or bare item IDs.
 * Existing internal item URLs stay supported for previously printed labels;
 * bare IDs use the neutral QR route so the server can choose the right view.
 *
 * @param {string} rawValue - The scanned QR payload or manual input.
 * @param {string} origin - The current site origin used to resolve relative URLs.
 * @returns {string | null} A navigable article path or null when the value is unsupported.
 */
export function resolveArticleDetailPath(rawValue: string, origin: string): string | null {
	const trimmedValue = rawValue.trim();
	if (!trimmedValue) {
		return null;
	}

	const directPath = normalizeArticlePath(trimmedValue);
	if (directPath) {
		return directPath;
	}

	try {
		const url = new URL(trimmedValue, origin);
		const urlPath = normalizeArticlePath(url.pathname);
		if (urlPath) {
			return urlPath;
		}
	} catch {
		// Ignore invalid URLs and fall back to a bare article ID.
	}

	if (looksLikeArticleId(trimmedValue)) {
		return `${neutralQrRoutePrefix}${encodeURIComponent(trimmedValue)}`;
	}

	return null;
}

/**
 * Remove trailing slashes from a supported article path while preserving its identifier.
 *
 * @param {string} pathname - A possible internal item or neutral QR path.
 * @returns {string | null} Normalized route path or null for another route shape.
 */
function normalizeArticlePath(pathname: string): string | null {
	const prefix = supportedRoutePrefixes.find((candidate) => pathname.startsWith(candidate));
	if (!prefix) {
		return null;
	}
	const normalizedPath = pathname.replace(/\/+$/, '');
	const articleId = normalizedPath.slice(prefix.length);
	return articleId ? `${prefix}${articleId}` : null;
}

/**
 * Decide whether a free-form string could be a bare article ID.
 *
 * @param {string} value - A trimmed user input string.
 * @returns {boolean} True when the value has no whitespace or path separators.
 */
function looksLikeArticleId(value: string): boolean {
	return !value.includes('/') && !/\s/.test(value);
}
