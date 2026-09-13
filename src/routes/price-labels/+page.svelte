<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
	import { formatPrice } from '$lib/utils/format';

	let { data } = $props();

	/**
	 * Open the browser's native print dialog for the label sheets.
	 */
	function printLabels(): void {
		window.print();
	}
</script>

<svelte:head>
	<title>{t('priceLabels.title')} · passalong</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="price-labels">
	<section class="intro-card" aria-labelledby="price-labels-title">
		<div>
			<p class="eyebrow">{t('priceLabels.eyebrow')}</p>
			<h1 id="price-labels-title" data-testid="price-labels-title">{t('priceLabels.title')}</h1>
			<p class="intro-copy">{t('priceLabels.intro')}</p>
			<p class="item-count">
				{data.itemCount === 1
					? t('priceLabels.itemCountSingular', { count: data.itemCount })
					: t('priceLabels.itemCountPlural', { count: data.itemCount })}
			</p>
		</div>
		<div class="intro-actions">
			<button
				type="button"
				class="print-button"
				onclick={printLabels}
				data-testid="price-labels-print"
			>
				{t('priceLabels.print')}
			</button>
		</div>
	</section>

	{#if data.labelPages.length > 0}
		<div class="label-sheet-list">
			{#each data.labelPages as labelPage, pageIndex (labelPage[0]?.item.id ?? pageIndex)}
				<section class="price-label-page" aria-label={t('priceLabels.sheetLabel')}>
					{#each labelPage as label (label.item.id)}
						<article class="price-label" data-testid="price-label-item">
							<div class="label-topline">
								<h2>{label.item.title}</h2>
								<span class="category">{t(`category.${label.item.category}`)}</span>
							</div>
							<div class="label-bottomline">
								<p class="price">{formatPrice(label.item.priceCents)} €</p>
								<img
									src={label.qrCodeDataUrl}
									alt={t('priceLabels.qrAlt', { name: label.item.title })}
								/>
							</div>
						</article>
					{/each}
				</section>
			{/each}
		</div>
	{:else}
		<section class="empty-state" data-testid="price-labels-empty">
			<h2>{t('priceLabels.emptyTitle')}</h2>
			<p>{t('priceLabels.emptyIntro')}</p>
		</section>
	{/if}
</main>

<style>
	@page {
		size: A4 portrait;
		margin: 8mm;
	}

	.price-labels {
		margin: 0 auto;
		max-width: 72rem;
		padding: 0 1.5rem 4rem;
	}

	.intro-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		display: flex;
		gap: 1.5rem;
		justify-content: space-between;
		margin-bottom: 1.5rem;
		padding: 1.5rem;
	}

	.eyebrow {
		color: var(--color-accent);
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		margin: 0 0 0.45rem;
		text-transform: uppercase;
	}

	h1,
	h2,
	p {
		margin-top: 0;
	}

	h1 {
		font-size: clamp(1.7rem, 4vw, 2.3rem);
		margin-bottom: 0.65rem;
	}

	.intro-copy,
	.item-count {
		color: var(--color-text-muted);
		margin-bottom: 0;
	}

	.item-count {
		font-size: 0.9rem;
		margin-top: 0.75rem;
	}

	.intro-actions {
		align-items: end;
		display: flex;
		flex: 0 0 auto;
	}

	.print-button {
		background: var(--color-accent);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-small);
		color: white;
		cursor: pointer;
		font: inherit;
		font-weight: 800;
		padding: 0.75rem 1rem;
	}

	.print-button:hover {
		filter: brightness(1.08);
	}

	.label-sheet-list {
		display: grid;
		gap: 1.5rem;
	}

	.price-label-page {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.price-label {
		background: var(--color-surface);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-small);
		box-shadow: var(--shadow-card);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		justify-content: space-between;
		min-height: 8rem;
		padding: 0.8rem;
	}

	.label-topline,
	.label-bottomline {
		align-items: flex-start;
		display: flex;
		gap: 0.5rem;
		justify-content: space-between;
	}

	.price-label h2 {
		font-size: 0.95rem;
		line-height: 1.2;
		margin-bottom: 0;
		overflow-wrap: anywhere;
	}

	.category {
		background: var(--color-surface-strong);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		color: var(--color-text-muted);
		font-size: 0.6rem;
		font-weight: 800;
		max-width: 52%;
		overflow: hidden;
		padding: 0.2rem 0.35rem;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.label-bottomline {
		align-items: flex-end;
	}

	.price {
		color: var(--color-accent);
		font-size: 1.25rem;
		font-weight: 800;
		margin-bottom: 0;
		white-space: nowrap;
	}

	.price-label img {
		background: white;
		border: 1px solid var(--color-border);
		border-radius: 0.25rem;
		display: block;
		height: 3.2rem;
		padding: 0.15rem;
		width: 3.2rem;
	}

	.empty-state {
		background: var(--color-surface);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		padding: 3rem 1.5rem;
		text-align: center;
	}

	.empty-state h2 {
		margin-bottom: 0.5rem;
	}

	.empty-state p {
		color: var(--color-text-muted);
		margin-bottom: 0;
	}

	@media (max-width: 760px) {
		.intro-card {
			flex-direction: column;
		}

		.intro-actions {
			justify-content: flex-end;
		}

		.price-label-page {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media print {
		:global(.masthead),
		.intro-card {
			display: none !important;
		}

		:global(body) {
			background: white !important;
		}

		:global(body::before) {
			display: none !important;
		}

		.price-labels {
			max-width: none;
			padding: 0;
		}

		.label-sheet-list {
			display: block;
		}

		.price-label-page {
			break-after: page;
			display: grid;
			gap: 0;
			grid-template-columns: repeat(4, 1fr);
			grid-template-rows: repeat(4, 1fr);
			height: 281mm;
			width: 194mm;
		}

		.price-label-page:last-child {
			break-after: auto;
		}

		.price-label {
			background: white;
			border: 1px dashed #999;
			border-radius: 0;
			box-shadow: none;
			break-inside: avoid;
			min-height: 0;
			padding: 4mm;
		}

		.price-label h2,
		.price {
			color: #000;
		}

		.label-topline {
			align-items: flex-start;
			flex-direction: column;
			gap: 1mm;
		}

		.price-label h2 {
			flex: 1 1 auto;
			font-size: 0.85rem;
			min-width: 0;
		}

		.category {
			background: #f2f2f2;
			border-color: #ccc;
			color: #444;
			max-width: 100%;
		}

		.price-label img {
			height: 11mm;
			width: 11mm;
		}
	}
</style>
