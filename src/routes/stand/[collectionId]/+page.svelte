<script lang="ts">
	import { formatPrice } from '$lib/utils/format';
	import { t } from '$lib/i18n/index.svelte';
	import { getFavorites, pruneFavorites, toggleFavorite } from '$lib/stand-favorites.svelte';

	let { data } = $props();

	/**
	 * Translate a category key in the active locale.
	 *
	 * @param {string} category - A category key such as `books`.
	 * @returns {string} Human-readable category label.
	 */
	const categoryLabel = (category: string) => t(`category.${category}`);

	/**
	 * Translate a condition key in the active locale.
	 *
	 * @param {string} condition - A condition key such as `good`.
	 * @returns {string} Human-readable condition label.
	 */
	const conditionLabel = (condition: string) => t(`condition.${condition}`);

	/**
	 * Favorite item IDs of this stand page, hydrated on the client only.
	 * Server-rendered markup always starts empty so SSR and client agree.
	 */
	let favoriteIds = $state<string[]>([]);

	$effect(() => {
		// Prune sold items and hydrate the persisted list in the browser.
		favoriteIds = pruneFavorites(
			data.stand.collectionId,
			data.stand.items.map((item) => item.id)
		);
	});

	/**
	 * Check whether one item is currently marked as favorite.
	 *
	 * @param {string} itemId - Public item identifier.
	 * @returns {boolean} Whether the heart is active.
	 */
	const isFavorite = (itemId: string) => favoriteIds.includes(itemId);

	/**
	 * Toggle one item's favorite state and keep the rendered list in sync.
	 *
	 * @param {string} itemId - Public item identifier.
	 */
	function onToggleFavorite(itemId: string): void {
		toggleFavorite(data.stand.collectionId, itemId);
		favoriteIds = getFavorites(data.stand.collectionId);
	}

	/**
	 * Favorite item cards in insertion order (first favorited first).
	 */
	const favoriteItems = $derived(
		favoriteIds
			.map((itemId) => data.stand.items.find((item) => item.id === itemId))
			.filter((item) => item !== undefined)
	);

	let favoritesDialog: HTMLDialogElement | undefined = $state();
</script>

<svelte:head>
	<title>{data.stand.collectionName} · {t('stand.titleSuffix')} · passalong</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="stand">
	<section class="hero">
		<div class="hero-avatar" aria-hidden="true">
			<span class="initial">{data.stand.collectionName.slice(0, 1).toUpperCase()}</span>
		</div>
		<h1 data-testid="stand-title">{data.stand.collectionName}</h1>
		{#if data.stand.intro}
			<p class="intro" data-testid="stand-intro">{data.stand.intro}</p>
		{/if}
		<p class="sub">{t('stand.sub')}</p>
	</section>

	{#if data.stand.items.length}
		<div class="stand-grid" data-testid="stand-items">
			{#each data.stand.items as item (item.id)}
				<div class="tile" data-testid="stand-item">
					<div class="img" aria-hidden="true">
						{item.title.slice(0, 1).toUpperCase()}
						<button
							class="favorite-toggle"
							class:active={isFavorite(item.id)}
							aria-label={isFavorite(item.id) ? t('stand.favoriteRemove') : t('stand.favoriteAdd')}
							aria-pressed={isFavorite(item.id)}
							data-testid="favorite-toggle"
							type="button"
							onclick={() => onToggleFavorite(item.id)}
						>
							<svg class="icon" aria-hidden="true" focusable="false">
								<use href={isFavorite(item.id) ? '#icon-heart-filled' : '#icon-heart-outline'} />
							</svg>
						</button>
					</div>
					<a class="tile-link" href={`/?collection=${encodeURIComponent(item.id)}`}>
						<div class="body">
							<div class="name">{item.title}</div>
							<div class="price">{formatPrice(item.priceCents)}</div>
							<div class="meta">{categoryLabel(item.category)} · {conditionLabel(item.condition)}</div>
							{#if item.externalDescription}
								<p class="description" data-testid="stand-item-description">{item.externalDescription}</p>
							{/if}
						</div>
					</a>
				</div>
			{/each}
		</div>
	{:else}
		<p class="empty">{t('stand.empty')}</p>
	{/if}

	<footer class="footer">
		<p>{t('stand.footer')}</p>
	</footer>
</main>

<dialog
	class="favorites-dialog"
	bind:this={favoritesDialog}
	aria-label={t('stand.favoritesTitle')}
	data-testid="favorites-dialog"
>
	<div class="dialog-head">
		<div class="dialog-brand">
			<div class="brand-avatar" aria-hidden="true">
				{data.stand.collectionName.slice(0, 1).toUpperCase()}
			</div>
			<div>
				<h3>{t('stand.favoritesTitle')}</h3>
				<p class="brand-stand" data-testid="favorites-stand-name">
					{t('stand.favoritesStandSubtitle', { name: data.stand.collectionName })}
				</p>
			</div>
		</div>
		<button type="button" class="dialog-close" onclick={() => favoritesDialog?.close()}>
			{t('stand.favoritesClose')}
		</button>
	</div>
	{#if favoriteItems.length}
		<div class="favorites-grid" data-testid="favorites-grid">
			{#each favoriteItems as item (item.id)}
				<div class="favorites-item" data-testid="favorites-item">
					<div class="img" aria-hidden="true">{item.title.slice(0, 1).toUpperCase()}</div>
					<div class="body">
						<div class="name">{item.title}</div>
						<div class="price">{formatPrice(item.priceCents)}</div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<p class="favorites-empty" data-testid="favorites-empty">{t('stand.favoritesEmpty')}</p>
	{/if}
</dialog>

{#if data.stand.items.length}
	<div class="favorites-bar" data-testid="favorites-bar">
		<button
			type="button"
			onclick={() => favoritesDialog?.showModal()}
			aria-label={t('stand.favoritesOpen')}
			data-testid="favorites-bar-trigger"
		>
			<svg class="icon" aria-hidden="true" focusable="false">
				<use href={favoriteIds.length ? '#icon-heart-filled' : '#icon-heart-outline'} />
			</svg>
			{t('stand.favoritesTitle')}
			{#if favoriteIds.length}
				<span class="favorites-badge" data-testid="favorites-badge">{favoriteIds.length}</span>
			{/if}
		</button>
	</div>
{/if}

<style>
	.stand {
		margin: 0 auto;
		max-width: 64rem;
		padding: 0 1.25rem 2rem;
	}

	.hero {
		animation: hero-rise 0.5s ease;
		padding: 2.5rem 1rem 1.25rem;
		text-align: center;
	}

	@keyframes hero-rise {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.hero-avatar {
		align-items: center;
		background: var(--color-surface);
		border: 3px solid var(--color-border);
		border-radius: 999px;
		box-shadow: var(--shadow-card);
		display: flex;
		height: 84px;
		justify-content: center;
		margin: 0 auto 14px;
		overflow: hidden;
		width: 84px;
	}

	.hero-avatar .initial {
		color: var(--color-accent);
		font-size: 2rem;
		font-weight: 800;
	}

	.hero h1 {
		color: var(--color-accent-strong);
		font-size: 1.8rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		margin: 0;
	}

	.hero .sub {
		color: var(--color-text-muted);
		font-size: 0.95rem;
		margin: 6px 0 0;
	}

	.intro {
		color: var(--color-text);
		font-size: 1rem;
		line-height: 1.6;
		margin: 0.4rem auto 0;
		max-width: 40rem;
		white-space: pre-line;
	}

	.stand-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
	}

	.tile {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-tile);
		color: inherit;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		text-decoration: none;
		transition:
			transform 0.3s cubic-bezier(0.2, 0.7, 0.3, 1),
			box-shadow 0.3s ease;
	}

	.tile:hover {
		box-shadow: var(--shadow-tile-hover);
		transform: translateY(-3px);
	}

	.tile .img {
		align-items: center;
		aspect-ratio: 1;
		background: linear-gradient(135deg, var(--color-surface-strong), var(--fog));
		color: var(--color-accent);
		display: flex;
		font-size: 2.4rem;
		font-weight: 800;
		justify-content: center;
		position: relative;
	}

	.favorite-toggle {
		align-items: center;
		background: var(--glass);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		color: var(--color-text-muted);
		cursor: pointer;
		display: flex;
		height: 2.2rem;
		justify-content: center;
		padding: 0;
		position: absolute;
		right: 0.6rem;
		top: 0.6rem;
		transition: all 0.25s ease;
		width: 2.2rem;
		z-index: 2;
	}

	.favorite-toggle .icon {
		height: 1.15rem;
		width: 1.15rem;
	}

	.favorite-toggle:hover {
		background: var(--color-accent-soft);
		box-shadow: var(--shadow-btn-hover);
		transform: translateY(-1px);
	}

	.favorite-toggle:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.favorite-toggle.active {
		color: var(--color-accent);
	}

	.tile-link {
		color: inherit;
		display: flex;
		flex-direction: column;
		text-decoration: none;
	}

	.tile-link:hover .name {
		color: var(--color-accent);
	}

	.tile .body {
		padding: 0.85rem 0.9rem 0.9rem;
	}

	.tile .name {
		font-size: 0.92rem;
		font-weight: 700;
		line-height: 1.3;
	}

	.tile .price {
		color: var(--color-accent);
		font-size: 1.05rem;
		font-weight: 800;
		margin-top: 3px;
	}

	.tile .meta {
		color: var(--color-text-muted);
		font-size: 0.78rem;
		margin-top: 2px;
	}
	.description {
		color: var(--color-text-muted);
		font-size: 0.82rem;
		line-height: 1.45;
		margin: 0.3rem 0 0;
		white-space: pre-line;
	}

	.empty {
		color: var(--color-text-muted);
		padding: 4rem 1rem;
		text-align: center;
	}

	.footer {
		color: var(--color-text-muted);
		font-size: 0.78rem;
		padding: 24px;
		text-align: center;
	}

	.footer p {
		margin: 0;
	}

	.favorites-bar {
		bottom: 1rem;
		left: 50%;
		position: fixed;
		transform: translateX(-50%);
		z-index: 80;
	}

	.favorites-bar button {
		align-items: center;
		background: var(--glass);
		backdrop-filter: blur(14px) saturate(1.4);
		-webkit-backdrop-filter: blur(14px) saturate(1.4);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		box-shadow: var(--shadow-tile);
		color: var(--color-accent);
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		font-size: 0.9rem;
		font-weight: 700;
		gap: 8px;
		padding: 10px 18px;
		transition: all 0.25s ease;
	}

	.favorites-bar button:hover {
		background: var(--color-accent-soft);
		box-shadow: var(--shadow-btn-hover);
		transform: translateY(-1px);
	}

	.favorites-bar button:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.favorites-bar .icon {
		height: 1.15rem;
		width: 1.15rem;
	}

	.favorites-badge {
		align-items: center;
		background: var(--color-accent);
		border-radius: 999px;
		color: #fff;
		display: inline-flex;
		font-size: 0.72rem;
		font-weight: 800;
		justify-content: center;
		min-width: 1.25rem;
		padding: 0 6px;
	}

	.favorites-dialog {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		max-width: min(34rem, 92vw);
		padding: 1.25rem;
		width: 34rem;
	}

	.favorites-dialog::backdrop {
		background: var(--scrim);
	}

	.favorites-dialog .dialog-head {
		align-items: center;
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.favorites-dialog .dialog-brand {
		align-items: center;
		display: flex;
		gap: 10px;
	}

	.favorites-dialog .brand-avatar {
		align-items: center;
		background: var(--color-surface);
		border: 3px solid var(--color-border);
		border-radius: 999px;
		color: var(--color-accent);
		display: flex;
		font-size: 1.05rem;
		font-weight: 800;
		height: 44px;
		justify-content: center;
		width: 44px;
	}

	.favorites-dialog .dialog-head h3 {
		color: var(--color-accent-strong);
		font-size: 1.1rem;
		margin: 0;
	}

	.favorites-dialog .brand-stand {
		color: var(--color-text-muted);
		font-size: 0.8rem;
		margin: 2px 0 0;
	}

	.favorites-dialog .dialog-close {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		color: var(--color-accent);
		cursor: pointer;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 6px 14px;
		transition: all 0.25s ease;
	}

	.favorites-dialog .dialog-close:hover {
		background: var(--color-accent-soft);
	}

	.favorites-dialog .dialog-close:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.favorites-grid {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		max-height: 60vh;
		overflow-y: auto;
	}

	.favorites-item {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		overflow: hidden;
	}

	.favorites-item .img {
		align-items: center;
		aspect-ratio: 1;
		background: linear-gradient(135deg, var(--color-surface-strong), var(--fog));
		color: var(--color-accent);
		display: flex;
		font-size: 1.6rem;
		font-weight: 800;
		justify-content: center;
	}

	.favorites-item .body {
		padding: 0.6rem 0.7rem;
	}

	.favorites-item .name {
		font-size: 0.85rem;
		font-weight: 700;
		line-height: 1.3;
	}

	.favorites-item .price {
		color: var(--color-accent);
		font-size: 0.95rem;
		font-weight: 800;
		margin-top: 2px;
	}

	.favorites-empty {
		color: var(--color-text-muted);
		padding: 2rem 1rem;
		text-align: center;
	}
</style>