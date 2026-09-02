<script lang="ts">
	import { formatPrice } from '$lib/utils/format';
	import { minimumPasswordLength } from '$lib/password-policy';

	let { data, form } = $props();

	let menuOpen = $state(false);
	let instanceAdminOpen = $state(false);
	let passwordPanelOpen = $state(false);
	let resetPanelOpen = $state(false);
	let theme = $state<'light' | 'dark'>('light');
	let navOverflow = $state(false);
	let headerElement: HTMLElement | undefined = $state();
	let navElement: HTMLElement | undefined = $state();

	$effect(() => {
		if (!headerElement || !navElement) {
			return;
		}
		const measure = () => {
			if (!navElement || !headerElement) {
				return;
			}
			// Hysteresis: switch to the drawer as soon as the header row overflows. Switch back to
			// inline only when the whole row (brand + actions + nav) genuinely fits again — measured
			// on the drawer-mode header, where brand and actions still occupy their inline widths.
			const brand = headerElement.querySelector('.brand-wrap');
			const actions = headerElement.querySelector('.header-actions');
			const reservedWidth =
				((brand?.scrollWidth ?? 0) + (actions?.scrollWidth ?? 0)) * 2 + 96;
			if (navOverflow) {
				navOverflow = headerElement.clientWidth - reservedWidth < navElement.scrollWidth;
			} else {
				navOverflow = headerElement.scrollWidth > headerElement.clientWidth + 1;
			}
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(headerElement);
		observer.observe(navElement);
		return () => observer.disconnect();
	});

	$effect(() => {
		const saved = localStorage.getItem('passalong-theme');
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		theme = saved === 'dark' || saved === 'light' ? saved : prefersDark ? 'dark' : 'light';
	});

	/**
	 * Toggle the persisted light/dark theme on the document element.
	 */
	function toggleTheme(): void {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.setAttribute('data-theme', theme);
		localStorage.setItem('passalong-theme', theme);
	}

	/**
	 * Open or close the burger navigation and lock body scrolling while open.
	 *
	 * @param {boolean} open - Whether the drawer should be open.
	 */
	function setMenuOpen(open: boolean): void {
		menuOpen = open;
		document.body.style.overflow = open ? 'hidden' : '';
	}

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

<svelte:window onkeydown={(event) => {
	if (event.key === 'Escape') {
		menuOpen = false;
	}
}} />

<main>
	<header class="masthead" class:nav-overflow={navOverflow} bind:this={headerElement}>
		<h1 class="brand-wrap">
			<a class="brand" href="/">
				<img class="header-logo" src="/passalong-icon.svg" alt="" />
				passalong
			</a>
		</h1>
		{#if data.isAuthenticated}
			<div class="header-actions">
				<button
					class="icon-btn theme-toggle"
					aria-label="Dark Mode umschalten"
					title="Hell/Dunkel"
					type="button"
					onclick={toggleTheme}
				>
					<svg class="icon" aria-hidden="true" focusable="false">
						<use href={theme === 'dark' ? '#icon-sun' : '#icon-moon'} />
					</svg>
				</button>
				<button
					class="burger"
					aria-label={menuOpen ? 'Menü schließen' : 'Menü öffnen'}
					aria-expanded={menuOpen}
					type="button"
					onclick={() => setMenuOpen(!menuOpen)}
				>
					<span></span><span></span><span></span>
				</button>
			</div>
			{#if menuOpen}
				<button class="nav-backdrop open" aria-label="Menü schließen" type="button" onclick={() => setMenuOpen(false)}></button>
			{/if}
			<nav class:open={menuOpen} bind:this={navElement}>
				<a
					class="nav-cta"
					href="/#add-item-title"
					onclick={() => setMenuOpen(false)}
				>
					+ Neu
				</a>
				<hr class="nav-divider" />
				{#if data.isInstanceAdmin}
					<a
						class="instance-admin-link"
						href="/"
						onclick={(event) => {
							event.preventDefault();
							instanceAdminOpen = !instanceAdminOpen;
							setMenuOpen(false);
						}}
					>
						Instanzverwaltung
					</a>
				{/if}
				<a
					class="password-panel-link"
					href="/"
					onclick={(event) => {
						event.preventDefault();
						passwordPanelOpen = !passwordPanelOpen;
						setMenuOpen(false);
					}}
				>
					Passwort ändern
				</a>
				<hr class="nav-divider" />
				<form class="nav-logout" method="POST" action="?/logout">
					<button type="submit" onclick={() => setMenuOpen(false)}>Abmelden</button>
				</form>
			</nav>
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

	{#if data.isAuthenticated && (passwordPanelOpen || instanceAdminOpen)}
		<section class="settings-panel" aria-label="Einstellungen">
			{#if passwordPanelOpen}
				<div class="password-help">
					<h2>Passwort ändern</h2>
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
				</div>
			{/if}
			{#if data.isInstanceAdmin && instanceAdminOpen}
				<div class="password-help instance-administration">
					<h2>Instanzverwaltung</h2>
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
				</div>
			{/if}
		</section>
	{/if}

	{#if !data.isAuthenticated}
		<section class="onboarding" aria-labelledby="onboarding-title">
			<img class="login-logo" src="/passalong-icon.svg" alt="passalong" />
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
				<button class="reset-toggle" type="button" onclick={() => (resetPanelOpen = !resetPanelOpen)}>
					Passwort mit Zurücksetzungscode ändern
				</button>
				{#if resetPanelOpen}
					<form class="password-help" method="POST" action="?/resetPassword">
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
				{/if}
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
				<p class="eyebrow">Deine Artikel</p>
				<h1 id="collection-title">Artikel</h1>
			</div>
			<p>({data.items.length})</p>
		</section>

		{#if data.collections.length > 1}
			<nav class="collection-switcher" aria-label="Sammlungswechsel" data-testid="collection-switcher">
				{#each data.collections as collection (collection.id)}
					<a href={`/?collection=${encodeURIComponent(collection.id)}`} aria-current={collection.id === data.collection.id ? 'page' : undefined}>
						{collection.name}
					</a>
				{/each}
			</nav>
		{/if}

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
							<div class="tile-media">
								{#if item.coverImageKey}
									<img class="item-image photo" src={`/media/${encodeURIComponent(item.coverImageKey)}`} alt={item.title} loading="lazy" />
								{:else}
									<div class="item-image" aria-hidden="true">{item.title.slice(0, 1).toUpperCase()}</div>
								{/if}
								<span class="kat">{categoryLabels[item.category]}</span>
							</div>
							<div class="item-copy">
								<h2>{item.title}</h2>
								<p class="price">{formatPrice(item.priceCents)} €</p>
							</div>
							<div class="tile-bottom">
								{#if item.soldAt}
									<span class="badge sold" data-testid="item-sold-badge">Verkauft{item.saleProceedsCents !== null ? ` · ${formatPrice(item.saleProceedsCents)} €` : ''}</span>
								{:else}
									<span class="badge open">Offen</span>
									<form method="POST" action="?/quickSellItem">
										<input name="itemId" type="hidden" value={item.id} />
										<button class="pay" type="submit" data-testid="quick-sell-item">
											€ Verkaufen
										</button>
									</form>
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
		padding: 0 1.5rem 4rem;
	}

	.masthead {
		position: sticky;
		top: 0;
		z-index: 65;
		align-items: center;
		background: var(--glass);
		backdrop-filter: blur(14px) saturate(1.4);
		-webkit-backdrop-filter: blur(14px) saturate(1.4);
		border-bottom: 1px solid var(--color-border);
		container-type: inline-size;
		display: flex;
		gap: 16px;
		margin: 0 -1.5rem 2rem;
		padding: 0.65rem 1.5rem;
	}

	.brand-wrap {
		font-size: 1.2rem;
		font-weight: 800;
		letter-spacing: 0.02em;
		margin: 0;
	}

	.brand {
		align-items: center;
		color: var(--color-accent-strong);
		display: flex;
		font-size: 1.2rem;
		font-weight: 800;
		gap: 9px;
		letter-spacing: 0.02em;
		text-decoration: none;
	}

	.icon-btn {
		align-items: center;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		box-shadow: none;
		color: var(--color-accent);
		cursor: pointer;
		display: flex;
		font-size: 1.1rem;
		height: 40px;
		justify-content: center;
		padding: 0;
		transition: all 0.25s ease;
		width: 40px;
	}

	.icon-btn:hover {
		background: var(--color-accent-soft);
		box-shadow: none;
		transform: rotate(15deg);
	}

	.icon {
		height: 1.1rem;
		width: 1.1rem;
	}

	.header-logo {
		display: inline-block;
		filter: drop-shadow(var(--shadow-logo));
		flex-shrink: 0;
		height: 22px;
		width: 22px;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
	}

	.burger {
		background: none;
		border: 0;
		border-radius: 12px;
		box-shadow: none;
		cursor: pointer;
		display: none;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 5px;
		height: 40px;
		padding: 0;
		position: relative;
		transition: background 0.25s ease;
		width: 40px;
		z-index: 86;
	}

	.burger:hover {
		background: var(--color-accent-soft);
		box-shadow: none;
		transform: none;
	}

	.burger span {
		background: var(--color-text);
		border-radius: 2px;
		display: block;
		height: 2.5px;
		transition:
			transform 0.3s ease,
			opacity 0.3s ease;
		width: 22px;
	}

	.burger[aria-expanded='true'] span:nth-child(1) {
		transform: translateY(7.5px) rotate(45deg);
	}

	.burger[aria-expanded='true'] span:nth-child(2) {
		opacity: 0;
	}

	.burger[aria-expanded='true'] span:nth-child(3) {
		transform: translateY(-7.5px) rotate(-45deg);
	}

	.nav-backdrop {
		background: rgba(14, 42, 58, 0.4);
		border: 0;
		cursor: default;
		display: none;
		height: 100vh;
		left: 0;
		padding: 0;
		position: fixed;
		top: 0;
		width: 100vw;
		z-index: 84;
	}

	.nav-backdrop.open {
		display: block;
	}

	nav {
		display: flex;
		gap: 4px;
	}

	nav a,
	nav form button {
		align-items: center;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		box-shadow: none;
		color: var(--color-accent);
		cursor: pointer;
		display: inline-flex;
		font-size: 0.9rem;
		font-weight: 600;
		height: 40px;
		justify-content: center;
		padding: 0 14px;
		text-decoration: none;
		transition: all 0.25s ease;
		white-space: nowrap;
	}

	nav a:hover {
		background: var(--color-accent-soft);
		transform: translateY(-1px);
	}

	nav a.nav-cta {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		box-shadow: var(--shadow-cta);
		color: #fff;
		font-weight: 700;
	}

	nav a[aria-current='page'] {
		background: var(--color-accent-strong);
		box-shadow: var(--shadow-cta);
		color: #fff;
	}

	nav form button {
		color: var(--color-danger);
	}

	nav form button:hover {
		background: var(--color-danger-soft);
		transform: translateY(-1px);
	}

	.nav-logout {
		display: block;
		margin-left: 8px;
		padding: 0;
	}

	.nav-divider {
		background: var(--color-border);
		border: 0;
		display: none;
		height: 1px;
		margin: 8px 0;
	}

	.settings-panel {
		display: grid;
		gap: 1rem;
		margin: 0 auto 1.5rem;
		max-width: 26rem;
	}

	.password-help {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-tile);
		padding: 1.1rem 1.2rem;
	}

	.password-help h2 {
		font-size: 1.05rem;
		margin: 0 0 0.75rem;
	}

	.password-help form {
		margin-top: 0;
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

	.reset-toggle {
		background: none;
		border: 0;
		border-radius: var(--radius-small);
		box-shadow: none;
		color: var(--color-accent);
		font-size: 0.85rem;
		font-weight: 600;
		justify-self: center;
		padding: 0.4rem 0.6rem;
		text-decoration: none;
	}

	.reset-toggle:hover {
		background: var(--color-accent-soft);
		text-decoration: underline;
	}

	.reset-toggle + .password-help {
		width: 100%;
	}

	.login-logo {
		display: block;
		filter: drop-shadow(var(--shadow-logo));
		height: 96px;
		margin: 0 auto 18px;
		width: 96px;
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

	.tile-media {
		position: relative;
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

	.kat {
		background: var(--glass);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		border-radius: 999px;
		box-shadow: var(--shadow-tile);
		color: var(--color-accent);
		font-size: 0.66rem;
		font-weight: 800;
		letter-spacing: 0.03em;
		padding: 3px 9px;
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 2;
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

	.tile-bottom {
		align-items: center;
		display: flex;
		gap: 8px;
		justify-content: space-between;
		margin-top: auto;
		padding: 0 0.9rem 0.9rem;
	}

	.badge {
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.03em;
		padding: 4px 10px;
	}

	.badge.open {
		background: var(--color-accent-strong);
		color: #fff;
	}

	.badge.sold {
		background: var(--color-ok-soft);
		border: 1px solid var(--color-ok-border);
		color: var(--color-ok);
	}

	.pay {
		background: var(--color-ok-soft);
		border: 1px solid var(--color-ok-border);
		border-radius: var(--radius-small);
		box-shadow: none;
		color: var(--color-ok);
		font-size: 0.78rem;
		font-weight: 700;
		padding: 8px 12px;
		transition: all 0.25s ease;
	}

	.pay:hover {
		background: var(--color-ok);
		box-shadow: none;
		color: #fff;
		transform: none;
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

	/* Nav läuft auf einer Zeile; läuft sie über den verfügbaren Platz hinaus, übernimmt der Burger */
	nav {
		flex-shrink: 0;
		flex-wrap: nowrap;
	}

	.masthead.nav-overflow .burger {
		display: flex;
	}

	.masthead.nav-overflow nav {
		background: var(--color-surface);
		border-left: 1px solid var(--color-border);
		box-shadow: var(--shadow-card);
		flex-direction: column;
		height: 100vh;
		overflow-y: auto;
		padding: 76px 18px 20px;
		position: fixed;
		right: 0;
		top: 0;
		transform: translateX(105%);
		transition: transform 0.35s cubic-bezier(0.2, 0.7, 0.3, 1);
		width: min(80vw, 300px);
		z-index: 85;
	}

	.masthead.nav-overflow nav.open {
		transform: translateX(0);
	}

	.masthead.nav-overflow nav a,
	.masthead.nav-overflow nav form button {
		border-radius: var(--radius-control);
		font-size: 1rem;
		height: 44px;
		justify-content: flex-start;
		padding: 0 16px;
		width: 100%;
	}

	.masthead.nav-overflow .nav-backdrop {
		display: block;
	}

	.masthead.nav-overflow .nav-divider {
		display: block;
		width: auto;
	}

	.masthead.nav-overflow .nav-logout {
		margin-left: 0;
		margin-top: 24px;
	}

	@media (max-width: 48rem) {
		.collection-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.workspace {
			grid-template-columns: 1fr;
		}
	}
</style>
