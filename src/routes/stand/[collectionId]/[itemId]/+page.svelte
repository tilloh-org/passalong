<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
	import ItemInfoBlock from '$lib/components/item-info-block.svelte';

	let { data } = $props();
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
		<div class="placeholder" aria-hidden="true">{data.item.title.slice(0, 1).toUpperCase()}</div>
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