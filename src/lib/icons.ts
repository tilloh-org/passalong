/**
 * Icon name registry for the vendored Tabler sprite.
 *
 * The sprite symbols live inline in `src/app.html` and are generated from
 * `src/lib/assets/tabler-sprite.svg` (plus `src/lib/assets/tabler-extra/`)
 * by `scripts/build-icon-sprite.mjs`. This list is the type-level contract:
 * only names declared here are referenceable from components, and a unit test
 * asserts that every declared name resolves to a real sprite symbol.
 *
 * Keep it to icons the app actually renders — an unused entry still ships its
 * geometry in the inline sprite on every page load.
 */
export const iconNames = [
	// navigation and header
	'plus',
	'scan',
	'calendar',
	'tag',
	'history',
	'chart-bar',
	'chart-pie',
	'building-store',
	'user-circle',
	'logout',
	'key',
	'sun',
	'moon',
	'world',
	// items and portfolio
	'photo',
	'camera',
	'euro',
	'package',
	'box',
	'wallet',
	'check',
	'x',
	'trash',
	'edit',
	'bookmark',
	'filter',
	'search',
	'heart',
	'heart-filled',
	'arrow-left',
	'rotate',
	'download',
	'upload',
	'external-link',
	'link',
	'printer',
	'qrcode',
	'note',
	'alert-triangle',
	'settings'
] as const;

/** A valid sprite symbol name, without the `i-` prefix. */
export type IconName = (typeof iconNames)[number];
