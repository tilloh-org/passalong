<script lang="ts">
	import { formatPrice } from '$lib/utils/format';
	import { minimumPasswordLength } from '$lib/password-policy';

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

	const germanMonthNames = [
		'Januar',
		'Februar',
		'März',
		'April',
		'Mai',
		'Juni',
		'Juli',
		'August',
		'September',
		'Oktober',
		'November',
		'Dezember'
	];

	/**
	 * Format a YYYY-MM month key as a German month label.
	 *
	 * @param {string} month - Month key in the form YYYY-MM.
	 * @returns {string} Human-readable German month label.
	 */
	function formatSaleMonth(month: string): string {
		const [year, monthNumber] = month.split('-');
		const monthIndex = Number(monthNumber) - 1;
		if (!year || monthIndex < 0 || monthIndex >= germanMonthNames.length) {
			return month;
		}
		return `${germanMonthNames[monthIndex]} ${year}`;
	}
</script>

<svelte:head>
	<title>{data.collection ? `${data.collection.name} · passalong` : 'passalong'}</title>
	<meta name="description" content="Verwalte deine Sammlung von Dingen, die weiterziehen dürfen." />
</svelte:head>

<main>
	<header class="masthead">
		<a class="brand" href="/">passalong</a>
		<p>Eine Sammlung. Viele Wege, Dinge weiterzugeben.</p>
		{#if data.isAuthenticated}
			<form class="session-control" method="POST" action="?/logout">
				<button type="submit">Abmelden</button>
			</form>
		{/if}
	</header>

	{#if form && 'csrfError' in form && form.csrfError}
		<p class="form-error" role="alert">{form.csrfError}</p>
	{/if}
	{#if form && 'passwordResetSecret' in form && form.passwordResetSecret}
		<section class="issued-reset-secret" aria-labelledby="issued-reset-secret-title">
			<h2 id="issued-reset-secret-title">Einmaliger Zurücksetzungscode</h2>
			<code class="reset-secret" data-testid="issued-password-reset-secret">{form.passwordResetSecret}</code>
			<p>Den Code jetzt über einen privaten Kanal weitergeben. Er wird nicht erneut angezeigt.</p>
		</section>
	{/if}

	{#if data.isAuthenticated}
		<details class="password-help authenticated-password-help">
			<summary>Passwort ändern</summary>
			<form method="POST" action="?/changePassword">
				<label>
					<span>Aktuelles Passwort</span>
					<input name="currentPassword" type="password" autocomplete="current-password" required />
				</label>
				<label>
					<span>Neues Passwort</span>
					<input name="password" type="password" autocomplete="new-password" minlength={minimumPasswordLength} required />
				</label>
				{#if form && 'changePasswordError' in form && form.changePasswordError}
					<p class="form-error" role="alert">{form.changePasswordError}</p>
				{/if}
				<button type="submit">Passwort speichern</button>
			</form>
		</details>
		{#if data.isInstanceAdmin}
			<details class="password-help instance-administration">
				<summary>Instanzverwaltung</summary>
				<p>Erzeuge einen einmaligen Zurücksetzungscode für ein Konto. Die bestehenden Sitzungen dieses Kontos werden sofort beendet.</p>
				<form method="POST" action="?/createPasswordReset">
					<label>
						<span>Benutzername des Kontos</span>
						<input name="username" autocomplete="username" required />
					</label>
					{#if form && 'passwordResetIssueError' in form && form.passwordResetIssueError}
						<p class="form-error" role="alert">{form.passwordResetIssueError}</p>
					{/if}
					<button type="submit">Zurücksetzungscode erzeugen</button>
				</form>
			</details>
		{/if}
	{/if}

	{#if !data.isAuthenticated}
		<section class="onboarding" aria-labelledby="onboarding-title">
			{#if data.isInitialSetup}
				<p class="eyebrow">Willkommen</p>
				<h1 id="onboarding-title">Ersten Zugang erstellen</h1>
				<p class="intro">Erstelle das Admin-Konto für deine persönliche passalong-Instanz.</p>
				<form method="POST" action="?/register">
					<label>
						<span>Benutzername</span>
						<input name="username" autocomplete="username" required />
					</label>
					<label>
						<span>Dein Name</span>
						<input name="displayName" autocomplete="name" required />
					</label>
					<label>
						<span>Passwort</span>
						<input name="password" type="password" autocomplete="new-password" minlength={minimumPasswordLength} required />
					</label>
					{#if form?.registerError}
						<p class="form-error" role="alert">{form.registerError}</p>
					{/if}
					<button type="submit">Zugang erstellen</button>
				</form>
			{:else}
				<p class="eyebrow">Willkommen zurück</p>
				<h1 id="onboarding-title">Anmelden</h1>
				<p class="intro">Melde dich an, um deine Sammlungen zu verwalten.</p>
				<form method="POST" action="?/login">
					<label>
						<span>Benutzername</span>
						<input name="username" autocomplete="username" required />
					</label>
					<label>
						<span>Passwort</span>
						<input name="password" type="password" autocomplete="current-password" required />
					</label>
					{#if form?.loginError}
						<p class="form-error" role="alert">{form.loginError}</p>
					{/if}
					<button type="submit">Anmelden</button>
				</form>
				<details class="password-help">
					<summary>Passwort mit Zurücksetzungscode ändern</summary>
					<form method="POST" action="?/resetPassword">
						<label>
							<span>Benutzername</span>
							<input name="username" autocomplete="username" required />
						</label>
						<label>
							<span>Zurücksetzungscode</span>
							<input name="resetSecret" type="password" autocomplete="one-time-code" required />
						</label>
						<label>
							<span>Neues Passwort</span>
							<input name="password" type="password" autocomplete="new-password" minlength={minimumPasswordLength} required />
						</label>
						{#if form && 'resetError' in form && form.resetError}
							<p class="form-error" role="alert">{form.resetError}</p>
						{/if}
						<button type="submit">Passwort zurücksetzen</button>
						</form>
				</details>
			{/if}
		</section>
	{:else if !data.collection}
		<section class="onboarding" aria-labelledby="collections-title">
			<p class="eyebrow">Dein Bereich</p>
			<h1 id="collections-title">Deine Sammlungen</h1>
			<p class="intro">Lege eine Sammlung an, um Dinge zu erfassen, die weiterziehen dürfen.</p>
			<form method="POST" action="?/createCollection">
				<label>
					<span>Name der Sammlung</span>
					<input name="collectionName" required />
				</label>
				{#if form?.createCollectionError}
					<p class="form-error" role="alert">{form.createCollectionError}</p>
				{/if}
				<button type="submit">Sammlung anlegen</button>
			</form>
			{#if data.collections.length}
				<nav class="collection-list" aria-label="Deine Sammlungen">
					{#each data.collections as collection}
						<a href={`/?collection=${encodeURIComponent(collection.id)}`}>{collection.name}</a>
					{/each}
				</nav>
			{/if}
		</section>
	{:else}
		<section class="collection-header" aria-labelledby="collection-title">
			<div>
				<p class="eyebrow">Deine Sammlung</p>
				<h1 id="collection-title">{data.collection.name}</h1>
			</div>
			<p>{data.items.length} {data.items.length === 1 ? 'Artikel' : 'Artikel'}</p>
		</section>

		<nav class="collection-switcher" aria-label="Sammlungswechsel" data-testid="collection-switcher">
			{#each data.collections as collection (collection.id)}
				<a href={`/?collection=${encodeURIComponent(collection.id)}`} aria-current={collection.id === data.collection.id ? 'page' : undefined}>
					{collection.name}
				</a>
			{/each}
		</nav>

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
					{#if form?.addItemError}
						<p class="form-error" role="alert">{form.addItemError}</p>
					{/if}
					<button type="submit">Artikel hinzufügen</button>
				</form>
			</section>

			{#if data.saleStatistics && data.saleStatistics.soldItemCount > 0}
				<section class="sale-statistics" aria-labelledby="sale-statistics-title" data-testid="sale-statistics">
					<p class="eyebrow">Verkaufsstatistik</p>
					<h2 id="sale-statistics-title">
						{data.saleStatistics.soldItemCount} Artikel verkauft · {formatPrice(data.saleStatistics.totalProceedsCents)} € Erlös
					</h2>
					<div class="statistics-grid">
						<div class="statistics-group">
							<h3>Nach Kanal</h3>
							<ul data-testid="sale-statistics-channels">
								{#each data.saleStatistics.proceedsByChannel as entry}
									<li>
										<span>{saleChannelLabels[entry.channel] ?? entry.channel}</span>
										<span class="statistics-value">{entry.soldItemCount}× · {formatPrice(entry.totalProceedsCents)} €</span>
									</li>
								{/each}
							</ul>
						</div>
						<div class="statistics-group">
							<h3>Nach Monat</h3>
							<ul data-testid="sale-statistics-months">
								{#each data.saleStatistics.proceedsByMonth as entry}
									<li>
										<span>{formatSaleMonth(entry.month)}</span>
										<span class="statistics-value">{entry.soldItemCount}× · {formatPrice(entry.totalProceedsCents)} €</span>
									</li>
								{/each}
							</ul>
						</div>
					</div>
				</section>
			{/if}
			<section class="items" aria-labelledby="items-title">
				<div class="items-heading">
					<div>
						<p class="eyebrow">Dein Bestand</p>
						<h2 id="items-title">Artikel</h2>
					</div>
					{#if data.collection}
						<a class="stand-link" data-testid="stand-page-link" href={`/stand/${data.collection.id}`}>Standseite öffnen</a>
					{/if}
				</div>
				{#if data.items.length}
				<div class="item-grid">
					{#each data.items as item}
						<article data-testid="item-card">
							{#if item.coverImageKey}
								<img class="item-image photo" src={`/media/${encodeURIComponent(item.coverImageKey)}`} alt={item.title} loading="lazy" />
							{:else}
								<div class="item-image" aria-hidden="true">{item.title.slice(0, 1).toUpperCase()}</div>
							{/if}
							<div class="item-copy">
								<h2>{item.title}</h2>
								<p class="price">{formatPrice(item.priceCents)} €</p>
								<p class="metadata">{categoryLabels[item.category]} · {conditionLabels[item.condition]}</p>
								{#if item.soldAt}
									<p class="sold-badge" data-testid="item-sold-badge">Verkauft · {saleChannelLabels[item.saleChannel ?? 'other']}{item.saleProceedsCents !== null ? ` · Erlös ${formatPrice(item.saleProceedsCents)} €` : ''}</p>
								{/if}
								{#if item.internalNotes}
									<p class="notes">{item.internalNotes}</p>
								{/if}
								<details class="image-management">
									<summary>Fotos verwalten</summary>
									<form method="POST" action="?/uploadItemImage" enctype="multipart/form-data">
										<input name="itemId" type="hidden" value={item.id} />
										<label>
											<span>Foto hinzufügen</span>
											<input
												name="image"
												type="file"
												accept="image/png,image/jpeg,image/webp"
												data-testid="item-image-input"
												required
											/>
										</label>
										{#if form?.uploadImageError}
											<p class="form-error" role="alert">{form.uploadImageError}</p>
										{/if}
										<button type="submit">Foto speichern</button>
									</form>
									{#each item.images ?? [] as image}
										<div class="image-row">
											<span class="image-name" data-testid="item-image-key">{image.storageKey}{image.isCover ? ' (Titelbild)' : ''}</span>
											<form method="POST" action="?/removeItemImage" class="inline-form">
												<input name="itemId" type="hidden" value={item.id} />
												<input name="imageId" type="hidden" value={image.id} />
												<button type="submit" data-testid="remove-item-image">Entfernen</button>
											</form>
										</div>
									{/each}
								</details>
								<details class="sale-management" data-testid="item-sale-section">
									<summary>Verkauf erfassen</summary>
									{#if item.soldAt}
										<p class="sold-summary">
											Verkauft am {new Date(item.soldAt).toLocaleDateString('de-DE')} über {saleChannelLabels[item.saleChannel ?? 'other']}
											{#if item.saleProceedsCents !== null}
												· Erlös {formatPrice(item.saleProceedsCents)} €
											{/if}
										</p>
										<form method="POST" action="?/unmarkItemSold">
											<input name="itemId" type="hidden" value={item.id} />
											<button type="submit" data-testid="unmark-item-sold">Verkauf zurücknehmen</button>
										</form>
									{:else}
										<form method="POST" action="?/markItemSold">
											<input name="itemId" type="hidden" value={item.id} />
											<div class="form-grid">
												<label>
													<span>Kanal</span>
													<select name="channel" aria-label="Verkaufskanal">
														{#each Object.entries(saleChannelLabels) as [channel, label]}
															<option value={channel}>{label}</option>
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
								</details>
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
		padding: 0 1.5rem 4rem;
	}

	.masthead {
		position: sticky;
		top: 0;
		z-index: 65;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin: 0 -1.5rem 2rem;
		padding: 0.9rem 1.5rem;
		background: var(--glass);
		backdrop-filter: blur(14px) saturate(1.4);
		-webkit-backdrop-filter: blur(14px) saturate(1.4);
		border-bottom: 1px solid var(--color-border);
	}

	.brand {
		align-items: center;
		color: var(--color-accent-strong);
		display: flex;
		font-size: 1.2rem;
		font-weight: 800;
		gap: 9px;
		letter-spacing: -0.02em;
		text-decoration: none;
	}

	.brand::before {
		animation: passalong-pulse 2.4s ease-in-out infinite;
		background: var(--color-amber);
		border-radius: 50%;
		box-shadow: 0 0 12px var(--color-amber);
		content: '';
		display: inline-block;
		height: 10px;
		width: 10px;
	}

	@keyframes passalong-pulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.55;
			transform: scale(0.82);
		}
	}

	.masthead > p {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		margin: 0;
	}

	.session-control {
		display: block;
	}

	.session-control button {
		background: transparent;
		border: 0;
		border-radius: 999px;
		color: var(--color-danger);
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.5rem 0.9rem;
	}

	.session-control button:hover {
		background: var(--color-danger-soft);
		filter: none;
	}

	.password-help {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-tile);
		margin-top: 1.5rem;
		padding: 0.9rem 1.1rem;
	}

	.password-help summary {
		cursor: pointer;
		font-weight: 700;
	}

	.password-help form {
		margin-top: 1rem;
	}

	.authenticated-password-help {
		margin: 0 0 1.5rem auto;
		max-width: 37rem;
	}

	.collection-list {
		display: grid;
		gap: 0.5rem;
		margin-top: 1.5rem;
	}

	.collection-list a {
		color: var(--color-accent);
		font-weight: 700;
		text-decoration: none;
	}

	.onboarding {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		margin: 8vh auto 0;
		max-width: 26rem;
		padding: 1.75rem 1.6rem;
	}

	.eyebrow {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		margin: 0 0 0.4rem;
		text-transform: uppercase;
	}

	h1,
	h2 {
		letter-spacing: -0.02em;
	}

	h1 {
		font-size: 1.6rem;
		line-height: 1.1;
		margin: 0;
	}

	h2 {
		font-size: 1.15rem;
		margin: 0;
	}

	.intro,
	.empty {
		color: var(--color-text-muted);
		line-height: 1.55;
		margin: 0.75rem 0 1.4rem;
	}

	.empty {
		padding: 3.5rem 1rem;
		text-align: center;
	}

	form {
		display: grid;
		gap: 1rem;
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
	select,
	textarea {
		background: var(--color-input);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-text);
		font: inherit;
		padding: 0.68rem 0.85rem;
		transition:
			border-color 0.25s ease,
			box-shadow 0.25s ease;
	}

	input:focus,
	select:focus,
	textarea:focus {
		border-color: var(--color-ice);
		box-shadow: 0 0 0 4px var(--focus-ring);
		outline: none;
	}

	textarea {
		resize: vertical;
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

	.collection-header h1 {
		color: var(--color-accent-strong);
	}

	.collection-header > p {
		color: var(--color-text-muted);
		margin: 0;
	}

	.workspace {
		display: grid;
		gap: 2rem;
		grid-template-columns: minmax(16rem, 0.75fr) minmax(0, 1.75fr);
		padding-top: 2rem;
	}

	.item-form {
		align-self: start;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		display: grid;
		gap: 1.25rem;
		padding: 1.4rem;
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
		grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
	}

	article {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-tile);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		transition:
			transform 0.3s cubic-bezier(0.2, 0.7, 0.3, 1),
			box-shadow 0.3s ease;
	}

	article:hover {
		box-shadow: var(--shadow-tile-hover);
		transform: translateY(-3px);
	}

	.item-image {
		align-items: center;
		aspect-ratio: 1;
		background: linear-gradient(135deg, var(--color-surface-strong), var(--fog));
		color: var(--color-accent);
		display: flex;
		font-size: 2.4rem;
		font-weight: 800;
		justify-content: center;
		width: 100%;
	}

	.item-image.photo {
		height: auto;
		object-fit: cover;
	}

	.item-copy {
		display: flex;
		flex-direction: column;
		flex: 1;
		padding: 0.85rem 0.9rem 0.9rem;
	}

	.item-copy h2 {
		font-size: 0.92rem;
		font-weight: 700;
		line-height: 1.3;
	}

	.price {
		color: var(--color-accent);
		font-size: 1.02rem;
		font-weight: 800;
		margin: 0.3rem 0 0;
	}

	.metadata,
	.notes {
		color: var(--color-text-muted);
		font-size: 0.8rem;
		line-height: 1.45;
		margin: 0.5rem 0 0;
	}

	.notes {
		border-top: 1px solid var(--color-border);
		margin-top: auto;
		padding-top: 0.5rem;
	}

	.sold-badge {
		align-self: flex-start;
		background: var(--color-ok-soft);
		border: 1px solid var(--color-ok-border);
		border-radius: 999px;
		color: var(--color-ok);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.03em;
		margin: 0.5rem 0 0;
		padding: 3px 10px;
	}

	.sold-summary {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		margin: 0.75rem 0;
	}

	.sale-management {
		border-top: 1px solid var(--color-border);
		margin-top: 0.75rem;
		padding: 0.55rem 0.2rem 0;
	}

	.sale-management summary {
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 700;
	}

	.sale-management form {
		margin-top: 0.75rem;
	}

	.sale-statistics {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-tile);
		margin-bottom: 1.5rem;
		padding: 1.25rem;
	}

	.sale-statistics h2 {
		font-size: 1.1rem;
		margin: 0.25rem 0 1rem;
	}

	.statistics-grid {
		display: grid;
		gap: 1.5rem;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
	}

	.statistics-group h3 {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		margin: 0 0 0.5rem;
		text-transform: uppercase;
	}

	.statistics-group ul {
		display: grid;
		gap: 0.4rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.statistics-group li {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		font-size: 0.9rem;
	}

	.statistics-value {
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.stand-link {
		align-self: center;
		color: var(--color-accent);
		font-size: 0.85rem;
		font-weight: 700;
		text-decoration: none;
	}

	.stand-link:hover {
		text-decoration: underline;
	}

	.collection-switcher {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding-bottom: 0.25rem;
	}

	.collection-switcher a {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		color: var(--color-text-muted);
		font-size: 0.82rem;
		font-weight: 700;
		padding: 0.35rem 0.95rem;
		text-decoration: none;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}

	.collection-switcher a:hover {
		background: var(--color-accent-soft);
	}

	.collection-switcher a[aria-current='page'] {
		background: var(--color-accent-strong);
		border-color: var(--color-accent-strong);
		box-shadow: var(--shadow-cta);
		color: #fff;
	}

	.image-management {
		margin-top: 0.75rem;
	}

	.image-management summary {
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 700;
	}

	.image-row {
		align-items: center;
		display: flex;
		gap: 0.5rem;
		justify-content: space-between;
		margin-top: 0.4rem;
	}

	.image-name {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		word-break: break-all;
	}

	.inline-form {
		display: block;
	}

	.inline-form button {
		background: transparent;
		border: 1px solid var(--color-danger);
		box-shadow: none;
		color: var(--color-danger);
		font-size: 0.75rem;
		padding: 0.35rem 0.7rem;
	}

	@media (max-width: 48rem) {
		.masthead,
		.collection-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.masthead {
			align-items: center;
			flex-direction: row;
		}

		.masthead > p {
			display: none;
		}

		.workspace {
			grid-template-columns: 1fr;
		}
	}
</style>
