<script lang="ts">
	import { page } from '$app/state';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Instanzverwaltung · passalong</title>
</svelte:head>

<main class="instance-admin">
	<header class="masthead">
		<a class="brand" href="/">
			<img class="header-logo" src="/passalong-icon.svg" alt="" />
			passalong
		</a>
		<div class="masthead-actions">
			<a class="back-link" href="/profil">← Zurück zum Profil</a>
		</div>
	</header>

	{#if form && 'csrfError' in form && form.csrfError}
		<p class="form-error" role="alert">{form.csrfError}</p>
	{/if}

	<section class="admin-card" aria-labelledby="admin-title">
		<p class="eyebrow">Technische Verwaltung</p>
		<h1 id="admin-title">Instanzverwaltung</h1>
		<p class="intro">Erzeuge einen einmaligen Zurücksetzungscode für ein Konto. Die bestehenden Sitzungen dieses Kontos werden sofort beendet.</p>

		<div class="password-help instance-administration">
			<h2>Passwort zurücksetzen</h2>
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
			{#if form && 'passwordResetSecret' in form && form.passwordResetSecret}
				<section class="issued-reset-secret" aria-labelledby="issued-reset-secret-title">
					<h3 id="issued-reset-secret-title">Einmaliger Zurücksetzungscode</h3>
					<code class="reset-secret" data-testid="issued-password-reset-secret">{form.passwordResetSecret}</code>
					<p>Den Code jetzt über einen privaten Kanal weitergeben. Er wird nicht erneut angezeigt.</p>
				</section>
			{/if}
		</div>
	</section>
</main>

<style>
	.instance-admin {
		margin: 0 auto;
		max-width: 44rem;
		padding: 0 1.5rem 4rem;
	}

	.masthead {
		align-items: center;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	.brand {
		align-items: center;
		color: var(--color-accent-strong);
		display: flex;
		font-size: 1.1rem;
		font-weight: 800;
		gap: 0.5rem;
		text-decoration: none;
	}

	.header-logo {
		height: 1.6rem;
		width: 1.6rem;
	}

	.masthead-actions {
		align-items: center;
		display: flex;
		gap: 0.9rem;
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

	.admin-card {
		padding: 0 0 2rem;
	}

	.eyebrow {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		margin: 0;
		text-transform: uppercase;
	}

	h1 {
		color: var(--color-accent-strong);
		font-size: 1.5rem;
		margin: 0.2rem 0 0.5rem;
	}

	.intro {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		line-height: 1.5;
		margin: 0 0 1.5rem;
	}

	.password-help {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		display: grid;
		gap: 0.85rem;
		padding: 1.25rem;
	}

	.password-help h2 {
		font-size: 1.05rem;
		margin: 0;
	}

	form {
		display: grid;
		gap: var(--gap-action-row);
	}

	label {
		display: grid;
		gap: 0.3rem;
	}

	label > span {
		color: var(--color-text-muted);
		font-size: 0.82rem;
		font-weight: 700;
	}

	input {
		background: var(--color-input);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-text);
		font: inherit;
		padding: 0.68rem 0.85rem;
	}

	input:focus {
		border-color: var(--color-ice);
		box-shadow: 0 0 0 4px var(--focus-ring);
		outline: none;
	}

	.form-error {
		color: var(--color-danger);
		font-size: 0.85rem;
		margin: 0;
	}

	button[type='submit'] {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border: 0;
		border-radius: var(--radius-control);
		box-shadow: var(--shadow-cta);
		color: #fff;
		font-weight: 700;
		justify-self: end;
		padding: 0.6rem 1.1rem;
	}

	.issued-reset-secret {
		background: var(--color-accent-soft);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-control);
		display: grid;
		gap: 0.4rem;
		padding: 0.9rem 1rem;
	}

	.issued-reset-secret h3 {
		font-size: 0.95rem;
		margin: 0;
	}

	.reset-secret {
		background: var(--color-surface);
		border-radius: var(--radius-small);
		color: var(--color-accent-strong);
		font-family: var(--font-mono, monospace);
		font-size: 0.95rem;
		font-weight: 800;
		padding: 0.4rem 0.6rem;
		word-break: break-all;
	}

	.issued-reset-secret p {
		color: var(--color-text-muted);
		font-size: 0.8rem;
		margin: 0;
	}
</style>
