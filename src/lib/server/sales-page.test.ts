import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionRepository } from '$lib/server/collection-repository';
import { hashSessionToken } from '$lib/server/session-token';

const temporaryDirectories: string[] = [];
const sessionCookieName = 'passalong_session';

function createDatabasePath(): string {
	const directory = mkdtempSync(join(tmpdir(), 'passalong-sales-page-'));
	temporaryDirectories.push(directory);
	return join(directory, 'passalong.sqlite');
}

function createSalesFixture() {
	const databasePath = createDatabasePath();
	const repository = createCollectionRepository({ databasePath });
	const scope = repository.createInitialAdmin({
		username: 'avery',
		displayName: 'Avery',
		passwordHash: 'scrypt$test-salt$test-key'
	});
	const collection = repository.createCollection({ name: 'Market stock' }, scope);
	const marketDay = repository.createMarketDay(
		{
			name: 'May market',
			date: '2026-05-16',
			startTime: null,
			endTime: null,
			location: '',
			notes: ''
		},
		scope
	);

	const vase = repository.createItem(
		{
			collectionId: collection.id,
			title: 'Vase',
			priceCents: 800,
			category: 'decor',
			condition: 'good',
			internalNotes: '',
			externalDescription: '',
			isComplete: false,
			isFunctional: false
		},
		scope
	);
	const book = repository.createItem(
		{
			collectionId: collection.id,
			title: 'Book',
			priceCents: 300,
			category: 'books',
			condition: 'good',
			internalNotes: '',
			externalDescription: '',
			isComplete: false,
			isFunctional: false
		},
		scope
	);
	repository.markItemSold(
		vase.id,
		{
			channel: 'flea-market',
			soldAt: '2026-05-16T10:00:00.000Z',
			proceedsCents: 750,
			marketDayId: marketDay.id
		},
		scope
	);
	repository.markItemSold(
		book.id,
		{
			channel: 'online-marketplace',
			soldAt: '2026-05-17T10:00:00.000Z',
			proceedsCents: 250
		},
		scope
	);
	const rawSessionToken = 'authenticated-sales-session-token';
	repository.createSessionForUser(scope, hashSessionToken(rawSessionToken));
	process.env.PASSALONG_DATABASE_PATH = databasePath;
	vi.resetModules();
	return { repository, scope, vase, book, marketDay, rawSessionToken };
}

function loadWithFilters(token: string | undefined, query: string): Promise<Record<string, unknown>> {
	return import('../../routes/sales/+page.server').then(({ load }) =>
		load({
			cookies: { get: (name: string) => (name === sessionCookieName ? token : undefined) },
			url: new URL(`http://localhost/sales${query}`)
		} as never) as Promise<Record<string, unknown>>
	);
}

afterEach(() => {
	vi.resetModules();
	delete process.env.PASSALONG_DATABASE_PATH;
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe('sales page', () => {
	it('redirects unauthenticated visitors to the login', async () => {
		// arrange
		createSalesFixture();
		let redirectOutcome: unknown;

		// act
		try {
			await loadWithFilters(undefined, '');
		} catch (error) {
			redirectOutcome = error;
		}

		// assume
		expect(redirectOutcome).toMatchObject({ status: 303, location: '/' });
	});

	it('loads owner-scoped sale history without filter values', async () => {
		// arrange
		const { vase, book, rawSessionToken } = createSalesFixture();

		// act
		const data = await loadWithFilters(rawSessionToken, '');

		// assume
		expect(data).toMatchObject({
			filters: { channel: null, category: null, proceedsMinCents: null, proceedsMaxCents: null },
			summary: { soldItemCount: 2, totalProceedsCents: 1000 },
			sales: [
				expect.objectContaining({ itemId: book.id }),
				expect.objectContaining({ itemId: vase.id })
			]
		});
	});

	it('loads owner-scoped sale history with validated channel and category filters', async () => {
		// arrange
		const { vase, rawSessionToken } = createSalesFixture();

		// act
		const data = await loadWithFilters(rawSessionToken, '?channel=flea-market&category=decor');

		// assume
		expect(data).toMatchObject({
			filters: { channel: 'flea-market', category: 'decor' },
			summary: { soldItemCount: 1, totalProceedsCents: 750 },
			sales: [expect.objectContaining({ itemId: vase.id })]
		});
	});

	it('loads owner-scoped sale history with a proceeds range filter', async () => {
		// arrange
		const { book, rawSessionToken } = createSalesFixture();

		// act
		const data = await loadWithFilters(rawSessionToken, '?proceedsMin=2,50&proceedsMax=3,00');

		// assume
		expect(data).toMatchObject({
			filters: { proceedsMinCents: 250, proceedsMaxCents: 300 },
			summary: { soldItemCount: 1, totalProceedsCents: 250 },
			sales: [expect.objectContaining({ itemId: book.id })]
		});
	});

	it('rejects invalid filter values with an empty result', async () => {
		// arrange
		const { rawSessionToken } = createSalesFixture();

		// act
		const invalidAmount = await loadWithFilters(rawSessionToken, '?proceedsMin=abc');
		const invertedRange = await loadWithFilters(rawSessionToken, '?proceedsMin=5&proceedsMax=2');

		// assume
		expect(invalidAmount).toMatchObject({
			invalidRange: true,
			sales: [],
			summary: { soldItemCount: 0 }
		});
		expect(invertedRange).toMatchObject({
			invalidRange: true,
			sales: [],
			summary: { soldItemCount: 0 }
		});
	});

	it('ignores unknown channel and category filter values', async () => {
		// arrange
		const { rawSessionToken } = createSalesFixture();

		// act
		const data = await loadWithFilters(rawSessionToken, '?channel=weapon&category=not-a-category');

		// assume
		expect(data).toMatchObject({
			filters: { channel: null, category: null },
			summary: { soldItemCount: 2 }
		});
	});
});
