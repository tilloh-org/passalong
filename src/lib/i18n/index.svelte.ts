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
	'header.menuClose': 'Menü schließen',
	'portfolio.metaDescription': 'Verwalte deine Sammlung von Dingen, die weiterziehen dürfen.',
	'portfolio.welcomeEyebrow': 'Willkommen',
	'portfolio.setupTitle': 'Ersten Zugang erstellen',
	'portfolio.setupIntro': 'Erstelle das Admin-Konto für deine persönliche passalong-Instanz.',
	'portfolio.welcomeBackEyebrow': 'Willkommen zurück',
	'portfolio.loginTitle': 'Anmelden',
	'portfolio.loginIntro': 'Melde dich an, um deine Sammlungen zu verwalten.',
	'portfolio.username': 'Benutzername',
	'portfolio.yourName': 'Dein Name',
	'portfolio.password': 'Passwort',
	'portfolio.createAccount': 'Zugang erstellen',
	'portfolio.login': 'Anmelden',
	'portfolio.changePasswordWithCode': 'Passwort mit Zurücksetzungscode ändern',
	'portfolio.resetCode': 'Zurücksetzungscode',
	'portfolio.newPassword': 'Neues Passwort',
	'portfolio.resetPassword': 'Passwort zurücksetzen',
	'portfolio.yourAreaEyebrow': 'Dein Bereich',
	'portfolio.collectionsTitle': 'Deine Sammlungen',
	'portfolio.collectionsIntro': 'Lege eine Sammlung an, um Dinge zu erfassen, die weiterziehen dürfen.',
	'portfolio.collectionName': 'Name der Sammlung',
	'portfolio.createCollection': 'Sammlung anlegen',
	'portfolio.yourItemsEyebrow': 'Deine Artikel',
	'portfolio.itemsCount': '({count})',
	'portfolio.switchCollection': 'Sammlungswechsel',
	'portfolio.yourCollections': 'Deine Sammlungen',
	'portfolio.addItemEyebrow': 'Neu in der Sammlung',
	'portfolio.addItemTitle': 'Artikel erfassen',
	'portfolio.itemTitle': 'Artikelname',
	'portfolio.price': 'Preis (€)',
	'portfolio.priceExample': 'z. B. 12,50',
	'portfolio.category': 'Kategorie',
	'portfolio.condition': 'Zustand',
	'portfolio.externalDescription': 'Externe Beschreibung (für Käufer sichtbar)',
	'portfolio.internalNotes': 'Interne Notizen (nur für dich sichtbar)',
	'portfolio.isComplete': 'Vollständig',
	'portfolio.isFunctional': 'Funktionsfähig',
	'portfolio.addItem': 'Artikel hinzufügen',
	'portfolio.manageImages': '🖼 Bilder verwalten',
	'portfolio.saleStatisticsEyebrow': 'Verkaufsstatistik',
	'portfolio.soldSummary': '{count} Artikel verkauft · {proceeds} € Erlös',
	'portfolio.byChannel': 'Nach Kanal',
	'portfolio.byMonth': 'Nach Monat',
	'portfolio.search': 'Suche',
	'portfolio.searchPlaceholder': 'Titel, Notizen, Beschreibung …',
	'portfolio.status': 'Status',
	'portfolio.all': 'Alle',
	'portfolio.applyFilters': 'Filtern',
	'portfolio.resetFilters': 'Zurücksetzen',
	'portfolio.sold': 'Verkauft',
	'portfolio.open': 'Offen',
	'portfolio.quickSell': '€ Verkaufen',
	'portfolio.noItemsForFilters': 'Keine Artikel passen auf deine Filter.',
	'portfolio.waitingForFirstItem': 'Deine Sammlung wartet auf ihren ersten Artikel.',
	'category.clothing': 'Kleidung',
	'category.books': 'Bücher',
	'category.electronics': 'Elektronik',
	'category.home': 'Haushalt',
	'category.toys': 'Spielzeug',
	'category.decor': 'Deko',
	'category.furniture': 'Möbel',
	'category.tools': 'Werkzeug',
	'category.hobby': 'Hobby',
	'category.other': 'Sonstiges',
	'condition.new': 'Neu',
	'condition.like-new': 'Wie neu',
	'condition.good': 'Gut',
	'condition.fair': 'Gebraucht',
	'condition.poor': 'Stark gebraucht',
	'channel.flea-market': 'Flohmarkt',
	'channel.online-marketplace': 'Online-Marktplatz',
	'channel.shop': 'Laden',
	'channel.private-sale': 'Privatverkauf',
	'channel.other': 'Sonstiges',
	'statusFilter.open': 'Offen',
	'statusFilter.reserved': 'Reserviert',
	'statusFilter.sold': 'Verkauft',
	'month.1': 'Januar',
	'month.2': 'Februar',
	'month.3': 'März',
	'month.4': 'April',
	'month.5': 'Mai',
	'month.6': 'Juni',
	'month.7': 'Juli',
	'month.8': 'August',
	'month.9': 'September',
	'month.10': 'Oktober',
	'month.11': 'November',
	'month.12': 'Dezember'
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
	'header.menuClose': 'Close menu',
	'portfolio.metaDescription': 'Manage your collection of things that are ready to move on.',
	'portfolio.welcomeEyebrow': 'Welcome',
	'portfolio.setupTitle': 'Create the first account',
	'portfolio.setupIntro': 'Create the admin account for your personal passalong instance.',
	'portfolio.welcomeBackEyebrow': 'Welcome back',
	'portfolio.loginTitle': 'Log in',
	'portfolio.loginIntro': 'Log in to manage your collections.',
	'portfolio.username': 'Username',
	'portfolio.yourName': 'Your name',
	'portfolio.password': 'Password',
	'portfolio.createAccount': 'Create account',
	'portfolio.login': 'Log in',
	'portfolio.changePasswordWithCode': 'Change password with a reset code',
	'portfolio.resetCode': 'Reset code',
	'portfolio.newPassword': 'New password',
	'portfolio.resetPassword': 'Reset password',
	'portfolio.yourAreaEyebrow': 'Your area',
	'portfolio.collectionsTitle': 'Your collections',
	'portfolio.collectionsIntro': 'Create a collection to add items that are ready to move on.',
	'portfolio.collectionName': 'Collection name',
	'portfolio.createCollection': 'Create collection',
	'portfolio.yourItemsEyebrow': 'Your items',
	'portfolio.itemsCount': '({count})',
	'portfolio.switchCollection': 'Switch collection',
	'portfolio.yourCollections': 'Your collections',
	'portfolio.addItemEyebrow': 'New in the collection',
	'portfolio.addItemTitle': 'Add item',
	'portfolio.itemTitle': 'Item name',
	'portfolio.price': 'Price (€)',
	'portfolio.priceExample': 'e. g. 12.50',
	'portfolio.category': 'Category',
	'portfolio.condition': 'Condition',
	'portfolio.externalDescription': 'External description (visible to buyers)',
	'portfolio.internalNotes': 'Internal notes (only visible to you)',
	'portfolio.isComplete': 'Complete',
	'portfolio.isFunctional': 'Functional',
	'portfolio.addItem': 'Add item',
	'portfolio.manageImages': '🖼 Manage images',
	'portfolio.saleStatisticsEyebrow': 'Sales statistics',
	'portfolio.soldSummary': '{count} items sold · {proceeds} € in proceeds',
	'portfolio.byChannel': 'By channel',
	'portfolio.byMonth': 'By month',
	'portfolio.search': 'Search',
	'portfolio.searchPlaceholder': 'Title, notes, description …',
	'portfolio.status': 'Status',
	'portfolio.all': 'All',
	'portfolio.applyFilters': 'Filter',
	'portfolio.resetFilters': 'Reset',
	'portfolio.sold': 'Sold',
	'portfolio.open': 'Open',
	'portfolio.quickSell': '€ Sell',
	'portfolio.noItemsForFilters': 'No items match your filters.',
	'portfolio.waitingForFirstItem': 'Your collection is waiting for its first item.',
	'category.clothing': 'Clothing',
	'category.books': 'Books',
	'category.electronics': 'Electronics',
	'category.home': 'Household',
	'category.toys': 'Toys',
	'category.decor': 'Decor',
	'category.furniture': 'Furniture',
	'category.tools': 'Tools',
	'category.hobby': 'Hobby',
	'category.other': 'Other',
	'condition.new': 'New',
	'condition.like-new': 'Like new',
	'condition.good': 'Good',
	'condition.fair': 'Used',
	'condition.poor': 'Heavily used',
	'channel.flea-market': 'Flea market',
	'channel.online-marketplace': 'Online marketplace',
	'channel.shop': 'Shop',
	'channel.private-sale': 'Private sale',
	'channel.other': 'Other',
	'statusFilter.open': 'Open',
	'statusFilter.reserved': 'Reserved',
	'statusFilter.sold': 'Sold',
	'month.1': 'January',
	'month.2': 'February',
	'month.3': 'March',
	'month.4': 'April',
	'month.5': 'May',
	'month.6': 'June',
	'month.7': 'July',
	'month.8': 'August',
	'month.9': 'September',
	'month.10': 'October',
	'month.11': 'November',
	'month.12': 'December'
};