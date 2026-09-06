const articleRoutePrefix = '/artikel/';

/**
 * Normalize a scanned value to a seller-facing article detail route.
 *
 * Accepts absolute article URLs, relative article paths, or bare item IDs.
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

	if (trimmedValue.startsWith(articleRoutePrefix)) {
		return normalizeArticlePath(trimmedValue);
	}
	if (trimmedValue.startsWith('artikel/')) {
		return normalizeArticlePath(`/${trimmedValue}`);
	}

	try {
		const url = new URL(trimmedValue, origin);
		if (url.pathname.startsWith(articleRoutePrefix)) {
			return normalizeArticlePath(url.pathname);
		}
	} catch {
		// Ignore invalid URLs and fall back to a bare article ID.
	}

	if (looksLikeArticleId(trimmedValue)) {
		return `${articleRoutePrefix}${encodeURIComponent(trimmedValue)}`;
	}

	return null;
}

/**
 * Remove a trailing slash from a valid article path while preserving the item ID.
 *
 * @param {string} pathname - A path that starts with `/artikel/`.
 * @returns {string | null} Normalized route path or null when the path does not include an ID.
 */
function normalizeArticlePath(pathname: string): string | null {
	const normalizedPath = pathname.replace(/\/+$/, '');
	const articleId = normalizedPath.slice(articleRoutePrefix.length);
	if (!articleId) {
		return null;
	}
	return `${articleRoutePrefix}${articleId}`;
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
