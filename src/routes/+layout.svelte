<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Icon from '$lib/components/icon.svelte';
	import {
		getLocale,
		initLocale,
		locales,
		setLocale,
		t,
		type Locale
	} from '$lib/i18n/index.svelte';

	let { children, data } = $props();

	let menuOpen = $state(false);
	let theme = $state<'light' | 'dark'>('light');
	let navOverflow = $state(false);
	let headerElement: HTMLElement | undefined = $state();
	let navElement: HTMLElement | undefined = $state();
	let burgerButton: HTMLButtonElement | undefined = $state();
	/** Natural width of the header row while the navigation renders inline. */
	let inlineHeaderWidth = 0;

	initLocale();

	$effect(() => {
		if (!headerElement || !navElement) {
			return;
		}
		// Measure the row's natural width only while the navigation is inline: the
		// drawer renders the same items at a different width, so re-measuring there
		// would flip the decision back and forth and leave the row overflowing.
		const measure = () => {
			if (!navElement || !headerElement) {
				return;
			}
			if (window.matchMedia('(max-width: 880px)').matches) {
				navOverflow = true;
				return;
			}
			if (!navOverflow) {
				inlineHeaderWidth = headerElement.scrollWidth;
			}
			navOverflow = inlineHeaderWidth > 0 && headerElement.clientWidth < inlineHeaderWidth;
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

	// arrange — close the drawer with Escape for keyboard users
	$effect(() => {
		if (!menuOpen) {
			return;
		}
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setMenuOpen(false);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// arrange — move keyboard focus into the drawer on open and back to the burger on close
	$effect(() => {
		if (!menuOpen || !navElement) {
			return;
		}
		navElement.querySelector<HTMLElement>('a, button')?.focus();
		return () => burgerButton?.focus();
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
	 * Switch to the next locale in the list and persist the choice.
	 */
	function cycleLocale(): void {
		const index = locales.indexOf(getLocale());
		const next: Locale = locales[(index + 1) % locales.length];
		setLocale(next);
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
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta
		name="description"
		content="Manage the things you no longer need — and give them a second home."
	/>
</svelte:head>

<header class="masthead" class:nav-overflow={navOverflow} bind:this={headerElement}>
	<h1 class="brand-wrap">
		<a class="brand" href="/">
			<img class="header-logo" src="/passalong-icon.svg" alt="" />
			passalong
		</a>
	</h1>
	{#if data.header?.isAuthenticated}
		<nav class:open={menuOpen} bind:this={navElement}>
			<a class="nav-cta" href="/" onclick={() => setMenuOpen(false)}>
				<Icon name="plus" />
				{t('nav.newItem')}
			</a>
			<a href="/scan" onclick={() => setMenuOpen(false)}>
				<Icon name="scan" />
				{t('nav.scan')}
			</a>
			<a href="/market-days" onclick={() => setMenuOpen(false)} data-testid="nav-market-days-link">
				<Icon name="calendar" />
				{t('nav.marketDays')}
			</a>
			<a
				href="/price-labels"
				onclick={() => setMenuOpen(false)}
				data-testid="nav-price-labels-link"
			>
				<Icon name="tag" />
				{t('nav.priceLabels')}
			</a>
			<a href="/sales" onclick={() => setMenuOpen(false)} data-testid="nav-sale-history-link">
				<Icon name="history" />
				{t('nav.saleHistory')}
			</a>
			<a href="/statistics" onclick={() => setMenuOpen(false)} data-testid="nav-statistics-link">
				<Icon name="chart-bar" />
				{t('nav.statistics')}
			</a>
			{#if data.header?.standPath}
				<a
					href={data.header.standPath}
					onclick={() => setMenuOpen(false)}
					data-testid="nav-stand-link"
				>
					<Icon name="building-store" />
					{t('nav.myStand')}
				</a>
			{/if}
		</nav>
		<span class="header-divider" aria-hidden="true"></span>
		<div class="header-actions">
			<button
				class="burger"
				aria-label={menuOpen ? t('header.menuClose') : t('header.menuOpen')}
				aria-expanded={menuOpen}
				type="button"
				bind:this={burgerButton}
				onclick={() => setMenuOpen(!menuOpen)}
			>
				<span></span><span></span><span></span>
			</button>
			<button
				class="icon-btn theme-toggle"
				aria-label={t('header.toggleTheme')}
				title={t('header.themeTitle')}
				type="button"
				onclick={toggleTheme}
			>
				<Icon name={theme === 'dark' ? 'sun' : 'moon'} />
			</button>
			<button
				class="icon-btn language-toggle"
				aria-label={t('header.language')}
				title={t('header.languageTitle')}
				type="button"
				data-testid="language-toggle"
				onclick={() => cycleLocale()}
			>
				<Icon name="world" />
				<span class="language-label">{getLocale() === 'de' ? 'DE' : 'EN'}</span>
			</button>
			<a
				class="profile-avatar"
				href="/profile"
				aria-label="Profil öffnen"
				title="Profil"
				data-testid="profile-avatar-link"
			>
				{#if data.header?.profile?.avatarStorageKey}
					<img
						class="profile-avatar-img"
						src={`/media/${encodeURIComponent(data.header?.profile?.avatarStorageKey ?? '')}`}
						alt=""
					/>
				{:else}
					<span class="profile-avatar-fallback"
						>{(data.header?.profile?.displayName ?? 'P').slice(0, 1).toUpperCase()}</span
					>
				{/if}
			</a>
		</div>
		<button
			class="nav-backdrop"
			class:open={menuOpen}
			aria-label="Menü schließen"
			type="button"
			onclick={() => setMenuOpen(false)}
		></button>
	{/if}
</header>

<main class="layout-main">
	{@render children()}
</main>

{#if data.header?.isAuthenticated && data.versionLabel}
	<footer class="site-footer" data-testid="site-footer">
		<span class="site-footer-version">{data.versionLabel}</span>
	</footer>
{/if}

<style>
	.layout-main {
		/* Reserve the fixed strip's height so short pages do not hide content behind it. */
		padding-bottom: var(--footer-height);
	}

	.site-footer {
		/* Full-bleed dark strip pinned to the bottom edge of the viewport, on every route — it must
		   not sit at the end of the content flow, which would leave it floating mid-screen on short
		   pages. A hairline top edge keeps it readable against a dark page background. */
		align-items: center;
		background: var(--color-footer-bg);
		border-top: 1px solid var(--color-footer-edge);
		bottom: 0;
		color: var(--color-footer-text);
		display: flex;
		height: var(--footer-height);
		justify-content: flex-start;
		left: 0;
		padding: 0 clamp(0.75rem, 2vw, 1.75rem);
		position: fixed;
		right: 0;
		/* Below the header (65) and the drawer (84+); above page content. */
		z-index: 60;
	}

	.site-footer-version {
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.02em;
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
		margin: 0 0 2rem;
		padding: 0.65rem 1.5rem;
	}
	.brand-wrap {
		font-size: 1.2rem;
		font-weight: 800;
		letter-spacing: 0.02em;
		margin: 0 16px 0 0;
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
		display: inline-flex;
		font-size: 1.1rem;
		gap: 0.3rem;
		height: 40px;
		justify-content: center;
		padding: 0;
		transition: all 0.25s ease;
		width: 40px;
	}
	.language-toggle {
		width: auto;
		padding: 0 0.7rem;
	}
	.language-label {
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.04em;
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
	}
	.header-divider {
		align-self: stretch;
		background: var(--color-border);
		display: block;
		margin: 0 14px;
		width: 1px;
	}
	.profile-avatar {
		align-items: center;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		box-shadow: none;
		display: flex;
		height: 2.6rem;
		justify-content: center;
		overflow: hidden;
		padding: 2px;
		transition: all 0.25s ease;
		width: 2.6rem;
	}
	.profile-avatar:hover,
	.profile-avatar:focus-visible {
		background: var(--color-accent-soft);
		box-shadow: var(--shadow-btn-hover);
		transform: translateY(-1px);
	}
	.profile-avatar-img {
		height: 100%;
		object-fit: cover;
		width: 100%;
	}
	.profile-avatar-fallback {
		align-items: center;
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border-radius: 999px;
		color: white;
		display: flex;
		font-size: 0.95rem;
		font-weight: 800;
		height: 100%;
		justify-content: center;
		width: 100%;
	}
	.burger {
		align-items: center;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		box-shadow: none;
		color: var(--color-accent);
		cursor: pointer;
		display: none;
		flex-direction: column;
		gap: 5px;
		height: 40px;
		justify-content: center;
		padding: 0;
		position: relative;
		transition: all 0.25s ease;
		width: 40px;
		z-index: 86;
	}
	.burger span {
		background: var(--color-accent);
		border-radius: 2px;
		display: block;
		height: 2.5px;
		transition:
			transform 0.3s ease,
			opacity 0.3s ease,
			background 0.25s ease;
		width: 22px;
	}
	.burger:hover {
		background: var(--color-accent-soft);
		box-shadow: var(--shadow-btn-hover);
		transform: translateY(-1px);
	}
	.burger:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
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
		background: var(--scrim);
		border: 0;
		cursor: default;
		height: 100vh;
		height: 100dvh;
		left: 0;
		opacity: 0;
		padding: 0;
		pointer-events: none;
		position: fixed;
		top: 0;
		transition:
			opacity 0.25s ease,
			visibility 0.25s;
		visibility: hidden;
		width: 100vw;
		z-index: 84;
	}
	.nav-backdrop.open {
		opacity: 1;
		pointer-events: auto;
		visibility: visible;
	}
	nav {
		display: flex;
		gap: var(--gap-action-row, 0.6rem);
		margin-left: auto;
	}
	nav a {
		align-items: center;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		box-shadow: none;
		color: var(--color-accent);
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		/* Compact enough that the icon-led navigation still fits inline at a
		   1280px desktop viewport instead of collapsing into the drawer. */
		font-size: 0.82rem;
		font-weight: 600;
		gap: 0.3rem;
		height: 40px;
		justify-content: center;
		padding: 0 8px;
		text-decoration: none;
		transition: all 0.25s ease;
		white-space: nowrap;
	}
	/* Slightly smaller than the global default so seven icon-led pills stay on one row. */
	nav a :global(.icon) {
		height: 1em;
		width: 1em;
	}
	nav a:hover {
		background: var(--color-accent-soft);
		transform: translateY(-1px);
	}
	nav a:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	nav a.nav-cta {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		box-shadow: var(--shadow-cta);
		color: #fff;
		font-weight: 700;
	}
	.masthead.nav-overflow .burger {
		display: flex;
	}
	.masthead.nav-overflow .header-divider {
		display: none;
	}
	.masthead.nav-overflow .header-actions {
		margin-left: auto;
		position: relative;
		z-index: 87;
	}
	.masthead.nav-overflow nav {
		background: var(--color-surface);
		border-left: 1px solid var(--color-border);
		border-top-left-radius: 16px;
		box-shadow: var(--shadow-drawer);
		flex-direction: column;
		height: 100vh;
		height: 100dvh;
		overflow-y: auto;
		padding: 70px 18px 20px;
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
	.masthead.nav-overflow nav a {
		height: 44px;
		width: 100%;
	}
	.masthead.nav-overflow .nav-backdrop {
		display: block;
	}
	@media (max-width: 880px) {
		.masthead .burger {
			display: flex;
		}

		.masthead .header-divider {
			display: none;
		}

		.masthead .header-actions {
			margin-left: auto;
			position: relative;
			z-index: 87;
		}

		.masthead nav {
			background: var(--color-surface);
			border-left: 1px solid var(--color-border);
			border-top-left-radius: 16px;
			box-shadow: var(--shadow-drawer);
			flex-direction: column;
			height: 100vh;
			height: 100dvh;
			overflow-y: auto;
			padding: 70px 18px 20px;
			position: fixed;
			right: 0;
			top: 0;
			transform: translateX(105%);
			transition: transform 0.35s cubic-bezier(0.2, 0.7, 0.3, 1);
			width: min(80vw, 300px);
			z-index: 85;
		}

		.masthead nav.open {
			transform: translateX(0);
		}

		.masthead nav a {
			height: 44px;
			width: 100%;
		}

		.masthead .nav-backdrop {
			display: block;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.masthead.nav-overflow nav,
		.masthead.nav-overflow .nav-backdrop,
		.burger,
		.burger span {
			transition: none;
		}
	}
	@media print {
		/* Never stamp the strip across a printed sheet (price labels are printed from the app). */
		.site-footer {
			display: none;
		}

		.layout-main {
			padding-bottom: 0;
		}
	}
</style>
