import { describe, expect, it } from 'vitest';
import { fixtureArchive, fixtureUser } from '$lib/server/exchange-fixture.test-helper';
import { validateInstanceArchive } from '$lib/server/instance-import';

describe('field value validation', () => {
	it('refuses a market day with an impossible time', () => {
		// arrange — an unvalidated time reaches the database as free text.
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].marketDays[0].startTime = '99:99';
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/time/i);
	});

	it('refuses a market day with a free-text time', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].marketDays[0].endTime = 'garbage';
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/time/i);
	});

	it('refuses a market day with an impossible date', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].marketDays[0].date = '2026-02-31';
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/date/i);
	});

	it('refuses an expense with an impossible date', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].expenses[0].expenseDate = 'garbage';
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/date/i);
	});

	it('refuses an item with a negative sale proceeds value', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery', items: 1, soldItems: 1 });
		user.collections[0].items[0].saleProceedsCents = -500;
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/proceeds|price|amount/i);
	});

	it('refuses an item image with a negative position', () => {
		// arrange — a constraint violation would otherwise surface as raw SQLite text.
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].items[0].images[0].position = -3;
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/position/i);
	});

	it('refuses two images of one item that claim the same position', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].items[0].images.push({
			file: 'media/u1/photo-extra.jpg',
			isCover: false,
			position: 0
		});
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/position/i);
	});

	it('never reports a raw database error to the visitor', () => {
		// arrange — a violating archive must produce a written reason, not SQLite constraint text.
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].items[0].images[0].position = -1;
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		const text = report.errors.join(' ');
		expect(text).not.toMatch(/UNIQUE constraint|CHECK constraint|SQLITE_|constraint failed/i);
	});
});
