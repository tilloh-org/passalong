import { afterEach, describe, expect, it } from 'vitest';
import { defaultLocale, getLocale, locales, setLocale, t } from './index.svelte';

describe('locale state', () => {
	afterEach(() => {
		setLocale(defaultLocale);
	});

	it('defaults to German', () => {
		// assume
		expect(getLocale()).toBe('de');
	});

	it('lists German first and English second', () => {
		// assume
		expect(locales).toEqual(['de', 'en']);
	});

	it('switches the active locale', () => {
		// act
		setLocale('en');

		// assume
		expect(getLocale()).toBe('en');
	});

	it('translates the navigation label in German and English', () => {
		// assume
		expect(t('nav.myStand')).toBe('Mein Stand');

		// act
		setLocale('en');

		// assume
		expect(t('nav.myStand')).toBe('My stand');
	});

	it('falls back to the key when no translation exists', () => {
		// act
		const text = t('missing.key');

		// assume
		expect(text).toBe('missing.key');
	});

	it('interpolates named params into translations', () => {
		// act
		const text = t('missing.key', { count: 3 });

		// assume
		expect(text).toBe('missing.key');
	});
});