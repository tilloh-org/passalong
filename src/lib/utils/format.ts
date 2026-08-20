/**
 * Format a price in cents as a localized currency string.
 * Neutral by design: no currency symbol, just number formatting.
 */
export function formatPrice(cents: number, locale = 'de-DE'): string {
	if (!Number.isFinite(cents)) {
		throw new Error('formatPrice: cents must be a finite number');
	}
	return new Intl.NumberFormat(locale, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(cents / 100);
}
