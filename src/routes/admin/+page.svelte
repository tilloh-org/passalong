<script lang="ts">
	import { page } from '$app/state';
	import { t } from '$lib/i18n/index.svelte';

	let { data, form } = $props();

	let restoreFile: File | undefined = $state();

	/**
	 * Bind the restore file input to the prerequisite state.
	 *
	 * @param {Event} event - The change event from the file input.
	 * @returns {void}
	 */
	function onRestoreFileChange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		restoreFile = input.files?.[0];
	}

	const restoreReady = $derived(Boolean(restoreFile));
</script>

<svelte:head>
	<title>{t('admin.title')} · passalong</title>
</svelte:head>

<main class="instance-admin">
	{#if form && 'csrfError' in form && form.csrfError}
		<p class="form-error" role="alert">{form.csrfError}</p>
	{/if}

	<section class="admin-card" aria-labelledby="admin-title">
		<p class="eyebrow">{t('admin.eyebrow')}</p>
		<h1 id="admin-title">{t('admin.title')}</h1>
		<p class="intro">{t('admin.passwordResetIntro')}</p>

		<div class="password-help instance-administration">
			<h2>{t('admin.passwordResetTitle')}</h2>
			<form method="POST" action="?/createPasswordReset">
				<label>
					<span>{t('admin.usernameOfAccount')}</span>
					<input name="username" autocomplete="username" required />
				</label>
				{#if form && 'passwordResetIssueError' in form && form.passwordResetIssueError}
					<p class="form-error" role="alert">{form.passwordResetIssueError}</p>
				{/if}
				<button type="submit">{t('admin.createResetCode')}</button>
			</form>
			{#if form && 'passwordResetSecret' in form && form.passwordResetSecret}
				<section class="issued-reset-secret" aria-labelledby="issued-reset-secret-title">
					<h3 id="issued-reset-secret-title">{t('admin.oneTimeResetCode')}</h3>
					<code class="reset-secret" data-testid="issued-password-reset-secret"
						>{form.passwordResetSecret}</code
					>
					<p>{t('admin.resetSecretHint')}</p>
				</section>
			{/if}
		</div>

		<div class="password-help backup-administration" data-testid="backup-panel">
			<h2>{t('admin.backupRestoreTitle')}</h2>
			<div class="backup-grid">
				<div class="backup-block">
					<h3>{t('admin.fullBackupTitle')}</h3>
					<p class="backup-hint">{t('admin.fullBackupHint')}</p>
					<a class="backup-download" href="/profile/backup" download data-testid="download-backup">
						{t('admin.downloadBackup')}
					</a>
				</div>
				<div class="backup-block">
					<h3>{t('admin.restoreTitle')}</h3>
					<p class="backup-hint">
						{t('admin.restoreHint')}
					</p>
					<form
						method="POST"
						action="?/restoreBackup"
						enctype="multipart/form-data"
						data-testid="restore-form"
					>
						<input
							name="backupArchive"
							id="backup-file"
							type="file"
							accept=".zip,application/zip"
							data-testid="restore-input"
							class="visually-hidden-input"
							required
							onchange={onRestoreFileChange}
						/>
						<label class="file-button" for="backup-file"
							>{restoreFile ? `📦 ${restoreFile.name}` : t('admin.chooseBackupFile')}</label
						>
						{#if form?.backupError}
							<p class="form-error" role="alert">{form.backupError}</p>
						{/if}
						<button
							type="submit"
							class="danger"
							data-testid="restore-submit"
							disabled={!restoreReady}
							aria-disabled={!restoreReady}>{t('admin.runRestore')}</button
						>
					</form>
				</div>
			</div>
		</div>
	</section>
</main>

<style>
	.instance-admin {
		margin: 0 auto;
		max-width: 44rem;
		padding: 0 1.5rem 4rem;
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

	.backup-administration {
		margin-top: 1.25rem;
	}

	.backup-grid {
		display: grid;
		gap: 1.25rem;
		grid-template-columns: 1fr 1fr;
	}

	.backup-block {
		align-content: start;
		display: grid;
		gap: 0.4rem;
	}

	.backup-block h3 {
		font-size: 0.95rem;
		margin: 0 0 0.4rem;
	}

	.backup-hint {
		color: var(--color-text-muted);
		font-size: 0.82rem;
		line-height: 1.5;
		margin: 0 0 0.6rem;
	}

	.backup-download {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-accent);
		display: inline-block;
		font-size: 0.9rem;
		font-weight: 700;
		justify-self: end;
		padding: 0.7rem 1.1rem;
		text-decoration: none;
		transition: background 0.2s ease;
	}

	.backup-download:hover {
		background: var(--color-accent-soft);
	}

	.backup-block form {
		display: grid;
		gap: var(--gap-action-row);
	}

	.backup-block button.danger {
		justify-self: end;
	}

	.backup-block .file-button {
		justify-self: end;
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
		transition: background 0.2s ease;
	}

	.file-button:hover {
		background: var(--color-accent-soft);
	}

	button.danger {
		background: transparent;
		border: 1px solid var(--color-danger);
		border-radius: var(--radius-control);
		box-shadow: none;
		color: var(--color-danger);
		font-size: 0.9rem;
		font-weight: 700;
		padding: 0.6rem 1.1rem;
	}

	button.danger:hover:not(:disabled) {
		background: var(--color-danger-soft);
		box-shadow: none;
		transform: none;
	}

	@media (max-width: 48rem) {
		.backup-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
