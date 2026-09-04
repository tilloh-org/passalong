<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children, data } = $props();

	let menuOpen = $state(false);
	let instanceAdminOpen = $state(false);
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
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="description" content="Manage the things you no longer need — and give them a second home." />
</svelte:head>

	<header class="masthead" class:nav-overflow={navOverflow} bind:this={headerElement}>
		<h1 class="brand-wrap">
			<a class="brand" href="/">
				<img class="header-logo" src="/passalong-icon.svg" alt="" />
				passalong
			</a>
		</h1>
		{#if data.header?.isAuthenticated}
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
				<a
					class="profile-avatar"
					href="/profil"
					aria-label="Profil öffnen"
					title="Profil"
					data-testid="profile-avatar-link"
				>
					{#if data.header?.profile?.avatarStorageKey}
						<img class="profile-avatar-img" src={`/media/${encodeURIComponent(data.header?.profile?.avatarStorageKey ?? '')}`} alt="" />
					{:else}
						<span class="profile-avatar-fallback">{(data.header?.profile?.displayName ?? 'P').slice(0, 1).toUpperCase()}</span>
					{/if}
				</a>
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
					href="/"
					onclick={() => setMenuOpen(false)}
				>
					+ Neu
				</a>
				<hr class="nav-divider" />
				{#if data.header?.isInstanceAdmin}
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
				<hr class="nav-divider" />
				<form class="nav-logout" method="POST" action="/abmelden?/logout">
					<button type="submit" onclick={() => setMenuOpen(false)}>Abmelden</button>
				</form>
			</nav>
		{/if}
	</header>


<main class="layout-main">
	{@render children()}
</main>
<style>
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
		gap: var(--gap-action-row, 0.6rem);
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
		font: inherit;
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

</style>
