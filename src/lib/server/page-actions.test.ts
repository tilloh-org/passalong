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
	loadDetailActions: () => Promise<PageServerActions>;
	loadPage: () => Promise<(input: unknown) => unknown>;
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
		loadActions: async () => (await import('../../routes/+page.server')).actions as unknown as PageServerActions,
		loadDetailActions: async () => (await import('../../routes/artikel/[id]/+page.server')).actions as unknown as PageServerActions,
		loadPage: async () => (await import('../../routes/+page.server')).load as unknown as (input: unknown) => unknown
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
		const { repository, databasePath, loadDetailActions, scope, rawSessionToken, mediaRoot } = createActionFixtureWithOwner();
		const collection = repository.createCollection({ name: 'Garage' }, scope);
		const item = repository.createItem(
			{ collectionId: collection.id, title: 'Bicycle', priceCents: 5000, category: 'hobby', condition: 'good', internalNotes: '',
			externalDescription: '',
			isComplete: false,
			isFunctional: false },
			scope
		);
		const actions = await loadDetailActions();
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
		expect(redirectOutcome).toMatchObject({ status: 303, location: `/artikel/${encodeURIComponent(item.id)}` });
		expect(storedImages).toHaveLength(1);
		expect(storedImages[0]).toMatchObject({ isCover: true, position: 0 });
		expect(existsSync(join(mediaRoot, storedImages[0].storageKey))).toBe(true);
		expect(databasePath).toBeTruthy();
	});

	it('stores several uploaded images at once with the first as cover', async () => {
		// arrange
		const { repository, loadDetailActions, scope, rawSessionToken, mediaRoot } = createActionFixtureWithOwner();
		const collection = repository.createCollection({ name: 'Flohmarkt' }, scope);
		const item = repository.createItem(
			{ collectionId: collection.id, title: 'Vase', priceCents: 800, category: 'decor', condition: 'good', internalNotes: '',
			externalDescription: '',
			isComplete: false,
			isFunctional: false },
			scope
		);
		const actions = await loadDetailActions();
		const url = new URL('http://localhost/');
		const formData = new FormData();
		formData.set('itemId', item.id);
		const sidePng = buildTestPng();
		sidePng[sidePng.length - 1] = (sidePng[sidePng.length - 1] + 1) % 256;
		formData.append('image', new File([new Uint8Array(buildTestPng())], 'front.png', { type: 'image/png' }));
		formData.append('image', new File([new Uint8Array(sidePng)], 'side.png', { type: 'image/png' }));

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
		expect(redirectOutcome).toMatchObject({ status: 303, location: `/artikel/${encodeURIComponent(item.id)}` });
		expect(storedImages).toHaveLength(2);
		expect(storedImages.map((image) => image.position)).toEqual([0, 1]);
		expect(storedImages.filter((image) => image.isCover)).toHaveLength(1);
		for (const image of storedImages) {
			expect(existsSync(join(mediaRoot, image.storageKey))).toBe(true);
		}
	});

	it('marks an owned item sold through the form action and rejects anonymous callers', async () => {
		// arrange
		const { repository, loadDetailActions, scope, rawSessionToken } = createActionFixtureWithOwner();
		const collection = repository.createCollection({ name: 'Flohmarkt' }, scope);
		const item = repository.createItem(
			{ collectionId: collection.id, title: 'Vase', priceCents: 800, category: 'decor', condition: 'good', internalNotes: '',
			externalDescription: '',
			isComplete: false,
			isFunctional: false },
			scope
		);
		const actions = await loadDetailActions();
		const url = new URL('http://localhost/');
		const saleParameters = {
			itemId: item.id,
			channel: 'flea-market',
			soldAt: '2026-08-31T10:30:00.000Z',
			proceedsCents: '750'
		};
		const saleForm = new URLSearchParams(saleParameters);

		// act
		let redirectOutcome: unknown;
		let anonymousOutcome: unknown;
		try {
			await actions.markItemSold({
				cookies: { get: (name: string) => (name === sessionCookieName ? rawSessionToken : undefined) },
				request: new Request(url, {
					body: saleForm,
					headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: url.origin },
					method: 'POST'
				}),
				url
			} as never);
		} catch (error) {
			redirectOutcome = error;
		}
		try {
			anonymousOutcome = await actions.markItemSold({
				cookies: { get: () => undefined },
				request: new Request(url, {
					body: new URLSearchParams(saleParameters),
					headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: url.origin },
					method: 'POST'
				}),
				url
			} as never);
		} catch (error) {
			anonymousOutcome = error;
		}
		const itemAfterSale = repository.listItemsForOwner(collection.id, scope)[0];
		const reopenedItem = repository.unmarkItemSold(item.id, scope);

		// assume
		expect(redirectOutcome).toMatchObject({ status: 303, location: `/artikel/${encodeURIComponent(item.id)}` });
		expect(anonymousOutcome).toMatchObject({ status: 401, data: { saleStatusError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' } });
		expect(itemAfterSale).toMatchObject({
			saleChannel: 'flea-market',
			soldAt: '2026-08-31T10:30:00.000Z',
			saleProceedsCents: 750
		});
		expect(reopenedItem).toMatchObject({ saleChannel: null, soldAt: null, saleProceedsCents: null });
	});

	it('exposes owner-scoped sale statistics through the page load for authenticated sessions', async () => {
		// arrange
		const { repository, loadPage, scope, rawSessionToken } = createActionFixtureWithOwner();
		const collection = repository.createCollection({ name: 'Flohmarkt' }, scope);
		const item = repository.createItem(
			{ collectionId: collection.id, title: 'Vase', priceCents: 800, category: 'decor', condition: 'good', internalNotes: '',
			externalDescription: '',
			isComplete: false,
			isFunctional: false },
			scope
		);
		repository.markItemSold(item.id, { channel: 'flea-market', soldAt: '2026-08-31T10:30:00.000Z', proceedsCents: 750 }, scope);
		const load = await loadPage();
		const url = new URL('http://localhost/');

		// act
		const authenticatedData = (await load({
			cookies: { get: (name: string) => (name === sessionCookieName ? rawSessionToken : undefined) },
			url
		} as never)) as { saleStatistics?: { soldItemCount: number; totalProceedsCents: number } };
		const anonymousData = (await load({
			cookies: { get: () => undefined },
			url
		} as never)) as { saleStatistics?: unknown };

		// assume
		expect(authenticatedData.saleStatistics).toEqual({
			soldItemCount: 1,
			totalProceedsCents: 750,
			proceedsByChannel: [{ channel: 'flea-market', soldItemCount: 1, totalProceedsCents: 750 }],
			proceedsByMonth: [{ month: '2026-08', soldItemCount: 1, totalProceedsCents: 750 }]
		});
		expect(anonymousData.saleStatistics).toBeUndefined();
	});
	it('registers a quick sale with price proceeds through the card action and rejects anonymous callers', async () => {
		// arrange
		const { repository, loadActions, scope, rawSessionToken } = createActionFixtureWithOwner();
		const collection = repository.createCollection({ name: 'Flohmarkt' }, scope);
		const item = repository.createItem(
			{ collectionId: collection.id, title: 'Vase', priceCents: 800, category: 'decor', condition: 'good', internalNotes: '',
			externalDescription: '',
			isComplete: false,
			isFunctional: false },
			scope
		);
		const actions = await loadActions();
		const url = new URL('http://localhost/');

		// act
		let redirectOutcome: unknown;
		let anonymousOutcome: unknown;
		try {
			await actions.quickSellItem({
				cookies: { get: (name: string) => (name === sessionCookieName ? rawSessionToken : undefined) },
				request: new Request(url, {
					body: new URLSearchParams({ itemId: item.id }),
					headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: url.origin },
					method: 'POST'
				}),
				url
			} as never);
		} catch (error) {
			redirectOutcome = error;
		}
		try {
			anonymousOutcome = await actions.quickSellItem({
				cookies: { get: () => undefined },
				request: new Request(url, {
					body: new URLSearchParams({ itemId: item.id }),
					headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: url.origin },
					method: 'POST'
				}),
				url
			} as never);
		} catch (error) {
			anonymousOutcome = error;
		}
		const itemAfterSale = repository.listItemsForOwner(collection.id, scope)[0];

		// assume
		expect(redirectOutcome).toMatchObject({ status: 303, location: '/' });
		expect(anonymousOutcome).toMatchObject({ status: 401, data: { saleStatusError: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' } });
		expect(itemAfterSale).toMatchObject({ saleChannel: 'flea-market', saleProceedsCents: 800 });
		expect(itemAfterSale.soldAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
	});
});
