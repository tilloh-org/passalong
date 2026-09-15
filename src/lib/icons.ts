/**
 * Icon name registry for the vendored Tabler sprite.
 *
 * The sprite symbols live inline in `src/app.html` and are generated from
 * `src/lib/assets/tabler-sprite.svg` (plus `src/lib/assets/tabler-extra/`)
 * by `scripts/build-icon-sprite.mjs`. This list is the type-level contract:
 * only names declared here are referenceable from components, and a unit test
 * asserts that every declared name resolves to a real sprite symbol.
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
	'circle-check',
	'x',
	'circle-x',
	'trash',
	'edit',
	'bookmark',
	'lock-open',
	'filter',
	'search',
	'heart',
	'heart-filled',
	'shopping-bag',
	'clock',
	'arrow-left',
	'arrow-right',
	'rotate',
	'refresh',
	'download',
	'upload',
	'copy',
	'external-link',
	'link',
	'printer',
	'qrcode',
	'note',
	'eye',
	'alert-triangle',
	'info-circle',
	'settings'
] as const;

/** A valid sprite symbol name, without the `i-` prefix. */
export type IconName = (typeof iconNames)[number];
