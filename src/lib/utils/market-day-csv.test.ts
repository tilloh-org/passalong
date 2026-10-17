import { describe, expect, it } from 'vitest';
import { buildMarketDayCsv, buildReconciliationFileName } from './market-day-csv';

describe('market-day reconciliation CSV', () => {
	it('writes the header, one row per sale and the totals of the day', () => {
		// arrange
		const sales = [
			{
				soldAt: new Date(2026, 9, 17, 15, 3).toISOString(),
				title: 'Leselampe',
				proceedsCents: 950
			},
			{
				soldAt: new Date(2026, 9, 17, 15, 41).toISOString(),
				title: 'Bücherstapel',
				proceedsCents: 1200
			}
		];
		const settlement = {
			totalProceedsCents: 2150,
			totalExpensesCents: 1500,
			netResultCents: 650
		};

		// act
		const csv = buildMarketDayCsv({ sales, settlement });

		// assume
		expect(csv.split('\r\n').filter(Boolean)).toEqual([
			'Zeit,Artikel,Preis (€)',
			'17.10.2026 15:03,Leselampe,"9,50"',
			'17.10.2026 15:41,Bücherstapel,"12,00"',
			',Summe,"21,50"',
			',Ausgaben,"-15,00"',
			',Netto,"6,50"'
		]);
	});

	it('omits the expense and net rows for a day without expenses', () => {
		// act
		const csv = buildMarketDayCsv({
			sales: [
				{ soldAt: new Date(2026, 9, 17, 15, 3).toISOString(), title: 'Hocker', proceedsCents: 500 }
			],
			settlement: { totalProceedsCents: 500, totalExpensesCents: 0, netResultCents: 500 }
		});

		// assume
		expect(csv).not.toContain('Ausgaben');
		expect(csv).not.toContain('Netto');
		expect(csv).toContain(',Summe,"5,00"');
	});

	it('neutralises a title that a spreadsheet would read as a formula', () => {
		// arrange
		const formulaTitles = ['=1+1', '+SUM(A1:A9)', '-2+3', '@cmd', '\t=1+1'];

		// act
		const csv = buildMarketDayCsv({
			sales: formulaTitles.map((title) => ({
				soldAt: new Date(2026, 9, 17, 15, 3).toISOString(),
				title,
				proceedsCents: 100
			})),
			settlement: { totalProceedsCents: 500, totalExpensesCents: 0, netResultCents: 500 }
		});

		// assume
		for (const title of formulaTitles) {
			expect(csv).toContain(`'${title}`);
		}
	});

	it('keeps generated amounts numeric and quotes titles with separators or quotes', () => {
		// act
		const csv = buildMarketDayCsv({
			sales: [
				{
					soldAt: new Date(2026, 9, 17, 15, 3).toISOString(),
					title: 'Buch "Der Sommer", Band 2',
					proceedsCents: 100
				}
			],
			settlement: { totalProceedsCents: 100, totalExpensesCents: 1500, netResultCents: -1400 }
		});

		// assume
		expect(csv).toContain('"Buch ""Der Sommer"", Band 2"');
		expect(csv).toContain(',Ausgaben,"-15,00"');
		expect(csv).toContain(',Netto,"-14,00"');
		expect(csv).not.toContain("'-15,00");
	});

	it('leaves the time cell empty without a usable sale timestamp', () => {
		// act
		const csv = buildMarketDayCsv({
			sales: [
				{ soldAt: null, title: 'Tasse', proceedsCents: 300 },
				{ soldAt: 'keine Zeit', title: 'Teller', proceedsCents: 400 }
			],
			settlement: { totalProceedsCents: 700, totalExpensesCents: 0, netResultCents: 700 }
		});

		// assume
		expect(csv).toContain(',Tasse,"3,00"');
		expect(csv).toContain(',Teller,"4,00"');
	});

	it('builds an ASCII-only file name from the market-day name', () => {
		// act + assume
		expect(buildReconciliationFileName('Flohmarkt am See')).toBe('abrechnung-flohmarkt-am-see.csv');
		expect(buildReconciliationFileName('Bücher & Trödel')).toBe('abrechnung-bucher-trodel.csv');
		expect(buildReconciliationFileName('Straßenfest "Süd"')).toBe(
			'abrechnung-strassenfest-sud.csv'
		);
		expect(buildReconciliationFileName('Größe 5/8: Test')).toBe('abrechnung-grosse-5-8-test.csv');
	});

	it('falls back to a neutral file name without a usable day name', () => {
		// act + assume
		expect(buildReconciliationFileName('   ')).toBe('abrechnung-markttag.csv');
		expect(buildReconciliationFileName('###')).toBe('abrechnung-markttag.csv');
		expect(buildReconciliationFileName('Tag\r\nInjected: x')).toContain('abrechnung-tag');
		expect(buildReconciliationFileName('Tag\r\nInjected: x')).not.toContain('\r');
	});
});
