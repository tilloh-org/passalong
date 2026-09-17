<script lang="ts">
	import { defaultThumbnailEdge, thumbnailUrl } from '$lib/thumbnails';

	/**
	 * A tile image that loads a small thumbnail instead of the full-size original.
	 *
	 * Grids render the same photo at roughly 180 px wide, so serving the original costs the visitor
	 * megabytes and the server a full-size decode per tile. The URL is built here through
	 * `thumbnailUrl`, the single place that knows the thumbnail route — a template never assembles
	 * that path itself.
	 *
	 * The caller keeps its own `class`, `loading` and layout behaviour: this component only changes
	 * which bytes are requested.
	 */

	let {
		storageKey,
		alt,
		edge = defaultThumbnailEdge,
		loading = 'lazy',
		class: className = '',
		...rest
	}: {
		/** Stored key of the original image. */
		storageKey: string;
		/** Accessible description of the image. */
		alt: string;
		/** Requested longest edge in pixels; the delivery route clamps it. */
		edge?: number;
		/** Native loading hint; tiles stay lazy by default. */
		loading?: 'lazy' | 'eager';
		/** Extra classes forwarded from the call site. */
		class?: string;
	} = $props();
</script>

<img
	class={className}
	src={thumbnailUrl(storageKey, edge)}
	{alt}
	{loading}
	decoding="async"
	{...rest}
/>
