/**
 * Assemble the reconciliation of one market day as CSV: one row per sale,
 * followed by the totals of the day's settlement.
 *
 * The format follows the original app (header `Zeit,Artikel,Preis (€)`, comma
 * decimals), hardened against spreadsheet formula injection in user input.
 */

export interface MarketDayCsvSale {
	soldAt: string | null;
	title: string;
	proceedsCents: number | null;
}

export interface MarketDayCsvSettlement {
	totalProceedsCents: number;
	totalExpensesCents: number;
	netResultCents: number;
}

export interface MarketDayCsvInput {
	sales: MarketDayCsvSale[];
	settlement: MarketDayCsvSettlement;
}

const columnSeparator = ',';
const lineBreak = '\r\n';
const headerCells = ['Zeit', 'Artikel', 'Preis (€)'];
const proceedsLabel = 'Summe';
const expensesLabel = 'Ausgaben';
const netLabel = 'Netto';
/** Characters a spreadsheet reads as the start of a formula. */
const formulaLeadCharacters = ['=', '+', '-', '@', '\t', '\r'];
const formulaGuardPrefix = "'";
const amountFractionDigits = 2;
const amountDecimalSeparator = ',';
const fileNamePrefix = 'abrechnung-';
const fileNameFallbackSlug = 'markttag';
const fileNameMaxSlugLength = 60;
const quotedCellPattern = /[",\r\n]/;

/**
 * Neutralise a user-controlled cell that a spreadsheet would read as a formula.
 *
 * @param cell - The raw cell value.
 * @returns The cell value, prefixed with an apostrophe when it starts a formula.
 */
function escapeFormula(cell: string): string {
	if (cell.length > 0 && formulaLeadCharacters.includes(cell[0])) {
		return `${formulaGuardPrefix}${cell}`;
	}
	return cell;
}

/**
 * Format cents the way the file needs them: two decimals and a decimal comma.
 *
 * @param cents - The amount in cents.
 * @returns The amount as a spreadsheet number.
 */
function formatAmount(cents: number): string {
	return (cents / 100).toFixed(amountFractionDigits).replace('.', amountDecimalSeparator);
}

/**
 * Format an ISO timestamp as a local `DD.MM.YYYY HH:MM` value.
 *
 * @param isoTimestamp - The stored timestamp or null.
 * @returns The formatted timestamp, or an empty cell without a usable timestamp.
 */
function formatTimestamp(isoTimestamp: string | null): string {
	if (!isoTimestamp) {
		return '';
	}
	const timestamp = new Date(isoTimestamp);
	if (Number.isNaN(timestamp.getTime())) {
		return '';
	}
	const pad = (value: number) => String(value).padStart(2, '0');
	const date = `${pad(timestamp.getDate())}.${pad(timestamp.getMonth() + 1)}.${timestamp.getFullYear()}`;
	const time = `${pad(timestamp.getHours())}:${pad(timestamp.getMinutes())}`;
	return `${date} ${time}`;
}

/**
 * Quote one CSV cell when it contains a separator, a quote or a line break.
 *
 * @param cell - The cell value.
 * @returns The cell as it appears in the file.
 */
function formatCell(cell: string): string {
	if (quotedCellPattern.test(cell)) {
		return `"${cell.replaceAll('"', '""')}"`;
	}
	return cell;
}

/**
 * Format one CSV row.
 *
 * @param cells - The cells of the row.
 * @returns The row including its line break.
 */
function formatRow(cells: string[]): string {
	return `${cells.map(formatCell).join(columnSeparator)}${lineBreak}`;
}

/**
 * Build the complete CSV text of one market day.
 *
 * @param input - The day's sales and settlement totals.
 * @returns The CSV text, ready to download.
 */
export function buildMarketDayCsv({ sales, settlement }: MarketDayCsvInput): string {
	const rows = [formatRow(headerCells)];
	for (const sale of sales) {
		rows.push(
			formatRow([
				formatTimestamp(sale.soldAt),
				escapeFormula(sale.title),
				formatAmount(sale.proceedsCents ?? 0)
			])
		);
	}
	rows.push(formatRow(['', proceedsLabel, formatAmount(settlement.totalProceedsCents)]));
	if (settlement.totalExpensesCents !== 0) {
		rows.push(formatRow(['', expensesLabel, formatAmount(-settlement.totalExpensesCents)]));
		rows.push(formatRow(['', netLabel, formatAmount(settlement.netResultCents)]));
	}
	return rows.join('');
}

/**
 * Build the download name for one market day.
 *
 * The slug keeps ASCII letters, digits and single dashes only, so a day name
 * cannot inject characters into the `Content-Disposition` header.
 *
 * @param marketDayName - The name of the market day.
 * @returns The file name, ending in `.csv`.
 */
export function buildReconciliationFileName(marketDayName: string): string {
	const slug = marketDayName
		.normalize('NFKD')
		.replaceAll('ß', 'ss')
		.replaceAll(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, '-')
		.replaceAll(/^-+|-+$/g, '')
		.slice(0, fileNameMaxSlugLength)
		.replaceAll(/-+$/g, '');
	return `${fileNamePrefix}${slug || fileNameFallbackSlug}.csv`;
}
