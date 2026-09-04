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
	<section class="hero">
		<div class="hero-avatar" aria-hidden="true">
			<span class="initial">{data.stand.collectionName.slice(0, 1).toUpperCase()}</span>
		</div>
		<h1 data-testid="stand-title">{data.stand.collectionName}</h1>
		{#if data.stand.intro}
			<p class="intro" data-testid="stand-intro">{data.stand.intro}</p>
		{/if}
		<p class="sub">Schau dir die Artikel an — direkt hier oder live am Stand</p>
	</section>

	{#if data.stand.items.length}
		<div class="stand-grid" data-testid="stand-items">
			{#each data.stand.items as item (item.id)}
				<a class="tile" data-testid="stand-item" href={`/?collection=${encodeURIComponent(item.id)}`}>
					<div class="img" aria-hidden="true">{item.title.slice(0, 1).toUpperCase()}</div>
					<div class="body">
						<div class="name">{item.title}</div>
						<div class="price">{formatPrice(item.priceCents)}</div>
						<div class="meta">{categoryLabels[item.category]} · {conditionLabels[item.condition]}</div>
						{#if item.externalDescription}
							<p class="description" data-testid="stand-item-description">{item.externalDescription}</p>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{:else}
		<p class="empty">Aktuell sind keine Artikel verfügbar.</p>
	{/if}

	<footer class="footer">
		<p>passalong · Selbstgemacht für den Flohmarkt</p>
	</footer>
</main>

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
</style>