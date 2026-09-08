import { fail, redirect } from '@sveltejs/kit';
import { hasSameOrigin } from '$lib/server/csrf';
import { getCollectionRepository } from '$lib/server/repository';
import { getDatabasePath } from '$lib/server/repository';
import { getMediaRoot } from '$lib/server/media-root';
import { restoreInstanceBackup } from '$lib/server/backup';
import { createSessionToken, hashSessionToken } from '$lib/server/session-token';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import type { SessionScope } from '$lib/server/collection-repository';
import type { Actions, PageServerLoad } from './$types';

const sessionCookieName = 'passalong_session';
const httpStatus = {
	seeOther: 303,
	badRequest: 400,
	unauthorized: 401,
	forbidden: 403,
	notFound: 404
} as const;
const csrfError = 'Diese Anfrage konnte nicht sicher verarbeitet werden.';
const millisecondsPerSecond = 1000;
const secondsPerMinute = 60;
const minutesPerHour = 60;
const hoursPerDay = 24;
const passwordResetLifetimeHours = 1;
const passwordResetLifetimeMilliseconds = passwordResetLifetimeHours * minutesPerHour * secondsPerMinute * millisecondsPerSecond;

/**
 * Load instance administration data for instance admins only.
 *
 * Non-admins (and anonymous visitors) are redirected to the portfolio so the
 * administration surface is only reachable by authorized users. Exception: a
 * request arriving via the create-password-reset form action (SvelteKit appends
 * the action marker) is allowed to render once with the issued one-time secret,
 * even when the admin just reset their own account and thereby revoked their
 * session.
 *
 * @param event - The SvelteKit load event.
 * @returns The instance administration page data.
 */
export const load: PageServerLoad = ({ cookies, url }) => {
	const token = cookies.get(sessionCookieName);
	const scope = token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
	const arrivingFromResetAction = url.searchParams.has('/createPasswordReset');
	if (!scope && !arrivingFromResetAction) {
		redirect(httpStatus.seeOther, '/');
	}
	if (scope && !getCollectionRepository().isInstanceAdmin(scope)) {
		redirect(httpStatus.seeOther, '/');
	}
	return {};
};

export const actions: Actions = {
	createPasswordReset: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { passwordResetIssueError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}
		const repository = getCollectionRepository();
		if (!repository.isInstanceAdmin(scope)) {
			return fail(httpStatus.forbidden, { passwordResetIssueError: 'Du bist nicht für die Instanzverwaltung berechtigt.' });
		}

		try {
			const resetSecret = createSessionToken();
			const resetCreated = repository.createPasswordResetForUsername(
				getFormText(await request.formData(), 'username'),
				hashSessionToken(resetSecret),
				new Date(Date.now() + passwordResetLifetimeMilliseconds).toISOString()
			);
			if (!resetCreated) {
				return fail(httpStatus.notFound, { passwordResetIssueError: 'Das angegebene Konto wurde nicht gefunden.' });
			}
			return { passwordResetSecret: resetSecret };
		} catch (error) {
			return fail(httpStatus.badRequest, { passwordResetIssueError: getErrorMessage(error) });
		}
	},

	restoreBackup: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { backupError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}
		if (!getCollectionRepository().isInstanceAdmin(scope)) {
			return fail(httpStatus.notFound, { backupError: 'Backup nicht gefunden.' });
		}

		const formData = await request.formData();
		const upload = formData.get('backupArchive');
		if (!(upload instanceof File) || upload.size === 0) {
			return fail(httpStatus.badRequest, { backupError: 'Bitte wähle eine Backup-Datei aus.' });
		}

		const stagingPath = join(getMediaRoot(), '..', `restore-upload-${Date.now()}.zip`);
		writeFileSync(stagingPath, Buffer.from(await upload.arrayBuffer()));
		try {
			const outcome = await restoreInstanceBackup({
				archivePath: stagingPath,
				databasePath: getDatabasePath(),
				mediaRoot: getMediaRoot()
			});
			if (!outcome.restored) {
				return fail(httpStatus.badRequest, { backupError: 'Die Backup-Datei ist ungültig. Die Instanz wurde nicht verändert.' });
			}
		} finally {
			rmSync(stagingPath, { force: true });
		}

		redirect(httpStatus.seeOther, '/instanzverwaltung');
	}
};

/**
 * Resolve a cookie token to an active tenant/user scope.
 *
 * @param {string | undefined} token - Raw session cookie value.
 * @returns {SessionScope | null} Active scope or null.
 */
function getSessionScope(token: string | undefined): SessionScope | null {
	return token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
}

function getFormText(formData: FormData, name: string): string {
	const value = formData.get(name);
	return typeof value === 'string' ? value : '';
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Unbekannter Fehler.';
}
