/**
 * Check that an unsafe browser request declares the exact origin of its target URL.
 *
 * @param {Request} request - Incoming HTTP request.
 * @param {URL} url - Server-resolved request URL.
 * @returns {boolean} Whether a state-changing request is same-origin.
 */
export function hasSameOrigin(request: Request, url: URL): boolean {
	if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) {
		return true;
	}
	return request.headers.get('origin') === url.origin;
}
