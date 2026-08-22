<script lang="ts">
	const features = [
		{
			title: 'Eine Sammlung',
			text: 'Fotos, Preis, Zustand, Kategorie — jedes Stück genau einmal gepflegt.'
		},
		{
			title: 'Viele Wege',
			text: 'Flohmarkt, Online-Marktplatz oder direkte Übergabe — pro Artikel nachvollziehbar.'
		},
		{
			title: 'Familiär & selbst gehostet',
			text: 'Ein Server, ein Datenbestand — mehrere Profile, getrennte Sammlungen.'
		}
	];
</script>

<svelte:head>
	<title>passalong</title>
	<meta name="description" content="Verwalte die Dinge, die du nicht mehr brauchst — und gib ihnen ein zweites Zuhause." />
</svelte:head>

<main>
	<section class="hero">
		<h1>passalong</h1>
		<p class="tagline">Verwalte die Dinge, die du nicht mehr brauchst — und gib ihnen ein zweites Zuhause.</p>
		<p class="status">In Entwicklung — die Sammlung kommt bald.</p>
	</section>

	<section class="features">
		{#each features as f}
			<article>
				<h2>{f.title}</h2>
				<p>{f.text}</p>
			</article>
		{/each}
	</section>
</main>

<style>
	main {
		max-width: 44rem;
		margin: 0 auto;
		padding: 3rem 1.25rem;
	}

	.hero {
		text-align: center;
		padding: 2rem 0 3rem;
	}

	h1 {
		font-size: 2.5rem;
		letter-spacing: -0.02em;
		margin: 0 0 0.5rem;
	}

	.tagline {
		font-size: 1.15rem;
		color: var(--color-text-muted);
		margin: 0 auto 1.5rem;
		max-width: 32rem;
	}

	.status {
		font-size: 0.9rem;
		color: var(--color-text-faint);
	}

	.features {
		display: grid;
		gap: 1rem;
	}

	article {
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		padding: 1.25rem 1.5rem;
	}

	article h2 {
		font-size: 1.05rem;
		margin: 0 0 0.35rem;
	}

	article p {
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.95rem;
	}
</style>
