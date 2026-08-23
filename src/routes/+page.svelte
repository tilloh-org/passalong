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
	<title>{data.collection ? `${data.collection.name} · passalong` : 'passalong'}</title>
	<meta name="description" content="Verwalte deine Sammlung von Dingen, die weiterziehen dürfen." />
</svelte:head>

<main>
	<header class="masthead">
		<a class="brand" href="/">passalong</a>
		<p>Eine Sammlung. Viele Wege, Dinge weiterzugeben.</p>
	</header>

	{#if !data.collection}
		<section class="onboarding" aria-labelledby="onboarding-title">
			<p class="eyebrow">Deine erste Sammlung</p>
			<h1 id="onboarding-title">Was darf weiterziehen?</h1>
			<p class="intro">
				Lege eine persönliche Sammlung an. Artikel, Bilder und Verkaufswege kommen danach dazu.
			</p>
			<form method="POST" action="?/createCollection">
				<label>
					<span>Dein Name</span>
					<input name="ownerName" autocomplete="name" required />
				</label>
				<label>
					<span>Name der Sammlung</span>
					<input name="collectionName" required />
				</label>
				<button type="submit">Sammlung anlegen</button>
			</form>
		</section>
	{:else}
		<section class="collection-header" aria-labelledby="collection-title">
			<div>
				<p class="eyebrow">Deine Sammlung</p>
				<h1 id="collection-title">{data.collection.name}</h1>
			</div>
			<p>{data.items.length} {data.items.length === 1 ? 'Artikel' : 'Artikel'}</p>
		</section>

		<div class="workspace">
			<section class="item-form" aria-labelledby="add-item-title">
				<div>
					<p class="eyebrow">Neu in der Sammlung</p>
					<h2 id="add-item-title">Artikel erfassen</h2>
				</div>
				<form method="POST" action="?/addItem">
					<input name="collectionId" type="hidden" value={data.collection.id} />
					<label>
						<span>Artikelname</span>
						<input name="title" required />
					</label>
					<div class="form-grid">
						<label>
							<span>Preis in Cent</span>
							<input name="priceCents" type="number" min="0" step="1" required />
						</label>
						<label>
							<span>Kategorie</span>
							<select name="category" aria-label="Kategorie">
								{#each data.categoryOptions as category}
									<option value={category}>{categoryLabels[category]}</option>
								{/each}
							</select>
						</label>
						<label>
							<span>Zustand</span>
							<select name="condition" aria-label="Zustand">
								{#each data.conditionOptions as condition}
									<option value={condition}>{conditionLabels[condition]}</option>
								{/each}
							</select>
						</label>
					</div>
					<label>
						<span>Interne Notizen</span>
						<textarea name="internalNotes" rows="3"></textarea>
					</label>
					<button type="submit">Artikel hinzufügen</button>
				</form>
			</section>

			<section class="items" aria-labelledby="items-title">
				<div class="items-heading">
					<div>
						<p class="eyebrow">Dein Bestand</p>
						<h2 id="items-title">Artikel</h2>
					</div>
				</div>
				{#if data.items.length}
					<div class="item-grid">
						{#each data.items as item}
							<article>
								<div class="item-image" aria-hidden="true">{item.title.slice(0, 1).toUpperCase()}</div>
								<div class="item-copy">
									<h2>{item.title}</h2>
									<p class="price">{formatPrice(item.priceCents)} €</p>
									<p class="metadata">{categoryLabels[item.category]} · {conditionLabels[item.condition]}</p>
									{#if item.internalNotes}
										<p class="notes">{item.internalNotes}</p>
									{/if}
								</div>
							</article>
						{/each}
					</div>
				{:else}
					<p class="empty">Deine Sammlung wartet auf ihren ersten Artikel.</p>
				{/if}
			</section>
		</div>
	{/if}
</main>

<style>
	main {
		max-width: 72rem;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 4rem;
	}

	.masthead {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.5rem 0 3.5rem;
	}

	.brand {
		color: var(--color-text);
		font-size: 1.2rem;
		font-weight: 800;
		letter-spacing: -0.04em;
		text-decoration: none;
	}

	.masthead p,
	.collection-header > p {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		margin: 0;
	}

	.onboarding {
		background: linear-gradient(145deg, var(--color-accent-soft), transparent 60%), var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 1.25rem;
		box-shadow: var(--shadow-card);
		margin: 2rem auto;
		max-width: 37rem;
		padding: clamp(1.5rem, 5vw, 3rem);
	}

	.eyebrow {
		color: var(--color-accent);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		margin: 0 0 0.5rem;
		text-transform: uppercase;
	}

	h1,
	h2 {
		letter-spacing: -0.035em;
	}

	h1 {
		font-size: clamp(2rem, 5vw, 3.25rem);
		line-height: 1;
		margin: 0;
	}

	h2 {
		font-size: 1.25rem;
		margin: 0;
	}

	.intro,
	.empty {
		color: var(--color-text-muted);
		line-height: 1.6;
		margin: 1rem 0 2rem;
	}

	form {
		display: grid;
		gap: 1rem;
	}

	label {
		display: grid;
		gap: 0.45rem;
	}

	label span {
		font-size: 0.85rem;
		font-weight: 650;
	}

	input,
	select,
	textarea {
		background: var(--color-input);
		border: 1px solid var(--color-border);
		border-radius: 0.65rem;
		color: var(--color-text);
		font: inherit;
		padding: 0.72rem 0.8rem;
	}

	input:focus,
	select:focus,
	textarea:focus {
		border-color: var(--color-accent);
		box-shadow: 0 0 0 3px var(--color-accent-soft);
		outline: none;
	}

	textarea {
		resize: vertical;
	}

	button {
		background: var(--color-accent);
		border: 0;
		border-radius: 0.65rem;
		color: white;
		cursor: pointer;
		font: inherit;
		font-weight: 700;
		justify-self: start;
		padding: 0.75rem 1rem;
	}

	button:hover {
		filter: brightness(1.08);
	}

	.collection-header,
	.items-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}

	.collection-header {
		border-bottom: 1px solid var(--color-border);
		padding-bottom: 1.5rem;
	}

	.workspace {
		display: grid;
		gap: 2.5rem;
		grid-template-columns: minmax(16rem, 0.75fr) minmax(0, 1.75fr);
		padding-top: 2rem;
	}

	.item-form {
		align-self: start;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 1rem;
		display: grid;
		gap: 1.5rem;
		padding: 1.25rem;
	}

	.form-grid {
		display: grid;
		gap: 1rem;
	}

	.items {
		display: grid;
		gap: 1.25rem;
	}

	.item-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
	}

	article {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 1rem;
		overflow: hidden;
	}

	.item-image {
		align-items: center;
		background: linear-gradient(135deg, var(--color-accent-soft), var(--color-surface-strong));
		color: var(--color-accent);
		display: flex;
		font-size: 2rem;
		font-weight: 800;
		height: 8rem;
		justify-content: center;
	}

	.item-copy {
		padding: 1rem;
	}

	.item-copy h2 {
		font-size: 1rem;
	}

	.price {
		font-size: 1.25rem;
		font-weight: 750;
		margin: 0.6rem 0 0;
	}

	.metadata,
	.notes {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		line-height: 1.45;
		margin: 0.55rem 0 0;
	}

	.notes {
		border-top: 1px solid var(--color-border);
		padding-top: 0.55rem;
	}

	@media (max-width: 48rem) {
		.masthead,
		.collection-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.workspace {
			grid-template-columns: 1fr;
		}
	}
</style>
