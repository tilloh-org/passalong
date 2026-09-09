/**
 * Client-side locale state for the visitor UI.
 *
 * Mirrors the theme persistence pattern: the locale is stored in
 * localStorage and applied reactively via a Svelte 5 rune. German is the
 * default; English is the only additional locale for now.
 */
const localeStorageKey = 'passalong-locale';

const german = 'de';
const english = 'en';

export type Locale = typeof german | typeof english;

export const defaultLocale: Locale = german;

export const locales: Locale[] = [german, english];

let currentLocale = $state<Locale>(defaultLocale);

/**
 * Read the persisted locale from localStorage and apply it.
 *
 * Must run in the browser only (guarded by the caller).
 */
export function initLocale(): void {
	if (typeof window === 'undefined') {
		return;
	}
	const saved = window.localStorage.getItem(localeStorageKey);
	currentLocale = saved === english ? english : defaultLocale;
}

/**
 * The currently active locale.
 */
export function getLocale(): Locale {
	return currentLocale;
}

/**
 * Switch the active locale and persist the choice.
 */
export function setLocale(locale: Locale): void {
	currentLocale = locale;
	if (typeof window !== 'undefined') {
		window.localStorage.setItem(localeStorageKey, locale);
	}
}

/**
 * Translate a key in the active locale.
 *
 * Falls back to German when a key has no English translation so a missing
 * entry never renders an empty string in production.
 */
export function t(key: string, params?: Record<string, string | number>): string {
	const dictionary = currentLocale === english ? en : de;
	let text = dictionary[key] ?? de[key] ?? key;
	if (params) {
		for (const [name, value] of Object.entries(params)) {
			text = text.replaceAll(`{${name}}`, String(value));
		}
	}
	return text;
}

const de: Record<string, string> = {
	'nav.scan': 'Scannen',
	'nav.myStand': 'Mein Stand',
	'nav.newItem': '+ Neu',
	'header.toggleTheme': 'Dark Mode umschalten',
	'header.themeTitle': 'Hell/Dunkel',
	'header.openProfile': 'Profil öffnen',
	'header.profileTitle': 'Profil',
	'header.language': 'Sprache',
	'header.languageTitle': 'Deutsch/English',
	'header.menuOpen': 'Menü öffnen',
	'header.menuClose': 'Menü schließen'
};

const en: Record<string, string> = {
	'nav.scan': 'Scan',
	'nav.myStand': 'My stand',
	'nav.newItem': '+ New',
	'header.toggleTheme': 'Toggle dark mode',
	'header.themeTitle': 'Light/dark',
	'header.openProfile': 'Open profile',
	'header.profileTitle': 'Profile',
	'header.language': 'Language',
	'header.languageTitle': 'German/English',
	'header.menuOpen': 'Open menu',
	'header.menuClose': 'Close menu'
};