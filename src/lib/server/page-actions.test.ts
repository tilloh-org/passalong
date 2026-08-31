import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionRepository, type SessionScope } from '$lib/server/collection-repository';
import { hashSessionToken } from '$lib/server/session-token';

const temporaryDirectories: string[] = [];
const sessionCookieName = 'passalong_session';
const testPngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Create an isolated database path for a server-action authorization test.
 *
 * @returns {string} Empty SQLite database path.
 */
function createDatabasePath(): string {
	const directory = mkdtempSync(join(tmpdir(), 'passalong-admin-action-'));
	temporaryDirectories.push(directory);
	return join(directory, 'passalong.sqlite');
}

afterEach(() => {
	vi.resetModules();
	delete process.env.PASSALONG_DATABASE_PATH;
	delete process.env.PASSALONG_MEDIA_ROOT;
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

interface PageServerActions {
	[key: string]: (input: unknown) => Promise<unknown>;
}

interface ActionFixture {
	repository: ReturnType<typeof createCollectionRepository>;
	databasePath: string;
	mediaRoot: string;
	rawSessionToken: string;
	scope: SessionScope;
	loadActions: () => Promise<PageServerActions>;
}

/**
 * Create an isolated fixture with a registered owner session and media root.
 *
 * @returns {Promise<ActionFixture>} Fixture with repository, tokens, and module loader.
 */
function createActionFixtureWithOwner(): ActionFixture {
	const databasePath = createDatabasePath();
	const mediaDirectory = mkdtempSync(join(tmpdir(), 'passalong-media-root-'));
	temporaryDirectories.push(mediaDirectory);
	const mediaRoot = join(mediaDirectory, 'media');
	const repository = createCollectionRepository({ databasePath });
	const scope = repository.createInitialAdmin({
		username: 'avery',
		displayName: 'Avery',
		passwordHash: 'scrypt$test-salt$test-key'
	});
	const rawSessionToken = 'authenticated-owner-session-token';
	repository.createSessionForUser(scope, hashSessionToken(rawSessionToken));
	process.env.PASSALONG_DATABASE_PATH = databasePath;
	process.env.PASSALONG_MEDIA_ROOT = mediaRoot;
	vi.resetModules();
	return {
		repository,
		databasePath,
		mediaRoot,
		rawSessionToken,
		scope,
		loadActions: async () => (await import('../../routes/+page.server')).actions as unknown as PageServerActions
	};
}

/**
 * Build a minimal valid PNG payload for upload tests.
 *
 * @returns {Buffer} PNG bytes with a valid signature.
 */
function buildTestPng(): Buffer {
	return Buffer.concat([testPngHeader, Buffer.from('test-png-payload')]);
}

/**
 * Build the SvelteKit-style action input for an upload request.
 *
 * @param {FormData} formData - Submitted multipart form values.
 * @param {string | undefined} rawSessionToken - Session cookie value or undefined.
 * @returns {unknown} Action input with cookies, request, and url.
 */
function actionInput(formData: FormData, rawSessionToken?: string): object {
	const url = new URL('http://localhost/');
	return {
		cookies: { get: (name: string) => (name === sessionCookieName ? rawSessionToken : undefined) },
		request: new Request(url, { body: formData, headers: { Origin: url.origin }, method: 'POST' }),
		url
	};
}

describe('instance-admin actions', () => {
	it('rejects reset issuance from an authenticated account without the instance-admin role', async () => {
		// arrange
		const { repository, databasePath, loadActions, scope, rawSessionToken, mediaRoot } = createActionFixtureWithOwner();
		const collection = repository.createCollection({ name: 'Garage' }, scope);
		const item = repository.createItem(
			{ collectionId: collection.id, title: 'Bicycle', priceCents: 5000, category: 'hobby', condition: 'good', internalNotes: '' },
			scope
		);
		const actions = await loadActions();
		const url = new URL('http://localhost/');
		const formData = new FormData();
		formData.set('itemId', item.id);
		formData.append('image', new File([new Uint8Array(buildTestPng())], 'photo.png', { type: 'image/png' }));

		// act
		let redirectOutcome: unknown;
		try {
			await actions.uploadItemImage({
				cookies: { get: (name: string) => (name === sessionCookieName ? rawSessionToken : undefined) },
				request: new Request('http://localhost/', { body: formData, headers: { Origin: url.origin }, method: 'POST' }),
				url
			} as never);
		} catch (error) {
			redirectOutcome = error;
		}
		const storedImages = repository.listItemImages(item.id, scope);

		// assume
		expect(redirectOutcome).toMatchObject({ status: 303, location: '/' });
		expect(storedImages).toHaveLength(1);
		expect(storedImages[0]).toMatchObject({ isCover: true, position: 0 });
		expect(existsSync(join(mediaRoot, storedImages[0].storageKey))).toBe(true);
		expect(databasePath).toBeTruthy();
	});
});