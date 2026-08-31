import { describe, expect, it } from 'vitest';
import { formatPrice } from './format';

describe('formatPrice', () => {
	it('formats whole euros with two decimals', () => {
		// arrange
		const priceCents = 1500;

		// act
		const formattedPrice = formatPrice(priceCents);

		// assume
		expect(formattedPrice).toBe('15,00');
	});

	it('formats cents below one euro', () => {
		// arrange
		const priceCents = 99;

		// act
		const formattedPrice = formatPrice(priceCents);

		// assume
		expect(formattedPrice).toBe('0,99');
	});

	it('formats zero', () => {
		// arrange
		const priceCents = 0;

		// act
		const formattedPrice = formatPrice(priceCents);

		// assume
		expect(formattedPrice).toBe('0,00');
	});

	it('formats large amounts without exponent notation', () => {
		// arrange
		const priceCents = 123456789;

		// act
		const formattedPrice = formatPrice(priceCents);

		// assume
		expect(formattedPrice).toBe('1.234.567,89');
	});

	it('throws on non-finite input', () => {
		// arrange
		const invalidPrices = [Number.NaN, Number.POSITIVE_INFINITY];

		// act
		const formattingErrors = invalidPrices.map((priceCents) => {
			try {
				formatPrice(priceCents);
				return undefined;
			} catch (error) {
				return error;
			}
		});

		// assume
		for (const formattingError of formattingErrors) {
			expect(formattingError).toBeInstanceOf(Error);
		}
	});
});
