<script lang="ts">
	import { formatPrice } from '$lib/utils/format';

	let { data } = $props();

	const categoryLabels: Record<string, string> = {
		clothing: 'Kleidung',
		books: 'Bücher',
		electronics: 'Elektronik',
		home: 'Haushalt',
		toys: 'Spielzeug',
		decor: 'Deko',
		furniture: 'Möbel',
		tools: 'Werkzeug',
		hobby: 'Hobby',
		other: 'Sonstiges'
	};

	const conditionLabels: Record<string, string> = {
		new: 'Neu',
		'like-new': 'Wie neu',
		good: 'Gut',
		fair: 'Gebraucht',
		poor: 'Stark gebraucht'
	};
</script>

<svelte:head>
	<title>{data.stand.collectionName} · Standseite · passalong</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="stand">
	<header class="stand-header">
		<a class="brand" href="/">passalong</a>
	</header>
	<section class="stand-body">
		<p class="eyebrow">Öffentlicher Stand</p>
		<h1 data-testid="stand-title">{data.stand.collectionName}</h1>
		{#if data.stand.items.length}
			<div class="stand-grid" data-testid="stand-items">
				{#each data.stand.items as item (item.id)}
					<article class="stand-item" data-testid="stand-item">
						<div class="item-image" aria-hidden="true">{item.title.slice(0, 1).toUpperCase()}</div>
						<div class="item-copy">
							<h2>{item.title}</h2>
							<p class="price">{formatPrice(item.priceCents)} €</p>
							<p class="metadata">{categoryLabels[item.category]} · {conditionLabels[item.condition]}</p>
						</div>
					</article>
				{/each}
			</div>
		{:else}
			<p class="empty">Aktuell sind keine Artikel verfügbar.</p>
		{/if}
	</section>
</main>

<style>
	.stand {
		margin: 0 auto;
		max-width: 64rem;
		padding: 1.5rem 1.25rem 3rem;
	}

	.stand :global(h1),
	.stand :global(h2) {
		font-weight: 700;
	}

	.stand .eyebrow {
		color: var(--color-accent, #2563eb);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		margin: 0;
		text-transform: uppercase;
	}

	.stand-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
	}

	.stand-item {
		background: var(--color-surface, #fff);
		border: 1px solid var(--color-border);
		border-radius: 1rem;
		overflow: hidden;
	}

	.stand-item .item-image {
		align-items: center;
		background: var(--color-image-placeholder, #dcdcf5);
		color: var(--color-accent, #2563eb);
		display: flex;
		font-size: 2.5rem;
		font-weight: 700;
		height: 8rem;
		justify-content: center;
	}

	.stand-item .item-copy {
		padding: 1rem 1.25rem 1.25rem;
	}

	.stand-item h2 {
		font-size: 1.05rem;
		margin: 0;
	}

	.stand-item .price {
		font-weight: 700;
		margin: 0.35rem 0 0;
	}

	.stand-item .metadata {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		margin: 0.4rem 0 0;
	}

	.empty {
		color: var(--color-text-muted);
	}
</style>
