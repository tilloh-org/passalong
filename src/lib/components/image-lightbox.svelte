<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
	import DialogShell from '$lib/components/dialog-shell.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { nextIndex, previousIndex, swipeDirection } from '$lib/utils/lightbox';

	/**
	 * Full-screen photo viewer for a gallery.
	 *
	 * Built on the native `<dialog>` element so focus trapping, `Escape` and the top layer come from
	 * the browser instead of being reimplemented. Arrow keys move through the gallery, a horizontal
	 * swipe moves through it on touch, and a vertical drag is left alone so the page still scrolls.
	 */
	let {
		images,
		onclose
	}: {
		images: { src: string; alt: string }[];
		onclose?: () => void;
	} = $props();

	let shell = $state<ReturnType<typeof DialogShell> | null>(null);
	let currentIndex = $state(0);
	let touchStart = $state<{ x: number; y: number } | null>(null);

	const hasGallery = $derived(images.length > 1);

	/**
	 * Open the viewer, starting at the given image.
	 *
	 * @param {number} [index] - The image to show first; defaults to the current index.
	 * @returns {void}
	 */
	export function open(index?: number): void {
		currentIndex = index ?? currentIndex;
		shell?.open();
	}

	/**
	 * Close the viewer.
	 *
	 * @returns {void}
	 */
	export function close(): void {
		shell?.close();
	}

	/**
	 * Step through the gallery.
	 *
	 * @param {'next' | 'previous'} direction - Which way to move.
	 * @returns {void}
	 */
	function step(direction: 'next' | 'previous'): void {
		currentIndex =
			direction === 'next'
				? nextIndex(currentIndex, images.length)
				: previousIndex(currentIndex, images.length);
	}

	/**
	 * Handle a key press while the viewer is open.
	 *
	 * @param {KeyboardEvent} event - The key event.
	 * @returns {void}
	 */
	function handleKeydown(event: KeyboardEvent): void {
		if (!hasGallery) {
			return;
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			step('next');
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			step('previous');
		}
	}

	/**
	 * Remember where a touch started.
	 *
	 * @param {TouchEvent} event - The touch start event.
	 * @returns {void}
	 */
	function handleTouchStart(event: TouchEvent): void {
		const touch = event.touches[0];
		touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
	}

	/**
	 * Swipe through the gallery when the gesture is deliberately horizontal.
	 *
	 * @param {TouchEvent} event - The touch end event.
	 * @returns {void}
	 */
	function handleTouchEnd(event: TouchEvent): void {
		const start = touchStart;
		const touch = event.changedTouches[0];
		touchStart = null;
		if (!start || !touch || !hasGallery) {
			return;
		}
		const direction = swipeDirection(touch.clientX - start.x, touch.clientY - start.y);
		if (direction) {
			step(direction);
		}
	}
</script>

<DialogShell
	variant="fullscreen"
	bind:this={shell}
	class="lightbox"
	ariaLabel={t('item.lightboxLabel')}
	testId="item-lightbox"
	showClose={false}
	onkeydown={handleKeydown}
	{onclose}
>
	{#snippet bar()}
		<div class="lightbox-bar">
			{#if hasGallery}
				<p class="lightbox-counter" data-testid="lightbox-counter">
					{t('item.lightboxCounter', { current: currentIndex + 1, total: images.length })}
				</p>
			{:else}
				<span></span>
			{/if}
			<button
				type="button"
				class="lightbox-close"
				onclick={close}
				aria-label={t('item.lightboxClose')}
				data-testid="lightbox-close"
			>
				<Icon name="x" size="sm" />
			</button>
		</div>
	{/snippet}

	<div
		class="lightbox-stage"
		role="group"
		aria-label={t('item.lightboxLabel')}
		ontouchstart={handleTouchStart}
		ontouchend={handleTouchEnd}
	>
		{#if hasGallery}
			<button
				type="button"
				class="lightbox-nav lightbox-previous"
				onclick={() => step('previous')}
				aria-label={t('item.lightboxPrevious')}
				data-testid="lightbox-previous"
			>
				<Icon name="arrow-left" size="sm" />
			</button>
		{/if}
		<img
			class="lightbox-image"
			src={images[currentIndex]?.src}
			alt={images[currentIndex]?.alt ?? ''}
			data-testid="lightbox-image"
		/>
		{#if hasGallery}
			<button
				type="button"
				class="lightbox-nav lightbox-next"
				onclick={() => step('next')}
				aria-label={t('item.lightboxNext')}
				data-testid="lightbox-next"
			>
				<Icon name="arrow-left" size="sm" class="flip" />
			</button>
		{/if}
	</div>
</DialogShell>

<style>
	/* The dialog-shell owns the frame and the viewer scrim; only the bar contents are here. */
	.lightbox-bar {
		align-items: center;
		display: flex;
		gap: var(--gap-dialog-head);
		justify-content: space-between;
		width: 100%;
	}

	.lightbox-counter {
		color: var(--viewer-control-fg);
		font-size: 0.85rem;
		margin: 0;
	}

	/*
	 * Solid and always visible: these are the only way to change photo with a mouse, so they never
	 * wait for a hover, and an opaque fill keeps a bright photo from showing through the button.
	 */
	.lightbox-close,
	.lightbox-nav {
		align-items: center;
		background: var(--viewer-control-bg);
		border: 1px solid var(--viewer-control-border);
		border-radius: 999px;
		color: var(--viewer-control-fg);
		cursor: pointer;
		display: inline-flex;
		height: 2.75rem;
		justify-content: center;
		opacity: 1;
		/* A soft halo keeps the button readable where it overlaps a light part of the photo. */
		box-shadow: var(--shadow-viewer-control);
		/* Comfortably above the 44px touch target minimum on a phone. */
		width: 2.75rem;
	}

	.lightbox-close:hover,
	.lightbox-nav:hover {
		background: var(--viewer-control-bg-hover);
	}

	.lightbox-close:focus-visible,
	.lightbox-nav:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.lightbox-stage {
		align-items: center;
		display: flex;
		height: calc(100dvh - 4.5rem);
		justify-content: center;
		/* The stage is the positioning context for the overlaid arrows, so it must span the
		   viewer. Without an explicit width it shrinks to its content and the arrows leave the
		   viewport. */
		width: 100%;
		padding: 0 0.5rem max(1rem, env(safe-area-inset-bottom));
		position: relative;
		touch-action: pan-y;
	}

	.lightbox-image {
		border-radius: var(--radius-card);
		max-height: 100%;
		max-width: 100%;
		object-fit: contain;
	}

	/*
	 * The arrows sit on top of the image rather than beside it. A row layout needs room for two
	 * 44px targets plus the photo, and at phone width that room does not exist — the arrows were
	 * pushed entirely off screen. Overlaid, they stay reachable at any width.
	 */
	.lightbox-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		z-index: 1;
	}

	.lightbox-previous {
		left: max(0.5rem, env(safe-area-inset-left));
	}

	.lightbox-next {
		right: max(0.5rem, env(safe-area-inset-right));
	}

	/* One arrow symbol serves both directions: mirror it for "next" instead of adding an icon. */
	.lightbox-next :global(svg) {
		transform: rotate(180deg);
	}
</style>
