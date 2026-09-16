<script lang="ts">
	import type { IconName } from '$lib/icons';

	/**
	 * A decorative Tabler icon rendered from the inline sprite in `src/app.html`.
	 *
	 * Icons are always `aria-hidden`: the surrounding control carries the
	 * accessible name, so an icon never becomes a second name for a button or
	 * link. Sizing and colour come from the global `.icon` classes in `app.css`,
	 * which keeps one icon vocabulary instead of per-component overrides.
	 */

	/** Named size steps mapped to the global `.icon-*` classes. */
	type IconSize = 'sm' | 'md' | 'lg';

	/** Semantic tone modifier mapped to the global `.icon-*` classes. */
	type IconTone = 'inherit' | 'muted' | 'ok' | 'danger' | 'warn';

	let {
		name,
		size = 'md',
		tone = 'inherit',
		class: className = ''
	}: {
		/** Sprite symbol to render, without the `i-` prefix. */
		name: IconName;
		/** Relative icon size; `md` inherits the surrounding font size. */
		size?: IconSize;
		/** Semantic colour; `inherit` follows the surrounding text colour. */
		tone?: IconTone;
		/** Extra classes forwarded from the call site. */
		class?: string;
	} = $props();

	const sizeClass = $derived(size === 'md' ? '' : `icon-${size}`);
	const toneClass = $derived(tone === 'inherit' ? '' : `icon-${tone}`);
</script>

<svg
	class="icon {sizeClass} {toneClass} {className}"
	aria-hidden="true"
	focusable="false"
	data-testid={`icon-${name}`}
>
	<use href={`#i-${name}`} />
</svg>
