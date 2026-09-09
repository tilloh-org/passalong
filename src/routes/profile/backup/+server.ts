import { error } from '@sveltejs/kit';
import { getMediaRoot } from '$lib/server/media-root';
import { getCollectionRepository, getDatabasePath } from '$lib/server/repository';
import { createInstanceBackup } from '$lib/server/backup';
import { hashSessionToken } from '$lib/server/session-token';
import type { RequestHandler } from './$types';

const sessionCookieName = 'passalong_session';
const httpStatus = {
	unauthorized: 401,
	forbidden: 403,
	notFound: 404
} as const;
const backupContentDispositionPrefix = 'attachment; filename="passalong-backup-';
const backupContentDispositionSuffix = '.zip"';

/**
 * Stream a complete instance backup as a ZIP archive to an instance admin.
 *
 * @param {Parameters<RequestHandler>[0]} event - The request event.
 * @returns {Promise<Response>} The ZIP archive response.
 * @throws {import('@sveltejs/kit').HttpError} 404 for non-admins, 401 without session.
 */
export const GET: RequestHandler = async ({ cookies }) => {
	const scope = cookies.get(sessionCookieName)
		? getCollectionRepository().getSession(hashSessionToken(cookies.get(sessionCookieName)!))
		: null;
	if (!scope) {
		throw error(httpStatus.unauthorized, 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');
	}
	if (!getCollectionRepository().isInstanceAdmin(scope)) {
		throw error(httpStatus.notFound, 'Backup nicht gefunden');
	}

	const archive = await createInstanceBackup({ databasePath: getDatabasePath(), mediaRoot: getMediaRoot() });
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	return new Response(new Uint8Array(archive.zip), {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `${backupContentDispositionPrefix}${timestamp}${backupContentDispositionSuffix}`,
			'Cache-Control': 'private, no-store'
		}
	});
};