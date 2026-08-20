import { describe, expect, it } from 'vitest';
import { formatPrice } from './format';

describe('formatPrice', () => {
	it('formats whole euros with two decimals', () => {
		expect(formatPrice(1500)).toBe('15,00');
	});

	it('formats cents below one euro', () => {
		expect(formatPrice(99)).toBe('0,99');
	});

	it('formats zero', () => {
		expect(formatPrice(0)).toBe('0,00');
	});

	it('formats large amounts without exponent notation', () => {
		expect(formatPrice(123456789)).toBe('1.234.567,89');
	});

	it('throws on non-finite input', () => {
		expect(() => formatPrice(Number.NaN)).toThrow();
		expect(() => formatPrice(Number.POSITIVE_INFINITY)).toThrow();
	});
});
