<script lang="ts">
	import DialogShell from '$lib/components/dialog-shell.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { t } from '$lib/i18n/index.svelte';

	let { data, form } = $props();

	let restoreFile: File | undefined = $state();
	let deleteAccountShell = $state<ReturnType<typeof DialogShell> | null>(null);
	type AccountTarget = { userId: string; username: string };
	let deleteAccountTarget = $state<AccountTarget | null>(null);
	let deleteAccountDraft = $state('');

	const deleteAccountReady = $derived(
		deleteAccountTarget !== null &&
			deleteAccountDraft.trim().toLowerCase() === deleteAccountTarget.username.toLowerCase()
	);

	/**
	 * Open the deletion dialog for one account and clear any typed confirmation.
	 *
	 * @param {{ userId: string; username: string }} account - The account to remove.
	 * @returns {void}
	 */
	function openDeleteAccountDialog(account: { userId: string; username: string }): void {
		deleteAccountTarget = account;
		deleteAccountDraft = '';
		if (!deleteAccountShell?.isOpen()) {
			deleteAccountShell?.open();
		}
	}

	/**
	 * Forget the selected account.
	 *
	 * Runs on every close path — the close control, Escape, and the submit redirect — so a stale
	 * target can never leak into the next dialog opening.
	 *
	 * @returns {void}
	 */
	function forgetDeleteAccountTarget(): void {
		deleteAccountDraft = '';
		deleteAccountTarget = null;
	}

	/**
	 * Format an ISO timestamp for the account list in the active locale.
	 *
	 * @param {string | null} value - ISO timestamp or null when the account never signed in.
	 * @returns {string} A short local date, or a placeholder for a missing value.
	 */
	function formatAccountTimestamp(value: string | null): string {
		if (!value) {
			return t('admin.accountsNeverSignedIn');
		}
		return new Date(value).toLocaleDateString();
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
		<h1 id="admin-title"><Icon name="settings" />{t('admin.title')}</h1>
		<p class="intro">{t('admin.passwordResetIntro')}</p>

		<div class="password-help instance-administration">
			<h2><Icon name="key" />{t('admin.passwordResetTitle')}</h2>
			<form method="POST" action="?/createPasswordReset">
				<label>
					<span>{t('admin.usernameOfAccount')}</span>
					<input name="username" autocomplete="username" required />
				</label>
				{#if form && 'passwordResetIssueError' in form && form.passwordResetIssueError}
					<p class="form-error" role="alert">{form.passwordResetIssueError}</p>
				{/if}
				<button type="submit"><Icon name="key" size="sm" />{t('admin.createResetCode')}</button>
			</form>
			{#if form && 'passwordResetSecret' in form && form.passwordResetSecret}
				<section class="issued-reset-secret" aria-labelledby="issued-reset-secret-title">
					<h3 id="issued-reset-secret-title">
						<Icon name="alert-triangle" tone="warn" />{t('admin.oneTimeResetCode')}
					</h3>
					<code class="reset-secret" data-testid="issued-password-reset-secret"
						>{form.passwordResetSecret}</code
					>
					<p>{t('admin.resetSecretHint')}</p>
				</section>
			{/if}
		</div>

		<div class="password-help accounts-administration" data-testid="accounts-panel">
			<h2><Icon name="user-circle" />{t('admin.accountsTitle')}</h2>
			<p class="backup-hint">{t('admin.accountsIntro')}</p>
			<form method="POST" action="?/createAccount" class="accounts-create-form">
				<label>
					<span>{t('admin.accountsUsername')}</span>
					<input
						name="username"
						autocomplete="off"
						autocapitalize="off"
						autocorrect="off"
						spellcheck="false"
						required
					/>
				</label>
				<label>
					<span>{t('admin.accountsDisplayName')}</span>
					<input name="displayName" autocomplete="off" required />
				</label>
				{#if form && 'accountIssueError' in form && form.accountIssueError}
					<p class="form-error" role="alert">{form.accountIssueError}</p>
				{/if}
				<div class="account-create-actions dialog-actions">
					<button type="submit" data-testid="create-account-submit">
						<Icon name="plus" size="sm" />{t('admin.accountsCreate')}
					</button>
				</div>
			</form>

			{#if form && 'invitationSecret' in form && form.invitationSecret}
				<section
					class="issued-reset-secret"
					aria-labelledby="issued-invitation-secret-title"
					data-testid="issued-invitation-secret"
				>
					<h3 id="issued-invitation-secret-title">
						<Icon name="alert-triangle" tone="warn" />{t('admin.accountsInvitationCode')}
					</h3>
					<code class="reset-secret" data-testid="issued-invitation-secret-value"
						>{form.invitationSecret}</code
					>
					<p>{t('admin.accountsInvitationHint')}</p>
				</section>
			{/if}

			{#if data.accounts.length === 0}
				<p class="backup-hint" data-testid="accounts-empty">{t('admin.accountsEmpty')}</p>
			{/if}
			{#if data.accounts.length > 0}
				<div class="accounts-table-scroll">
					<table class="accounts-table" data-testid="accounts-table">
						<colgroup>
							<col class="col-username" />
							<col class="col-display" />
							<col class="col-created" />
							<col class="col-signed-in" />
							<col class="col-role" />
							<col class="col-action" />
						</colgroup>
						<thead>
							<tr>
								<th scope="col">{t('admin.accountsColumnUsername')}</th>
								<th scope="col">{t('admin.accountsColumnDisplayName')}</th>
								<th scope="col">{t('admin.accountsColumnCreatedAt')}</th>
								<th scope="col">{t('admin.accountsColumnLastSignedInAt')}</th>
								<th scope="col">{t('admin.accountsColumnRole')}</th>
								<th scope="col">{t('admin.accountsColumnActions')}</th>
							</tr>
						</thead>
						<tbody>
							{#each data.accounts as account (account.userId)}
								<tr data-testid="account-row">
									<td>{account.username}</td>
									<td>{account.displayName}</td>
									<td>{formatAccountTimestamp(account.createdAt)}</td>
									<td>{formatAccountTimestamp(account.lastSignedInAt)}</td>
									<td>
										{account.isInstanceAdmin
											? t('admin.accountsRoleAdministrator')
											: t('admin.accountsRoleMember')}
									</td>
									<td>
										{#if !account.isInstanceAdmin}
											<button
												type="button"
												class="danger account-delete-trigger"
												data-testid="account-delete-trigger"
												onclick={() =>
													openDeleteAccountDialog({
														userId: account.userId,
														username: account.username
													})}
											>
												<Icon name="trash" size="sm" />{t('admin.accountsDelete')}
											</button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<div class="password-help backup-administration" data-testid="backup-panel">
			<h2><Icon name="package" />{t('admin.backupRestoreTitle')}</h2>
			<div class="backup-grid">
				<div class="backup-block">
					<h3><Icon name="download" />{t('admin.fullBackupTitle')}</h3>
					<p class="backup-hint">{t('admin.fullBackupHint')}</p>
					<a class="backup-download" href="/profile/backup" download data-testid="download-backup">
						<Icon name="download" size="sm" />
						{t('admin.downloadBackup')}
					</a>
				</div>
				<div class="backup-block">
					<h3><Icon name="upload" />{t('admin.restoreTitle')}</h3>
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
							><Icon name="package" size="sm" />{restoreFile
								? restoreFile.name
								: t('admin.chooseBackupFile')}</label
						>
						{#if form?.backupError}
							<p class="form-error" role="alert">{form.backupError}</p>
						{/if}
						<button
							type="submit"
							class="danger"
							data-testid="restore-submit"
							disabled={!restoreReady}
							aria-disabled={!restoreReady}
							><Icon name="upload" size="sm" />{t('admin.runRestore')}</button
						>
					</form>
				</div>
			</div>
		</div>
	</section>

	<DialogShell
		bind:this={deleteAccountShell}
		labelledBy="admin-delete-account-dialog-title"
		testId="admin-delete-account-dialog"
		onclose={forgetDeleteAccountTarget}
	>
		{#snippet header()}
			<h3 id="admin-delete-account-dialog-title">
				<Icon name="alert-triangle" tone="danger" />{t('admin.accountsDeleteTitle')}
			</h3>
		{/snippet}
		<p class="dialog-hint">{t('admin.accountsDeleteDialogHint')}</p>
		<div
			class="delete-account-warning"
			role="note"
			aria-label={t('admin.accountsDeleteBackupHint')}
		>
			<Icon name="alert-triangle" tone="danger" />
			<span>{t('admin.accountsDeleteBackupHint')}</span>
		</div>
		<div class="delete-account-export">
			<a
				class="secondary delete-account-export-link"
				href="/profile/backup"
				download
				data-testid="admin-download-instance-backup"
				><Icon name="download" size="sm" />{t('admin.downloadBackup')}</a
			>
		</div>
		<form
			method="POST"
			action="?/deleteAccountByAdmin"
			class="delete-account-form"
			data-testid="admin-delete-account-form"
		>
			<input type="hidden" name="accountId" value={deleteAccountTarget?.userId ?? ''} />
			<label>
				<span>{t('admin.accountsDeleteConfirmLabel')}</span>
				<input
					name="confirmUsername"
					autocomplete="off"
					autocapitalize="off"
					autocorrect="off"
					spellcheck="false"
					placeholder={deleteAccountTarget?.username ?? ''}
					bind:value={deleteAccountDraft}
					data-testid="admin-delete-account-input"
					required
				/>
			</label>
			<div class="account-create-actions dialog-actions">
				<button
					type="submit"
					class="danger"
					data-testid="admin-delete-account-submit"
					disabled={!deleteAccountReady}
					aria-disabled={!deleteAccountReady}
					><Icon name="trash" size="sm" />{t('admin.accountsDeleteFinal')}</button
				>
			</div>
		</form>
	</DialogShell>
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
		align-items: center;
		color: var(--color-accent-strong);
		display: flex;
		font-size: 1.5rem;
		gap: 0.45rem;
		margin: 0.2rem 0 0.5rem;
	}

	.intro {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		line-height: 1.5;
		margin: 0 0 1.5rem;
	}

	.password-help {
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		display: grid;
		gap: 0.85rem;
		padding: 1.25rem;
	}

	.password-help h2 {
		align-items: center;
		display: flex;
		font-size: 1.05rem;
		gap: 0.4rem;
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
		align-items: center;
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border: 0;
		border-radius: var(--radius-control);
		box-shadow: var(--shadow-cta);
		color: #fff;
		display: inline-flex;
		font-weight: 700;
		gap: 0.35rem;
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
		align-items: center;
		display: flex;
		font-size: 0.95rem;
		gap: 0.4rem;
		margin: 0;
	}

	.reset-secret {
		background: var(--color-bg-elevated);
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
		align-items: center;
		display: flex;
		font-size: 0.95rem;
		gap: 0.4rem;
		margin: 0 0 0.4rem;
	}

	.backup-hint {
		color: var(--color-text-muted);
		font-size: 0.82rem;
		line-height: 1.5;
		margin: 0 0 0.6rem;
	}

	.backup-download {
		align-items: center;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-accent);
		display: inline-flex;
		font-size: 0.9rem;
		font-weight: 700;
		gap: 0.35rem;
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
		align-items: center;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-accent);
		cursor: pointer;
		display: inline-flex;
		font-size: 0.9rem;
		font-weight: 700;
		gap: 0.35rem;
		justify-self: start;
		padding: 0.7rem 1.1rem;
		transition: background 0.2s ease;
	}

	.file-button:hover {
		background: var(--color-accent-soft);
	}

	button.danger {
		align-items: center;
		background: transparent;
		border: 1px solid var(--color-danger);
		border-radius: var(--radius-control);
		box-shadow: none;
		color: var(--color-danger);
		display: inline-flex;
		font-size: 0.9rem;
		font-weight: 700;
		gap: 0.35rem;
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

	.accounts-create-form {
		display: grid;
		gap: var(--gap-action-block);
		margin-bottom: 1.25rem;
	}

	.accounts-create-form label {
		display: grid;
		gap: 0.3rem;
	}

	.accounts-table {
		border-collapse: collapse;
		font-size: 0.82rem;
		/* A fixed layout keeps the table inside the card: cells wrap instead of widening it. */
		table-layout: fixed;
		width: 100%;
	}

	.accounts-table th,
	.accounts-table td {
		border-bottom: 1px solid var(--color-border);
		/* Words wrap only when they cannot fit, so a long username stays readable
		   instead of overflowing, and short labels never break mid-word. */
		overflow-wrap: break-word;
		padding: 0.45rem 0.35rem;
		text-align: left;
		vertical-align: middle;
	}

	.accounts-table th {
		color: var(--color-text-muted);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		/* Captions wrap between words only; a broken caption reads like a typo. */
		overflow-wrap: normal;
		text-transform: uppercase;
	}

	.account-delete-trigger {
		font-size: 0.75rem;
		padding: 0.3rem 0.45rem;
		white-space: nowrap;
	}

	.delete-account-warning {
		background: var(--color-danger-soft);
		border: 1px solid var(--color-danger);
		border-radius: 0.5rem;
		color: var(--color-danger);
		display: flex;
		font-size: 0.82rem;
		gap: 0.45rem;
		margin-bottom: 0.75rem;
		padding: 0.6rem 0.7rem;
	}

	.delete-account-export {
		margin-bottom: 0.9rem;
	}

	.delete-account-export-link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.82rem;
	}

	.delete-account-form {
		display: grid;
		gap: var(--gap-action-block);
	}

	.delete-account-form label {
		display: grid;
		gap: 0.3rem;
	}

	.accounts-administration {
		/* The grid column must be allowed to shrink, otherwise the table stretches the card. */
		min-width: 0;
	}

	.accounts-create-form,
	.accounts-table-scroll {
		min-width: 0;
	}

	.accounts-table-scroll {
		overflow-x: auto;
	}

	/* Explicit widths keep every column wide enough for its content, the action cell included. */
	.accounts-table .col-username {
		width: 18%;
	}

	.accounts-table .col-display {
		width: 14%;
	}

	.accounts-table .col-created {
		width: 15%;
	}

	.accounts-table .col-signed-in {
		width: 15%;
	}

	.accounts-table .col-role {
		width: 17%;
	}

	.accounts-table .col-action {
		width: 21%;
	}

	/* Both date columns carry a fixed short value, so they never need to wrap. */
	.accounts-table td:nth-child(3),
	.accounts-table td:nth-child(4) {
		white-space: nowrap;
	}

	.accounts-table td:last-child,
	.accounts-table th:last-child {
		text-align: right;
	}
</style>
