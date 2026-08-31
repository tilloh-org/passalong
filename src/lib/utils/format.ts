/**
 * Format a price in cents as a localized currency string.
 * Neutral by design: no currency symbol, just number formatting.
 *
 * @param {number} cents - Price in cents; must be finite.
 * @param {string} [locale='de-DE'] - BCP 47 locale tag used for number formatting.
 * @returns {string} The localized price string with exactly two fraction digits.
 * @throws {Error} If `cents` is not a finite number.
 */
const centsPerEuro = 100;
const priceFractionDigitCount = 2;

export function formatPrice(cents: number, locale = 'de-DE'): string {
	if (!Number.isFinite(cents)) {
		throw new Error('formatPrice: cents must be a finite number');
	}
	return new Intl.NumberFormat(locale, {
		minimumFractionDigits: priceFractionDigitCount,
		maximumFractionDigits: priceFractionDigitCount
	}).format(cents / centsPerEuro);
}
