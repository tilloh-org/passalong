import type { RequestHandler } from '@sveltejs/kit';
import { createAccountExport } from '$lib/server/account-transfer';
import { getCollectionRepository } from '$lib/server/repository';
import { getMediaRoot } from '$lib/server/media-root';
import { hashSessionToken } from '$lib/server/session-token';

const sessionCookieName = 'passalong_session';

function getSessionScope(token: string | undefined) {
	return token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
}

/**
 * Download the authenticated account data as a ZIP archive.
 */
export const GET: RequestHandler = async ({ cookies }) => {
	const scope = getSessionScope(cookies.get(sessionCookieName));
	if (!scope) {
		return new Response('Unauthorized', { status: 401 });
	}

	const { zip } = await createAccountExport(getCollectionRepository(), scope, getMediaRoot());
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	return new Response(new Uint8Array(zip), {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="passalong-account-export-${timestamp}.zip"`,
			'cache-control': 'private, no-store'
		}
	});
};
