<script lang="ts">
	import { page } from '$app/state';
	let { data, form } = $props();

	const avatarFallback = $derived((data.profile.displayName ?? 'P').slice(0, 1).toUpperCase());
	const standUrl = $derived(data.activeCollection ? `${page.url.origin}/stand/${encodeURIComponent(data.activeCollection.id)}` : '');

	let avatarFile: File | undefined = $state();
	let restoreFile: File | undefined = $state();
	let standIntroDraft = $state('');
	let standIntroBaseline = $state('');
	let deleteAccountDraft = $state('');
	let deleteAccountDialog = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		standIntroBaseline = data.activeCollection?.standIntro ?? '';
		standIntroDraft = data.activeCollection?.standIntro ?? '';
		deleteAccountDraft = '';
	});

	/**
	 * Bind the avatar file input to the prerequisite state.
	 *
	 * @param {Event} event - The change event from the file input.
	 * @returns {void}
	 */
	function onAvatarFileChange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		avatarFile = input.files?.[0];
	}

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

	const avatarReady = $derived(Boolean(avatarFile));
	const restoreReady = $derived(Boolean(restoreFile));
	const standIntroChanged = $derived(standIntroDraft !== standIntroBaseline);
	const deleteAccountReady = $derived(deleteAccountDraft.trim().toLowerCase() === data.profile.username);

	function openDeleteAccountDialog(): void {
		deleteAccountDraft = '';
		if (!deleteAccountDialog?.open) {
			deleteAccountDialog?.showModal();
			queueMicrotask(() => {
				deleteAccountDialog?.querySelector<HTMLInputElement>('[data-testid="delete-account-input"]')?.focus();
			});
		}
	}

	async function copyStandLink(): Promise<void> {
		await navigator.clipboard.writeText(standUrl);
	}
</script>

<svelte:head>
	<title>Profil · passalong</title>
</svelte:head>

<main class="profile">
	<header class="masthead">
		<a class="brand" href="/">
			<img class="header-logo" src="/passalong-icon.svg" alt="" />
			passalong
		</a>
		<div class="masthead-actions">
			<a class="back-link" href="/">← Zurück zum Portfolio</a>
			<form method="POST" action="?/logout" class="logout-form">
				<button type="submit" class="logout-btn" data-testid="profile-logout">Abmelden</button>
			</form>
		</div>
	</header>

	{#if form && 'csrfError' in form && form.csrfError}
		<p class="form-error" role="alert">{form.csrfError}</p>
	{/if}

	<section class="profile-card" aria-labelledby="profile-title">
		<p class="eyebrow">Dein Zugang</p>
		<h1 id="profile-title">Profil</h1>

		<div class="profile-layout">
			<div class="avatar-column">
				<div class="avatar-large" data-testid="profile-avatar">
					{#if data.profile.avatarStorageKey}
						<img
							class="avatar-img"
							src={`/media/${encodeURIComponent(data.profile.avatarStorageKey)}`}
							alt="Profilbild von {data.profile.displayName}"
						/>
					{:else}
						<span class="avatar-fallback">{avatarFallback}</span>
					{/if}
				</div>
				<form method="POST" action="?/uploadAvatar" enctype="multipart/form-data" class="avatar-form">
					<input
						name="avatar"
						id="avatar-file"
						type="file"
						accept="image/png,image/jpeg,image/webp"
						data-testid="avatar-input"
						class="visually-hidden-input"
						required
						onchange={onAvatarFileChange}
					/>
					<label class="file-button" for="avatar-file">🖼 Bild auswählen</label>
					<button type="submit" disabled={!avatarReady} aria-disabled={!avatarReady}>Avatar speichern</button>
				</form>
				{#if data.profile.avatarStorageKey}
					<form method="POST" action="?/removeAvatar" class="avatar-remove-form">
						<button type="submit" class="danger" data-testid="remove-avatar">Avatar entfernen</button>
					</form>
				{/if}
				{#if form?.avatarError}
					<p class="form-error" role="alert">{form.avatarError}</p>
				{/if}
			</div>

			<div class="details-column">
				<form method="POST" action="?/updateProfile" class="panel" data-testid="profile-details-form">
					<h2>Stammdaten</h2>
					<label>
						<span>Benutzername</span>
						<input value={data.profile.username} disabled />
					</label>
					<label>
						<span>Anzeigename</span>
						<input name="displayName" value={data.profile.displayName} required data-testid="display-name-input" />
					</label>
					{#if form?.updateProfileError}
						<p class="form-error" role="alert">{form.updateProfileError}</p>
					{/if}
					<button type="submit" data-testid="save-profile">Änderungen speichern</button>
				</form>

				{#if data.activeCollection}
					<section class="panel stand-panel" aria-labelledby="stand-title" data-testid="stand-panel">
						<h2 id="stand-title">🛒 Meine Angebote</h2>
						<p class="stand-hint">
							Eine Galerie deiner offenen Artikel — ohne Login für Käufer erreichbar. Ideal als QR-Code am Stand.
						</p>
						<form method="POST" action="?/saveStandIntro" data-testid="stand-intro-form">
							<input name="collectionId" type="hidden" value={data.activeCollection.id} />
							<label>
								<span>Einleitung für die Standseite</span>
								<textarea
									name="standIntro"
									rows="3"
									placeholder="optional — z.B. ein paar Sätze zu deinem Sortiment"
									data-testid="stand-intro-input"
									bind:value={standIntroDraft}>{data.activeCollection.standIntro}</textarea>
							</label>
							<p class="stand-hint">Wird auf deiner Standseite unter deinem Namen angezeigt.</p>
						{#if form?.standIntroError}
							<p class="form-error" role="alert">{form.standIntroError}</p>
						{/if}
						<button type="submit" data-testid="save-stand-intro" disabled={!standIntroChanged} aria-disabled={!standIntroChanged}>✓ Einleitung speichern</button>
					</form>

					<hr class="stand-divider" />

					<div class="stand-actions">
						<button type="button" class="secondary" onclick={() => copyStandLink()} data-testid="copy-stand-link">
							🔗 Link kopieren
						</button>
						<a
							class="stand-open"
							href={`/stand/${encodeURIComponent(data.activeCollection.id)}`}
							target="_blank"
							rel="noopener"
							data-testid="open-stand-link"
						>
							↗ Meine Angebote öffnen
						</a>
					</div>
				</section>
			{/if}

				<form method="POST" action="?/changePassword" class="panel" data-testid="password-form">
					<h2>Passwort ändern</h2>
					<label>
						<span>Aktuelles Passwort</span>
						<input name="currentPassword" type="password" autocomplete="current-password" required />
					</label>
					<label>
						<span>Neues Passwort</span>
						<input
							name="password"
							type="password"
							autocomplete="new-password"
							minlength={data.minimumPasswordLength}
							maxlength={data.maximumPasswordLength}
							required
						/>
					</label>
					<p class="password-hint">Mindestens {data.minimumPasswordLength} Zeichen.</p>
					{#if form?.changePasswordError}
						<p class="form-error" role="alert">{form.changePasswordError}</p>
					{/if}
					<button type="submit" data-testid="save-password">Passwort speichern</button>
				</form>

				{#if data.isInstanceAdmin}
					<section class="panel backup-panel" aria-labelledby="backup-title" data-testid="backup-panel">
						<h2 id="backup-title">Backup &amp; Restore</h2>
						<div class="backup-grid">
							<div class="backup-block">
								<h3>Vollständiges Backup</h3>
								<p class="backup-hint">Lädt eine ZIP-Datei mit Datenbank, Medien und Prüfsummen-Manifest herunter.</p>
								<a class="backup-download" href="/profil/backup" download data-testid="download-backup">
									⬇ Backup herunterladen
								</a>
							</div>
							<div class="backup-block">
								<h3>Restore</h3>
								<p class="backup-hint">
									Das Hochladen ersetzt die gesamte Instanz (Datenbank und Medien) durch das Backup. Die Sitzung wird beendet.
								</p>
								<form method="POST" action="?/restoreBackup" enctype="multipart/form-data" data-testid="restore-form">
									<input
										name="backupArchive"
										id="backup-file"
										type="file"
										accept=".zip,application/zip"
										data-testid="restore-input"
										class="visually-hidden-input"
										required
									/>
									<label class="file-button" for="backup-file">📦 Backup-Datei auswählen</label>
									{#if form?.backupError}
										<p class="form-error" role="alert">{form.backupError}</p>
									{/if}
									<button type="submit" class="danger" data-testid="restore-submit" disabled={!restoreReady} aria-disabled={!restoreReady}>Restore ausführen</button>
								</form>
							</div>
						</div>
					</section>
				{/if}
				<section class="panel delete-account-panel" aria-labelledby="delete-account-title" data-testid="delete-account-panel">
					<h2 id="delete-account-title">Konto löschen</h2>
					<p class="delete-account-hint">
						Das löscht dein Konto, deine Sammlungen und deine Artikel unwiderruflich. Die Bestätigung öffnet sich erst nach Klick auf den Lösch-Button.
					</p>
					<button type="button" class="danger delete-account-trigger" data-testid="delete-account-trigger" onclick={() => openDeleteAccountDialog()}>
						Konto löschen
					</button>
				</section>

				<dialog
					bind:this={deleteAccountDialog}
					class="delete-account-dialog"
					aria-labelledby="delete-account-dialog-title"
					data-testid="delete-account-dialog"
				>
					<div class="dialog-head">
						<h3 id="delete-account-dialog-title">Konto löschen bestätigen</h3>
						<button type="button" class="secondary" onclick={() => deleteAccountDialog?.close()}>Schließen</button>
					</div>
					<p class="dialog-hint">
						Das löscht dein Konto, deine Sammlungen und deine Artikel unwiderruflich. Zum Bestätigen gib bitte deinen Benutzernamen ein.
					</p>
					<div class="delete-account-warning" role="note" aria-label="Warnhinweis zur Konto-Löschung">
						<span aria-hidden="true">⚠️</span>
						<span>Mit der Bestätigung werden deine Account-Daten unwiederbringlich gelöscht.</span>
					</div>
					<form method="POST" action="?/deleteAccount" class="delete-account-form" data-testid="delete-account-form">
						<label>
							<span>Benutzername bestätigen</span>
							<input
								name="confirmUsername"
								autocomplete="username"
								autocapitalize="off"
								autocorrect="off"
								spellcheck="false"
								placeholder={data.profile.username}
								bind:value={deleteAccountDraft}
								data-testid="delete-account-input"
								required
							/>
						</label>
						{#if form?.deleteAccountError}
							<p class="form-error" role="alert">{form.deleteAccountError}</p>
						{/if}
						<button type="submit" class="danger" data-testid="delete-account-submit" disabled={!deleteAccountReady} aria-disabled={!deleteAccountReady}>Konto endgültig löschen</button>
					</form>
				</dialog>
			</div>
		</div>

	</section>
</main>

<style>
	.profile {
		margin: 0 auto;
		max-width: 56rem;
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

	.logout-btn {
		background: transparent;
		border: 1px solid var(--color-danger);
		box-shadow: none;
		color: var(--color-danger);
		font-size: 0.8rem;
		padding: 0.5rem 0.9rem;
	}

	.logout-btn:hover {
		background: var(--color-danger-soft);
		box-shadow: none;
		transform: none;
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

	.profile-card {
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
		margin: 0.2rem 0 1.25rem;
	}

	.profile-layout {
		display: grid;
		gap: 1.5rem;
		grid-template-columns: minmax(12rem, 0.55fr) minmax(0, 1.45fr);
	}

	.avatar-column {
		display: grid;
		gap: 0.75rem;
		align-content: start;
		justify-items: start;
	}

	.avatar-large {
		border-radius: 999px;
		height: 8rem;
		overflow: hidden;
		width: 8rem;
	}

	.avatar-img {
		height: 100%;
		object-fit: cover;
		width: 100%;
	}

	.avatar-fallback {
		align-items: center;
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border-radius: 999px;
		color: white;
		display: flex;
		font-size: 2.6rem;
		font-weight: 800;
		height: 100%;
		justify-content: center;
		width: 100%;
	}

	.avatar-form {
		display: grid;
		gap: var(--gap-action-row);
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

	.details-column {
		display: grid;
		gap: 1.5rem;
	}

	.panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		display: grid;
		gap: 0.85rem;
		padding: 1.25rem;
	}

	.panel h2 {
		font-size: 1.05rem;
		margin: 0;
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

	input:disabled {
		color: var(--color-text-muted);
		cursor: not-allowed;
		opacity: 0.7;
	}

	.password-hint {
		color: var(--color-text-muted);
		font-size: 0.8rem;
		margin: 0;
	}

	.form-error {
		background: var(--color-danger-soft);
		border: 1px solid var(--color-danger);
		border-radius: var(--radius-control);
		color: var(--color-text);
		margin: 0;
		padding: 0.65rem 0.8rem;
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
		justify-self: end;
		padding: 0.7rem 1.25rem;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease,
			filter 0.2s ease;
	}

	button:hover:not(:disabled) {
		box-shadow: var(--shadow-btn-hover);
		filter: brightness(1.08);
		transform: translateY(-2px);
	}

	button:disabled {
		cursor: not-allowed;
		filter: grayscale(0.6) opacity(0.55);
		box-shadow: none;
		transform: none;
	}

	button.danger {
		background: transparent;
		border: 1px solid var(--color-danger);
		box-shadow: none;
		color: var(--color-danger);
		font-size: 0.8rem;
		padding: 0.5rem 0.9rem;
	}

	button.danger:hover:not(:disabled) {
		background: var(--color-danger-soft);
		box-shadow: none;
		transform: none;
	}

	.delete-account-panel {
		display: grid;
		gap: 0.85rem;
	}

	.delete-account-panel .delete-account-trigger {
		justify-self: end;
	}

	.delete-account-dialog {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		max-width: min(32rem, 92vw);
		padding: 1.25rem;
		width: 32rem;
	}

	.delete-account-dialog::backdrop {
		background: rgba(10, 20, 28, 0.6);
	}

	.dialog-head {
		align-items: center;
		display: flex;
		gap: 0.75rem;
		justify-content: space-between;
	}

	.dialog-head h3 {
		font-size: 1.05rem;
		margin: 0;
	}

	.dialog-head button.secondary {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		box-shadow: none;
		color: var(--color-accent);
		font-size: 0.85rem;
		padding: 0.5rem 0.9rem;
	}

	.dialog-head button.secondary:hover {
		background: var(--color-accent-soft);
		transform: none;
	}

	.dialog-hint {
		color: var(--color-text-muted);
		font-size: 0.82rem;
		line-height: 1.5;
		margin: 0.25rem 0 0.75rem;
	}

	.delete-account-warning {
		align-items: center;
		background: var(--color-danger-soft);
		border: 1px solid var(--color-danger);
		border-radius: var(--radius-control);
		color: var(--color-danger);
		display: flex;
		gap: 0.5rem;
		font-size: 0.85rem;
		font-weight: 800;
		line-height: 1.4;
		margin-bottom: 0.85rem;
		padding: 0.75rem 0.9rem;
	}

	.delete-account-warning span:last-child {
		color: var(--color-danger);
	}

	.delete-account-form {
		display: grid;
		gap: var(--gap-action-row);
	}

	.stand-panel h2 {
		font-size: 1.05rem;
		margin: 0 0 0.4rem;
	}

	.stand-panel form {
		display: grid;
		gap: var(--gap-action-row);
	}

	.stand-hint {
		color: var(--color-text-muted);
		font-size: 0.82rem;
		line-height: 1.5;
		margin: 0 0 0.4rem;
	}

	.stand-divider {
		border: 0;
		border-top: 1px solid var(--color-border);
		margin: var(--gap-action-block) 0 var(--gap-action-row);
	}

	.stand-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-action-row);
		justify-content: flex-end;
	}

	.stand-panel button.secondary {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		box-shadow: none;
		color: var(--color-accent);
		font-size: 0.85rem;
		padding: 0.5rem 0.9rem;
	}

	.stand-panel button.secondary:hover {
		background: var(--color-accent-soft);
		transform: none;
	}

	.stand-open {
		align-items: center;
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border-radius: var(--radius-control);
		box-shadow: var(--shadow-btn);
		color: white;
		font-size: 0.85rem;
		font-weight: 700;
		padding: 0.5rem 0.9rem;
		text-decoration: none;
	}

	.stand-open:hover {
		filter: brightness(1.08);
	}

	textarea {
		background: var(--color-input);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-text);
		font: inherit;
		padding: 0.68rem 0.85rem;
	}

	textarea:focus {
		border-color: var(--color-ice);
		box-shadow: 0 0 0 4px var(--focus-ring);
		outline: none;
	}

	.backup-panel {
		display: block;
	}

	.backup-panel h2 {
		font-size: 1.05rem;
		margin: 0 0 0.75rem;
	}

	.backup-grid {
		display: grid;
		gap: 1.25rem;
		grid-template-columns: 1fr 1fr;
	}

	.backup-block {
		display: grid;
		gap: 0.4rem;
		align-content: start;
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

	.backup-download {
		justify-self: end;
	}

	.backup-block .file-button {
		justify-self: end;
	}

	@media (max-width: 48rem) {
		.profile-layout {
			grid-template-columns: 1fr;
		}

		.avatar-column {
			column-gap: 0.9rem;
			grid-template-columns: minmax(8rem, 8.5rem) minmax(0, 1fr);
			row-gap: var(--gap-action-row);
		}

		.avatar-large {
			grid-row: 1 / span 3;
		}

		.avatar-form,
		.avatar-remove-form {
			grid-column: 2;
		}

		.backup-grid {
			grid-template-columns: 1fr;
		}
	}
</style>