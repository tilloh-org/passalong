<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
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

	let dialog = $state<HTMLDialogElement | null>(null);
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
		dialog?.showModal();
	}

	/**
	 * Close the viewer.
	 *
	 * @returns {void}
	 */
	export function close(): void {
		dialog?.close();
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

<dialog
	bind:this={dialog}
	class="lightbox"
	data-testid="item-lightbox"
	onclose={() => onclose?.()}
	onkeydown={handleKeydown}
>
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
</dialog>

<style>
	.lightbox {
		background: transparent;
		border: none;
		height: 100dvh;
		margin: 0;
		max-height: 100dvh;
		max-width: 100vw;
		padding: 0;
		width: 100vw;
	}
	.lightbox::backdrop {
		background: rgba(6, 12, 18, 0.92);
	}

	.lightbox-bar {
		align-items: center;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
		padding: max(0.75rem, env(safe-area-inset-top)) 1rem 0.75rem;
	}

	.lightbox-counter {
		color: var(--color-text-on-dark, #e8f0f4);
		font-size: 0.85rem;
		margin: 0;
	}

	.lightbox-close,
	.lightbox-nav {
		align-items: center;
		background: rgba(255, 255, 255, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.22);
		border-radius: 999px;
		color: #e8f0f4;
		cursor: pointer;
		display: inline-flex;
		height: 2.75rem;
		justify-content: center;
		/* Comfortably above the 44px touch target minimum on a phone. */
		width: 2.75rem;
	}

	.lightbox-close:hover,
	.lightbox-nav:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.lightbox-stage {
		align-items: center;
		display: flex;
		height: calc(100dvh - 4.5rem);
		justify-content: center;
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
