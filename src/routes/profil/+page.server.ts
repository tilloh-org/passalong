import { fail, redirect } from '@sveltejs/kit';
import { hasSameOrigin } from '$lib/server/csrf';
import { maximumPasswordLength, minimumPasswordLength } from '$lib/password-policy';
import { getMediaRoot } from '$lib/server/media-root';
import { saveUploadedImage, removeStoredMedia } from '$lib/server/media-storage';
import { createInstanceBackup, restoreInstanceBackup } from '$lib/server/backup';
import { getDatabasePath } from '$lib/server/repository';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { hashPassword, validatePassword, verifyPassword } from '$lib/server/password';
import { getCollectionRepository } from '$lib/server/repository';
import { createSessionToken, hashSessionToken } from '$lib/server/session-token';
import type { Cookies } from '@sveltejs/kit';
import type { SessionScope } from '$lib/server/collection-repository';
import { Buffer } from 'node:buffer';
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
const invalidCredentialsError = 'Das aktuelle Passwort ist nicht korrekt.';
const maximumAvatarBytes = 2 * 1024 * 1024;
const supportedAvatarTypes = ['image/png', 'image/jpeg', 'image/webp'] as const;
const genericProfileError = 'Die Änderung konnte nicht gespeichert werden. Bitte prüfe die Angaben.';

/**
 * Resolve a cookie token to an active tenant/user scope.
 *
 * @param {string | undefined} token - Raw session cookie value.
 * @returns {SessionScope | null} Active scope or null.
 */
function getSessionScope(token: string | undefined): SessionScope | null {
	return token ? getCollectionRepository().getSession(hashSessionToken(token)) : null;
}

const sessionMaxAgeSeconds = 30 * 24 * 60 * 60;

/**
 * Persist a server-side session hash and set the hardened browser cookie.
 *
 * @param {Cookies} cookies - SvelteKit cookie helper.
 * @param {SessionScope} scope - Authenticated user and tenant scope.
 * @param {URL} url - Resolved request URL for the secure-cookie decision.
 * @returns {void}
 */
function setSessionCookie(cookies: Cookies, scope: SessionScope, url: URL): void {
	const token = createSessionToken();
	getCollectionRepository().createSessionForUser(scope, hashSessionToken(token));
	cookies.set(sessionCookieName, token, {
		httpOnly: true,
		path: '/',
		sameSite: 'lax',
		secure: url.protocol === 'https:' || process.env.NODE_ENV === 'production',
		maxAge: sessionMaxAgeSeconds
	});
}


/**
 * Read a string value from form data and normalize absent values to an empty string.
 *
 * @param {FormData} formData - Submitted form values.
 * @param {string} field - Field name to read.
 * @returns {string} The trimmed value or an empty string.
 */
function getFormText(formData: FormData, field: string): string {
	const value = formData.get(field);
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * Load the authenticated user's profile for the profile page.
 *
 * @param {Parameters<PageServerLoad>[0]} event - The SvelteKit load event.
 * @returns {Promise<{ profile: import('$lib/server/collection-repository').UserProfile; minimumPasswordLength: number; maximumPasswordLength: number }>} Profile data.
 * @throws {import('@sveltejs/kit').Redirect} To the login page for anonymous visitors.
 */
export const load: PageServerLoad = ({ cookies }) => {
	const scope = getSessionScope(cookies.get(sessionCookieName));
	if (!scope) {
		redirect(httpStatus.seeOther, '/');
	}
	const profile = getCollectionRepository().getProfile(scope);
	if (!profile) {
		redirect(httpStatus.seeOther, '/');
	}
	const collections = getCollectionRepository().listCollectionsForOwner(scope);
	const activeCollection = collections[0] ?? null;
	return {
		profile,
		activeCollection,
		isInstanceAdmin: getCollectionRepository().isInstanceAdmin(scope),
		minimumPasswordLength,
		maximumPasswordLength
	};
};

export const actions: Actions = {
	updateProfile: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { updateProfileError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}

		const formData = await request.formData();
		try {
			getCollectionRepository().updateProfile(scope, { displayName: getFormText(formData, 'displayName') });
		} catch (error) {
			return fail(httpStatus.badRequest, { updateProfileError: profileActionError(error) });
		}

		redirect(httpStatus.seeOther, '/profil');
	},

	uploadAvatar: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { avatarError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}

		const formData = await request.formData();
		const upload = formData.get('avatar');
		if (!(upload instanceof File) || upload.size === 0) {
			return fail(httpStatus.badRequest, { avatarError: 'Bitte wähle ein Bild aus.' });
		}
		if (upload.size > maximumAvatarBytes) {
			return fail(httpStatus.badRequest, { avatarError: 'Das Bild ist zu groß (maximal 2 MB).' });
		}
		if (!(supportedAvatarTypes as readonly string[]).includes(upload.type)) {
			return fail(httpStatus.badRequest, { avatarError: 'Das Bild entspricht nicht einem unterstützten Format.' });
		}

		try {
			const payload = Buffer.from(await upload.arrayBuffer());
			const storageKey = await saveUploadedImage(getMediaRoot(), upload.type, payload);
			const previous = getCollectionRepository().getProfile(scope);
			getCollectionRepository().setProfileAvatar(scope, storageKey);
			if (previous?.avatarStorageKey && previous.avatarStorageKey !== storageKey) {
				await removeStoredMedia(getMediaRoot(), previous.avatarStorageKey);
			}
		} catch (error) {
			return fail(httpStatus.badRequest, { avatarError: profileActionError(error) });
		}

		redirect(httpStatus.seeOther, '/profil');
	},

	removeAvatar: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { avatarError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}

		try {
			const previous = getCollectionRepository().getProfile(scope);
			getCollectionRepository().setProfileAvatar(scope, null);
			if (previous?.avatarStorageKey) {
				await removeStoredMedia(getMediaRoot(), previous.avatarStorageKey);
			}
		} catch (error) {
			return fail(httpStatus.badRequest, { avatarError: profileActionError(error) });
		}

		redirect(httpStatus.seeOther, '/profil');
	},

	deleteAccount: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { deleteAccountError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}

		const formData = await request.formData();
		const confirmUsername = getFormText(formData, 'confirmUsername');
		const profile = getCollectionRepository().getProfile(scope);
		if (!profile) {
			return fail(httpStatus.unauthorized, { deleteAccountError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}
		if (confirmUsername.toLowerCase() !== profile.username) {
			return fail(httpStatus.badRequest, { deleteAccountError: 'Bitte gib deinen Benutzernamen zur Bestätigung ein.' });
		}

		try {
			const artifacts = getCollectionRepository().deleteAccount(scope);
			if (artifacts.avatarStorageKey) {
				await removeStoredMedia(getMediaRoot(), artifacts.avatarStorageKey);
			}
			cookies.delete(sessionCookieName, { path: '/' });
		} catch (error) {
			return fail(httpStatus.badRequest, { deleteAccountError: profileActionError(error) });
		}

		redirect(httpStatus.seeOther, '/');
	},

	changePassword: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { changePasswordError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}
		const formData = await request.formData();
		try {
			const currentPasswordHash = getCollectionRepository().getPasswordHashForScope(scope);
			if (!currentPasswordHash || !(await verifyPassword(getFormText(formData, 'currentPassword'), currentPasswordHash))) {
				return fail(httpStatus.badRequest, { changePasswordError: invalidCredentialsError });
			}
			const password = getFormText(formData, 'password');
			validatePassword(password);
			const repository = getCollectionRepository();
			repository.updatePassword(scope, await hashPassword(password));
			repository.revokeSessionsForUser(scope);
			setSessionCookie(cookies, scope, url);
		} catch (error) {
			return fail(httpStatus.badRequest, { changePasswordError: getProfileErrorMessage(error) });
		}
		redirect(httpStatus.seeOther, '/profil');
	},

	restoreBackup: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		if (!getSessionScope(cookies.get(sessionCookieName)) || !getCollectionRepository().isInstanceAdmin(getSessionScope(cookies.get(sessionCookieName))!)) {
			return fail(httpStatus.notFound, { backupError: 'Backup nicht gefunden.' });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { backupError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
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

		redirect(httpStatus.seeOther, '/profil');
	},

	saveStandIntro: async ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const scope = getSessionScope(cookies.get(sessionCookieName));
		if (!scope) {
			return fail(httpStatus.unauthorized, { standIntroError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
		}

		const formData = await request.formData();
		try {
			getCollectionRepository().updateStandIntro(getFormText(formData, 'collectionId'), getFormText(formData, 'standIntro'), scope);
		} catch (error) {
			return fail(httpStatus.badRequest, { standIntroError: 'Die Einleitung konnte nicht gespeichert werden.' });
		}

		redirect(httpStatus.seeOther, '/profil');
	},

	logout: ({ cookies, request, url }) => {
		if (!hasSameOrigin(request, url)) {
			return fail(httpStatus.forbidden, { csrfError });
		}
		const token = cookies.get(sessionCookieName);
		if (token) {
			getCollectionRepository().revokeSession(hashSessionToken(token));
		}
		cookies.delete(sessionCookieName, { path: '/' });
		redirect(httpStatus.seeOther, '/');
	}
};

/**
 * Map profile action failures to fixed German messages without leaking internals.
 *
 * @param {unknown} error - The thrown value.
 * @returns {string} A safe user-facing message.
 */
function profileActionError(error: unknown): string {
	if (error instanceof Error && error.message.includes('displayName')) {
		return 'Bitte gib einen Anzeigenamen ein.';
	}
	return genericProfileError;
}

/**
 * Map password-change failures to German user-facing messages without leaking internals.
 *
 * @param {unknown} error - The thrown value.
 * @returns {string} A safe user-facing message.
 */
function getProfileErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.toLowerCase().includes('password must')) {
		return `Das Passwort muss mindestens ${minimumPasswordLength} Zeichen lang sein.`;
	}
	if (error instanceof Error && error.message.includes('password')) {
		return 'Das Passwort entspricht nicht den Anforderungen.';
	}
	return 'Das Passwort konnte nicht geändert werden. Bitte versuche es erneut.';
}
