<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
	import ItemInfoBlock from '$lib/components/item-info-block.svelte';
	import ImageLightbox from '$lib/components/image-lightbox.svelte';
	import { orderImages } from '$lib/utils/lightbox';

	let { data } = $props();

	let lightbox = $state<ReturnType<typeof ImageLightbox> | null>(null);

	// The cover leads the gallery, then the remaining photos in their stored order. The buyer sees
	// the same sequence the seller arranged, and photo 1 in the viewer is the cover they clicked.
	const galleryImages = $derived(orderImages(data.item.images));

	const lightboxImages = $derived(
		galleryImages.map((image) => ({
			src: `/media/${encodeURIComponent(image.storageKey)}`,
			alt: t('item.photoAlt', { name: data.item.title })
		}))
	);

	/**
	 * Open the full-screen viewer at a given image.
	 *
	 * @param {number} index - Position in the gallery order.
	 * @returns {void}
	 */
	function openLightbox(index: number): void {
		lightbox?.open(index);
	}
</script>

<svelte:head>
	<title>{data.item.title} · {data.collectionName} · {t('stand.titleSuffix')} · passalong</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="stand-item" data-testid="stand-item-detail">
	<a class="back-link" href={`/stand/${encodeURIComponent(data.standCollectionId)}`}>
		{t('stand.itemBackToStand')}
	</a>

	<section class="detail-card" aria-labelledby="stand-item-title">
		{#if data.item.images.length}
			<div class="media-column">
				{#each galleryImages.slice(0, 1) as cover (cover.storageKey)}
					<button
						type="button"
						class="cover-button"
						onclick={() => openLightbox(0)}
						aria-label={t('item.openPhoto', { number: 1 })}
						data-testid="stand-item-cover"
					>
						<img
							class="cover"
							src={`/media/${encodeURIComponent(cover.storageKey)}`}
							alt={data.item.title}
						/>
					</button>
				{/each}
				{#if galleryImages.length > 1}
					<div class="gallery" data-testid="stand-item-gallery" aria-label={t('item.galleryLabel')}>
						{#each galleryImages as image, index (image.storageKey)}
							<button
								type="button"
								class="thumb-button"
								onclick={() => openLightbox(index)}
								aria-label={t('item.openPhoto', { number: index + 1 })}
								data-testid="stand-item-thumb"
							>
								<img
									class="thumb"
									src={`/media/${encodeURIComponent(image.storageKey)}`}
									alt={t('item.photoAlt', { name: data.item.title })}
									loading="lazy"
								/>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<div class="placeholder" aria-hidden="true">{data.item.title.slice(0, 1).toUpperCase()}</div>
		{/if}
		<div class="info">
			<ItemInfoBlock item={data.item} variant="public" />
			<p class="hint" data-testid="stand-item-hint">
				{t('stand.itemVisitHint', { name: data.collectionName })}
			</p>
			<a class="back-to-stand" href={`/stand/${encodeURIComponent(data.standCollectionId)}`}>
				{t('stand.itemAllItems', { name: data.collectionName })}
			</a>
		</div>
	</section>

	<ImageLightbox bind:this={lightbox} images={lightboxImages} />
</main>

<style>
	.stand-item {
		margin: 0 auto;
		max-width: 46rem;
		padding: 0 1.25rem 6rem;
	}

	.back-link,
	.back-to-stand {
		color: var(--color-accent);
		display: inline-flex;
		font-size: 0.88rem;
		font-weight: 700;
		text-decoration: none;
	}

	.back-link:hover,
	.back-to-stand:hover {
		color: var(--color-accent-strong);
	}

	.detail-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		margin-top: 0.75rem;
		padding: 1.25rem;
	}

	.placeholder {
		align-items: center;
		aspect-ratio: 16 / 9;
		background: linear-gradient(135deg, var(--color-surface-strong), var(--fog));
		border-radius: var(--radius-card);
		color: var(--color-accent);
		display: flex;
		font-size: 3rem;
		font-weight: 800;
		justify-content: center;
	}

	.media-column {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.cover {
		aspect-ratio: 16 / 9;
		border-radius: var(--radius-card);
		display: block;
		object-fit: cover;
		width: 100%;
	}

	.gallery {
		display: flex;
		gap: 0.6rem;
		/* The strip scrolls sideways on a phone, so the visible photos stay tappable. */
		overflow-x: auto;
	}

	/* The photo is the control: no button chrome, so the tile looks as it did while gaining a
	   keyboard-reachable, screen-reader-named target. */
	.cover-button,
	.thumb-button {
		background: none;
		border: none;
		cursor: zoom-in;
		display: block;
		flex: 0 0 auto;
		margin: 0;
		padding: 0;
	}

	.cover-button {
		width: 100%;
	}

	.cover-button:focus-visible,
	.thumb-button:focus-visible {
		border-radius: var(--radius-card);
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.thumb {
		border-radius: var(--radius-card);
		display: block;
		flex: 0 0 auto;
		height: 4.5rem;
		object-fit: cover;
		width: 4.5rem;
	}

	.hint {
		background: var(--color-accent-soft);
		border-radius: var(--radius-card);
		color: var(--color-text);
		font-size: 0.9rem;
		line-height: 1.5;
		margin: 1.25rem 0 0;
		padding: 0.8rem 1rem;
	}

	.back-to-stand {
		margin-top: 1rem;
	}
</style>
