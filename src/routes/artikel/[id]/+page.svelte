<script lang="ts">
	import { formatPrice } from '$lib/utils/format';

	let { data, form } = $props();

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

	const saleChannelLabels: Record<string, string> = {
		'flea-market': 'Flohmarkt',
		'online-marketplace': 'Online-Marktplatz',
		shop: 'Laden',
		'private-sale': 'Privatverkauf',
		other: 'Sonstiges'
	};

	const saleChannelOptions = Object.entries(saleChannelLabels).map(([value, label]) => ({ value, label }));

	const coverImageKey = $derived(data.images.find((image) => image.isCover)?.storageKey ?? null);
	const qrCodeDataUrl = $derived(data.qrCodeDataUrl);
</script>

<svelte:head>
	<title>{data.item.title} · Artikel · passalong</title>
</svelte:head>

<main class="detail">
	<header class="masthead">
		<a class="back-link" href="/">
			← Zurück zum Portfolio
		</a>
	</header>

	{#if form && 'csrfError' in form && form.csrfError}
		<p class="form-error" role="alert">{form.csrfError}</p>
	{/if}

	<section class="detail-card" aria-labelledby="item-title">
		<div class="media-column">
			{#if coverImageKey}
				<img class="cover" src={`/media/${encodeURIComponent(coverImageKey)}`} alt={data.item.title} />
			{:else}
				<div class="cover placeholder" aria-hidden="true">{data.item.title.slice(0, 1).toUpperCase()}</div>
			{/if}
		</div>

		<div class="info-column">
			<p class="eyebrow">{categoryLabels[data.item.category]} · {conditionLabels[data.item.condition]}</p>
			<h1 id="item-title">{data.item.title}</h1>
			<p class="price">{formatPrice(data.item.priceCents)} €</p>
			<div class="flag-pills" data-testid="item-flag-pills">
				<span class="flag-pill category">{categoryLabels[data.item.category]}</span>
				{#if data.item.isComplete}
					<span class="flag-pill complete">✓ Vollständig</span>
				{/if}
				{#if data.item.isFunctional}
					<span class="flag-pill functional">✓ Funktionsfähig</span>
				{/if}
			</div>
			{#if data.item.soldAt}
				<p class="sold-badge" data-testid="item-sold-badge">
					Verkauft · {saleChannelLabels[data.item.saleChannel ?? 'other']}{data.item.saleProceedsCents !== null ? ` · Erlös ${formatPrice(data.item.saleProceedsCents)} €` : ''}
				</p>
			{/if}
			{#if data.item.externalDescription}
				<div class="description external" data-testid="item-external-description">
					<strong>Beschreibung:</strong>
					<p>{data.item.externalDescription}</p>
				</div>
			{/if}
			{#if data.item.internalNotes}
				<div class="description internal" data-testid="item-internal-notes">
					<strong>Anmerkungen (intern):</strong>
					<p>{data.item.internalNotes}</p>
				</div>
			{/if}

			<section class="panel" aria-labelledby="photos-title">
				<h2 id="photos-title">Fotos</h2>
				<form method="POST" action="?/uploadItemImage" enctype="multipart/form-data">
					<input name="itemId" type="hidden" value={data.item.id} />
					<input
						name="image"
						id="item-image-file"
						type="file"
						accept="image/png,image/jpeg,image/webp"
						data-testid="item-image-input"
						class="visually-hidden-input"
						required
					/>
					<label class="file-button" for="item-image-file">
						🖼 Foto auswählen
					</label>
					{#if form?.uploadImageError}
						<p class="form-error" role="alert">{form.uploadImageError}</p>
					{/if}
					<button type="submit">Foto speichern</button>
				</form>
				{#if data.images.length}
					<ul class="image-list">
						{#each data.images as image (image.id)}
							<li>
								<img
									class="thumb"
									src={`/media/${encodeURIComponent(image.storageKey)}`}
									alt="Foto von {data.item.title}"
									loading="lazy"
								/>
								<div class="image-actions">
									<span class="image-name" data-testid="item-image-key">
										{image.storageKey}{image.isCover ? ' (Titelbild)' : ''}
									</span>
									<div class="image-buttons">
										{#if !image.isCover}
											<form method="POST" action="?/setItemCover">
												<input name="itemId" type="hidden" value={data.item.id} />
												<input name="imageId" type="hidden" value={image.id} />
												<button type="submit" class="secondary">Als Titelbild</button>
											</form>
										{/if}
										<form method="POST" action="?/removeItemImage">
											<input name="itemId" type="hidden" value={data.item.id} />
											<input name="imageId" type="hidden" value={image.id} />
											<button type="submit" class="danger" data-testid="remove-item-image">Entfernen</button>
										</form>
									</div>
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="empty">Noch keine Fotos vorhanden.</p>
				{/if}
			</section>

			<section class="panel" aria-labelledby="sale-title">
				<h2 id="sale-title">Verkauf</h2>
				{#if data.item.soldAt}
					<p class="sold-summary">
						Verkauft am {new Date(data.item.soldAt).toLocaleDateString('de-DE')} über {saleChannelLabels[data.item.saleChannel ?? 'other']}
						{#if data.item.saleProceedsCents !== null}
							· Erlös {formatPrice(data.item.saleProceedsCents)} €
						{/if}
					</p>
					<form method="POST" action="?/unmarkItemSold">
						<input name="itemId" type="hidden" value={data.item.id} />
						<button type="submit" class="danger" data-testid="unmark-item-sold">Verkauf zurücknehmen</button>
					</form>
				{:else}
					<form method="POST" action="?/markItemSold" data-testid="item-sale-section">
						<input name="itemId" type="hidden" value={data.item.id} />
						<div class="form-grid">
							<label>
								<span>Kanal</span>
								<select name="channel" aria-label="Verkaufskanal">
									{#each saleChannelOptions as channel}
										<option value={channel.value}>{channel.label}</option>
									{/each}
								</select>
							</label>
							<label>
								<span>Verkauft am</span>
								<input name="soldAt" type="date" required data-testid="item-sold-date" />
							</label>
							<label>
								<span>Erlös in Cent</span>
								<input name="proceedsCents" type="number" min="0" step="1" required data-testid="item-proceeds" />
							</label>
						</div>
						{#if form?.saleStatusError}
							<p class="form-error" role="alert">{form.saleStatusError}</p>
						{/if}
						<button type="submit" data-testid="mark-item-sold">Als verkauft erfassen</button>
					</form>
				{/if}
			</section>
		</div>
	</section>

	<section class="qr-panel" aria-labelledby="qr-title" data-testid="item-qr-panel">
		<h2 id="qr-title">QR-Code <span class="qr-hint">— ausdrucken und an den Gegenstand heften</span></h2>
		<div class="qr-body">
			<img
				class="qr-image"
				src={qrCodeDataUrl}
				alt="QR-Code mit dem Link zum Artikel"
				data-testid="item-qr-image"
			/>
			<a class="qr-download" href={qrCodeDataUrl} download="qr-{data.item.id}.png" data-testid="item-qr-download">
				⬇ Als Bild herunterladen
			</a>
		</div>
	</section>
</main>

<style>
	.detail {
		margin: 0 auto;
		max-width: 64rem;
		padding: 0 1.5rem 4rem;
	}

	.masthead {
		align-items: center;
		display: flex;
		padding: 1.25rem 0;
	}

	.back-link {
		color: var(--color-accent);
		font-size: 0.9rem;
		font-weight: 700;
		text-decoration: none;
	}

	.back-link:hover {
		text-decoration: underline;
	}

	.detail-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		display: grid;
		gap: 1.5rem;
		grid-template-columns: minmax(16rem, 0.9fr) minmax(0, 1.4fr);
		padding: 1.5rem;
	}

	.media-column .cover {
		aspect-ratio: 1;
		border-radius: var(--radius-card);
		display: block;
		object-fit: cover;
		width: 100%;
	}

	.media-column .cover.placeholder {
		align-items: center;
		background: linear-gradient(135deg, var(--color-surface-strong), var(--fog));
		color: var(--color-accent);
		display: flex;
		font-size: 4rem;
		font-weight: 800;
		justify-content: center;
	}

	.eyebrow {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		margin: 0 0 0.3rem;
		text-transform: uppercase;
	}

	.info-column h1 {
		color: var(--color-accent-strong);
		font-size: 1.5rem;
		margin: 0;
	}

	.price {
		color: var(--color-accent);
		font-size: 1.3rem;
		font-weight: 800;
		margin: 0.5rem 0 0;
	}

	.sold-badge {
		align-self: flex-start;
		background: var(--color-ok-soft);
		border: 1px solid var(--color-ok-border);
		border-radius: 999px;
		color: var(--color-ok);
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.03em;
		margin: 0.6rem 0 0;
		padding: 4px 10px;
	}

	.flag-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0.6rem 0 0;
	}

	.flag-pill {
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		padding: 4px 10px;
	}

	.flag-pill.category {
		background: var(--color-surface-strong);
		border: 1px solid var(--color-border);
		color: var(--color-text-muted);
	}

	.flag-pill.complete {
		background: var(--color-ok-soft);
		border: 1px solid var(--color-ok-border);
		color: var(--color-ok);
	}

	.flag-pill.functional {
		background: var(--color-info-soft, rgba(56, 132, 255, 0.12));
		border: 1px solid var(--color-info-border, rgba(56, 132, 255, 0.5));
		color: var(--color-info, #3884ff);
	}

	.description {
		border-top: 1px solid var(--color-border);
		font-size: 0.9rem;
		line-height: 1.5;
		margin: 0.9rem 0 0;
		padding-top: 0.6rem;
	}

	.description p {
		margin: 0.25rem 0 0;
		white-space: pre-line;
	}

	.description.internal {
		background: var(--color-warn-soft, rgba(240, 179, 0, 0.1));
		border: 1px solid var(--color-warn-border, rgba(240, 179, 0, 0.45));
		border-radius: var(--radius-small);
		color: var(--color-warn, #f0b300);
		padding: 0.6rem 0.75rem;
	}

	.description.internal p {
		color: var(--color-text-muted);
	}

	.visually-hidden-input {
		height: 1px;
		opacity: 0;
		position: absolute;
		width: 1px;
	}

	.file-button {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-accent);
		cursor: pointer;
		display: inline-block;
		font-size: 0.9rem;
		font-weight: 700;
		justify-self: start;
		padding: 0.7rem 1.1rem;
		transition:
			background 0.2s ease,
			filter 0.2s ease;
	}

	.file-button:hover {
		background: var(--color-accent-soft);
	}

	.qr-panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		margin-top: 1.5rem;
		padding: 1.5rem;
	}

	.qr-panel h2 {
		font-size: 1.05rem;
		margin: 0 0 1rem;
	}

	.qr-hint {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		font-weight: 400;
	}

	.qr-body {
		align-items: center;
		display: grid;
		gap: 1rem;
		justify-items: center;
	}

	.qr-image {
		background: white;
		border-radius: var(--radius-small);
		padding: 0.5rem;
	}

	.qr-download {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border-radius: 999px;
		box-shadow: var(--shadow-btn);
		color: white;
		font-size: 0.9rem;
		font-weight: 700;
		padding: 0.6rem 1.2rem;
		text-decoration: none;
	}

	.qr-download:hover {
		filter: brightness(1.08);
	}

	.panel {
		border-top: 1px solid var(--color-border);
		margin-top: 1.25rem;
		padding-top: 1rem;
	}

	.panel h2 {
		font-size: 1.05rem;
		margin: 0 0 0.75rem;
	}

	.panel form {
		display: grid;
		gap: 0.85rem;
	}

	.image-list {
		display: grid;
		gap: 0.6rem;
		list-style: none;
		margin: 0.9rem 0 0;
		padding: 0;
	}

	.image-list li {
		align-items: center;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-small);
		display: flex;
		gap: 0.75rem;
		padding: 0.5rem;
	}

	.thumb {
		border-radius: var(--radius-small);
		height: 3.5rem;
		object-fit: cover;
		width: 3.5rem;
	}

	.image-actions {
		display: grid;
		flex: 1;
		gap: 0.3rem;
	}

	.image-name {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		word-break: break-all;
	}

	.image-buttons {
		display: flex;
		gap: 0.4rem;
	}

	.image-buttons form {
		display: contents;
	}

	button {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border: 0;
		border-radius: var(--radius-control);
		box-shadow: var(--shadow-btn);
		color: white;
		cursor: pointer;
		font: inherit;
		font-size: 0.95rem;
		font-weight: 700;
		justify-self: start;
		padding: 0.7rem 1.25rem;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease,
			filter 0.2s ease;
	}

	button:hover {
		box-shadow: var(--shadow-btn-hover);
		filter: brightness(1.08);
		transform: translateY(-2px);
	}

	button.secondary {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		box-shadow: none;
		color: var(--color-accent);
		font-size: 0.75rem;
		padding: 0.4rem 0.7rem;
	}

	button.secondary:hover {
		background: var(--color-accent-soft);
		transform: none;
	}

	button.danger {
		background: transparent;
		border: 1px solid var(--color-danger);
		box-shadow: none;
		color: var(--color-danger);
		font-size: 0.75rem;
		padding: 0.4rem 0.7rem;
	}

	button.danger:hover {
		background: var(--color-danger-soft);
		box-shadow: none;
		transform: none;
	}

	.form-error {
		background: var(--color-danger-soft);
		border: 1px solid var(--color-danger);
		border-radius: var(--radius-control);
		color: var(--color-text);
		margin: 0;
		padding: 0.65rem 0.8rem;
	}

	label {
		display: grid;
		gap: 0.3rem;
	}

	label span {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	input,
	select {
		background: var(--color-input);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-text);
		font: inherit;
		padding: 0.68rem 0.85rem;
	}

	input:focus,
	select:focus {
		border-color: var(--color-ice);
		box-shadow: 0 0 0 4px var(--focus-ring);
		outline: none;
	}

	.form-grid {
		display: grid;
		gap: 1rem;
	}

	.sold-summary {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		margin: 0 0 0.75rem;
	}

	.empty {
		color: var(--color-text-muted);
		font-size: 0.9rem;
	}

	@media (max-width: 48rem) {
		.detail-card {
			grid-template-columns: 1fr;
		}
	}
</style>