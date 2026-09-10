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

function actionInput(formData: URLSearchParams, rawSessionToken?: string, origin = 'http://localhost'): object {
	const url = new URL('http://localhost/sales');
	return {
		cookies: { get: (name: string) => (name === sessionCookieName ? rawSessionToken : undefined) },
		request: new Request(url, {
			body: formData,
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
			method: 'POST'
		}),
		url
	};
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
		{ name: 'May market', date: '2026-05-16', startTime: null, endTime: null, location: '', notes: '' },
		scope
	);
	const item = repository.createItem(
		{ collectionId: collection.id, title: 'Vase', priceCents: 800, category: 'decor', condition: 'good', internalNotes: '', externalDescription: '', isComplete: false, isFunctional: false },
		scope
	);
	repository.markItemSold(item.id, {
		channel: 'flea-market',
		soldAt: '2026-05-16T10:00:00.000Z',
		proceedsCents: 750,
		marketDayId: marketDay.id
	}, scope);
	const rawSessionToken = 'authenticated-sales-session-token';
	repository.createSessionForUser(scope, hashSessionToken(rawSessionToken));
	process.env.PASSALONG_DATABASE_PATH = databasePath;
	vi.resetModules();
	return { repository, scope, item, marketDay, rawSessionToken };
}

afterEach(() => {
	vi.resetModules();
	delete process.env.PASSALONG_DATABASE_PATH;
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe('sales page', () => {
	it('rejects unauthenticated sale corrections with a localizable error code', async () => {
		// arrange
		createSalesFixture();
		const { actions } = await import('../../routes/sales/+page.server');

		// act
		const outcome = await actions.updateSale(actionInput(new URLSearchParams({
			itemId: 'unavailable',
			channel: 'flea-market',
			proceedsEuros: '7,00'
		})) as never);

		// assume
		expect(outcome).toMatchObject({ status: 401, data: { saleHistoryError: 'sessionExpired' } });
	});

	it('rejects cross-origin sale corrections with a localizable error code', async () => {
		// arrange
		const { item, rawSessionToken } = createSalesFixture();
		const { actions } = await import('../../routes/sales/+page.server');

		// act
		const outcome = await actions.updateSale(actionInput(new URLSearchParams({
			itemId: item.id,
			channel: 'flea-market',
			proceedsEuros: '7,00'
		}), rawSessionToken, 'https://attacker.example') as never);

		// assume
		expect(outcome).toMatchObject({ status: 403, data: { saleHistoryError: 'csrf' } });
	});

	it('loads owner-scoped sale history with validated filters', async () => {
		// arrange
		const { item, marketDay, rawSessionToken } = createSalesFixture();
		const { load } = await import('../../routes/sales/+page.server');
		const url = new URL(`http://localhost/sales?marketDayId=${encodeURIComponent(marketDay.id)}&channel=flea-market`);

		// act
		const data = await load({
			cookies: { get: (name: string) => (name === sessionCookieName ? rawSessionToken : undefined) },
			url
		} as never);

		// assume
		expect(data).toMatchObject({
			filters: { marketDayId: marketDay.id, channel: 'flea-market' },
			summary: { soldItemCount: 1, totalProceedsCents: 750 },
			marketDays: [expect.objectContaining({ id: marketDay.id, name: 'May market' })],
			sales: [expect.objectContaining({ itemId: item.id, marketDayId: marketDay.id })]
		});
	});

	it('updates sale details through a same-origin owner action', async () => {
		// arrange
		const { repository, scope, item, rawSessionToken } = createSalesFixture();
		const secondMarketDay = repository.createMarketDay(
			{ name: 'June market', date: '2026-06-20', startTime: null, endTime: null, location: '', notes: '' },
			scope
		);
		const { actions } = await import('../../routes/sales/+page.server');
		let redirectOutcome: unknown;

		// act
		try {
			await actions.updateSale(actionInput(new URLSearchParams({
				itemId: item.id,
				channel: 'private-sale',
				proceedsEuros: '7,00',
				marketDayId: secondMarketDay.id
			}), rawSessionToken) as never);
		} catch (error) {
			redirectOutcome = error;
		}

		// assume
		expect(redirectOutcome).toMatchObject({ status: 303, location: '/sales' });
		expect(repository.getItemForOwner(item.id, scope)).toMatchObject({
			saleChannel: 'private-sale',
			saleProceedsCents: 700,
			marketDayId: secondMarketDay.id
		});
	});

	it('reopens a sold item through a same-origin owner action', async () => {
		// arrange
		const { repository, scope, item, rawSessionToken } = createSalesFixture();
		const { actions } = await import('../../routes/sales/+page.server');
		let redirectOutcome: unknown;

		// act
		try {
			await actions.reopenItem(actionInput(new URLSearchParams({ itemId: item.id }), rawSessionToken) as never);
		} catch (error) {
			redirectOutcome = error;
		}

		// assume
		expect(redirectOutcome).toMatchObject({ status: 303, location: '/sales' });
		expect(repository.getItemForOwner(item.id, scope)).toMatchObject({
			saleChannel: null,
			soldAt: null,
			saleProceedsCents: null,
			marketDayId: null
		});
	});
});
