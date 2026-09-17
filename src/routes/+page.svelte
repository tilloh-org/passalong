<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/icon.svelte';
	import TileImage from '$lib/components/tile-image.svelte';
	import { formatPrice } from '$lib/utils/format';
	import { minimumPasswordLength } from '$lib/password-policy';
	import { t } from '$lib/i18n/index.svelte';
	import ItemFilterForm from '$lib/components/item-filter-form.svelte';

	let { data, form } = $props();

	const appliedFilters = $derived(data.appliedFilters);
	const hasActiveFilters = $derived(
		Boolean(
			appliedFilters.query ||
			appliedFilters.category ||
			appliedFilters.condition ||
			appliedFilters.status
		)
	);

	let resetPanelOpen = $state(false);

	/**
	 * Translate a category key in the active locale.
	 *
	 * @param {string} category - A category key such as `books`.
	 * @returns {string} Human-readable category label.
	 */
	const categoryLabel = (category: string) => t(`category.${category}`);

	/**
	 * Translate a condition key in the active locale.
	 *
	 * @param {string} condition - A condition key such as `good`.
	 * @returns {string} Human-readable condition label.
	 */
	const conditionLabel = (condition: string) => t(`condition.${condition}`);

	/**
	 * Translate a sale channel key in the active locale.
	 *
	 * @param {string} channel - A sale channel key such as `flea-market`.
	 * @returns {string} Human-readable channel label.
	 */
	const saleChannelLabel = (channel: string) => t(`channel.${channel}`);

	/**
	 * Format a YYYY-MM month key as a localized month label.
	 *
	 * @param {string} month - Month key in the form YYYY-MM.
	 * @returns {string} Human-readable month label.
	 */
	function formatSaleMonth(month: string): string {
		const [year, monthNumber] = month.split('-');
		if (!year || !/^\d{1,2}$/.test(monthNumber)) {
			return month;
		}
		return `${t(`month.${Number(monthNumber)}`)} ${year}`;
	}

	let importFile: File | undefined = $state();
	let importSizeError = $state('');
	// Mirrors the server-side cap in +page.server.ts; keep the two in step.
	const maximumImportUploadBytes = 256 * 1024 * 1024;
	let importReport = $state<{
		users: Array<{
			sourceId: string;
			username: string;
			items: number;
			images: number;
			passwordResetRequired: boolean;
		}>;
		counts: {
			users: number;
			collections: number;
			items: number;
			marketDays: number;
			expenses: number;
		};
		media: { files: number; checksumsMatch: boolean };
		warnings: string[];
		publicStandPages: Array<{ username: string; collectionName: string }>;
	} | null>(null);
	let importStagingToken: string | undefined = $state();
	let selectedAdmin = $state('');

	/**
	 * Bind the import file input to the prerequisite state.
	 *
	 * @param {Event} event - The change event from the file input.
	 * @returns {void}
	 */
	function onImportFileChange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		importFile = input.files?.[0];
		// The server rejects an oversized archive anyway; checking here saves the operator a long
		// upload that would only end in a broken-request page.
		importSizeError =
			importFile && importFile.size > maximumImportUploadBytes
				? t('import.tooLarge', {
						megabytes: String(Math.round(maximumImportUploadBytes / (1024 * 1024)))
					})
				: '';
	}

	$effect(() => {
		const report = (form as { importReport?: typeof importReport } | undefined)?.importReport;
		const token = (form as { importStagingToken?: string } | undefined)?.importStagingToken;
		if (report) {
			importReport = report;
		}
		if (token) {
			importStagingToken = token;
		}
	});

	const importUploadReady = $derived(Boolean(importFile) && importSizeError === '');
</script>

<svelte:head>
	<title>{data.collection ? `${data.collection.name} · passalong` : 'passalong'}</title>
	<meta name="description" content={t('portfolio.metaDescription')} />
</svelte:head>

<main>
	{#if form && 'csrfError' in form && form.csrfError}
		<p class="form-error" role="alert">{form.csrfError}</p>
	{/if}

	{#if !data.isAuthenticated}
		<section class="onboarding" aria-labelledby="onboarding-title">
			<img class="login-logo" src="/passalong-icon.svg" alt="passalong" />
			{#if data.isInitialSetup}
				<p class="eyebrow">{t('portfolio.welcomeEyebrow')}</p>
				<h1 id="onboarding-title">{t('portfolio.setupTitle')}</h1>
				<p class="intro">{t('portfolio.setupIntro')}</p>
				<form method="POST" action="?/register">
					<label>
						<span>{t('portfolio.username')}</span>
						<input name="username" autocomplete="username" required />
					</label>
					<label>
						<span>{t('portfolio.yourName')}</span>
						<input name="displayName" autocomplete="name" required />
					</label>
					<label>
						<span>{t('portfolio.password')}</span>
						<input
							name="password"
							type="password"
							autocomplete="new-password"
							minlength={minimumPasswordLength}
							required
						/>
					</label>
					{#if form?.registerError}
						<p class="form-error" role="alert">{form.registerError}</p>
					{/if}
					<button type="submit">{t('portfolio.createAccount')}</button>
				</form>

				<section class="instance-import" aria-labelledby="import-title" data-testid="import-panel">
					<h2 id="import-title"><Icon name="package" />{t('import.title')}</h2>
					<p class="import-intro">{t('import.intro')}</p>

					{#if !importStagingToken}
						<form
							method="POST"
							action="?/stageInstanceImport"
							enctype="multipart/form-data"
							data-testid="import-stage-form"
						>
							<input
								name="importArchive"
								id="import-archive"
								type="file"
								accept=".zip,application/zip"
								data-testid="import-input"
								class="visually-hidden-input"
								required
								onchange={onImportFileChange}
							/>
							<label class="file-button" for="import-archive"
								><Icon name="upload" size="sm" />{importFile
									? importFile.name
									: t('import.chooseArchive')}</label
							>
							{#if importSizeError}
								<p class="form-error" role="alert">{importSizeError}</p>
							{/if}
							{#if form && 'importError' in form && form.importError}
								<p class="form-error" role="alert">{form.importError}</p>
							{/if}
							<button
								type="submit"
								disabled={!importUploadReady}
								aria-disabled={!importUploadReady}
							>
								<Icon name="upload" size="sm" />{t('import.prepare')}
							</button>
						</form>
					{:else}
						{#if importReport}
							<section
								class="import-report"
								aria-labelledby="import-report-title"
								data-testid="import-report"
							>
								<h3 id="import-report-title"><Icon name="check" />{t('import.reportTitle')}</h3>
								<dl class="import-counts">
									<div>
										<dt>{t('import.reportUsers')}</dt>
										<dd>{importReport.counts.users}</dd>
									</div>
									<div>
										<dt>{t('import.reportCollections')}</dt>
										<dd>{importReport.counts.collections}</dd>
									</div>
									<div>
										<dt>{t('import.reportItems')}</dt>
										<dd>{importReport.counts.items}</dd>
									</div>
									<div>
										<dt>{t('import.reportMarketDays')}</dt>
										<dd>{importReport.counts.marketDays}</dd>
									</div>
									<div>
										<dt>{t('import.reportExpenses')}</dt>
										<dd>{importReport.counts.expenses}</dd>
									</div>
									<div>
										<dt>{t('import.reportMedia')}</dt>
										<dd>
											{importReport.media.files} ·
											{importReport.media.checksumsMatch
												? t('import.checksumsOk')
												: t('import.checksumsFailed')}
										</dd>
									</div>
								</dl>

								<div class="import-table-scroll">
									<table class="import-users">
										<caption>{t('import.userTableCaption')}</caption>
										<thead>
											<tr>
												<th scope="col">{t('import.colUsername')}</th>
												<th scope="col">{t('import.colItems')}</th>
												<th scope="col">{t('import.colImages')}</th>
												<th scope="col">{t('import.colPassword')}</th>
											</tr>
										</thead>
										<tbody>
											{#each importReport.users as user (user.sourceId)}
												<tr>
													<td data-label={t('import.colUsername')}>{user.username}</td>
													<td data-label={t('import.colItems')}>{user.items}</td>
													<td data-label={t('import.colImages')}>{user.images}</td>
													<td data-label={t('import.colPassword')}>
														{user.username === selectedAdmin
															? t('import.passwordNew')
															: user.passwordResetRequired
																? t('import.passwordReset')
																: t('import.passwordKept')}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>

								{#if importReport.publicStandPages.length > 0}
									<div class="import-warnings">
										<h4>{t('import.warnings')}</h4>
										<ul>
											{#each importReport.publicStandPages as page (page.username)}
												<li>{t('import.publicStandNote', { username: page.username })}</li>
											{/each}
										</ul>
									</div>
								{/if}

								<form
									method="POST"
									action="?/activateInstanceImport"
									data-testid="import-activate-form"
								>
									<input type="hidden" name="stagingToken" value={importStagingToken} />
									<fieldset>
										<legend>{t('import.selectAdmin')}</legend>
										<p class="import-hint">{t('import.selectAdminHint')}</p>
										{#each importReport.users as user (user.sourceId)}
											<label class="admin-choice">
												<input
													type="radio"
													name="adminUsername"
													value={user.username}
													bind:group={selectedAdmin}
													required
												/>
												<span>{user.username}</span>
											</label>
										{/each}
									</fieldset>
									<label>
										<span>{t('import.newAdminPassword')}</span>
										<input
											name="adminPassword"
											type="password"
											autocomplete="new-password"
											minlength={minimumPasswordLength}
											required
										/>
									</label>
									<p class="import-hint">{t('import.newAdminPasswordHint')}</p>
									<button type="submit" disabled={!selectedAdmin} aria-disabled={!selectedAdmin}>
										<Icon name="check" size="sm" />{t('import.activate')}
									</button>
								</form>
							</section>
						{/if}
					{/if}
				</section>
			{:else}
				<p class="eyebrow">{t('portfolio.welcomeBackEyebrow')}</p>
				<h1 id="onboarding-title">{t('portfolio.loginTitle')}</h1>
				<p class="intro">{t('portfolio.loginIntro')}</p>
				<form method="POST" action="?/login">
					<label>
						<span>{t('portfolio.username')}</span>
						<input name="username" autocomplete="username" required />
					</label>
					<label>
						<span>{t('portfolio.password')}</span>
						<input name="password" type="password" autocomplete="current-password" required />
					</label>
					{#if form?.loginError}
						<p class="form-error" role="alert">{form.loginError}</p>
					{/if}
					<button type="submit">{t('portfolio.login')}</button>
				</form>
				<button
					class="reset-toggle"
					type="button"
					onclick={() => (resetPanelOpen = !resetPanelOpen)}
				>
					{t('portfolio.changePasswordWithCode')}
				</button>
				{#if resetPanelOpen}
					<form class="password-help" method="POST" action="?/resetPassword">
						<label>
							<span>{t('portfolio.username')}</span>
							<input name="username" autocomplete="username" required />
						</label>
						<label>
							<span>{t('portfolio.resetCode')}</span>
							<input name="resetSecret" type="password" autocomplete="one-time-code" required />
						</label>
						<label>
							<span>{t('portfolio.newPassword')}</span>
							<input
								name="password"
								type="password"
								autocomplete="new-password"
								minlength={minimumPasswordLength}
								required
							/>
						</label>
						{#if form && 'resetError' in form && form.resetError}
							<p class="form-error" role="alert">{form.resetError}</p>
						{/if}
						<button type="submit">{t('portfolio.resetPassword')}</button>
					</form>
				{/if}
			{/if}
		</section>
	{:else if !data.collection}
		<section class="onboarding" aria-labelledby="collections-title">
			<p class="eyebrow">{t('portfolio.yourAreaEyebrow')}</p>
			<h1 id="collections-title">{t('portfolio.collectionsTitle')}</h1>
			<p class="intro">{t('portfolio.collectionsIntro')}</p>
			<form method="POST" action="?/createCollection">
				<label>
					<span>{t('portfolio.collectionName')}</span>
					<input name="collectionName" required />
				</label>
				{#if form?.createCollectionError}
					<p class="form-error" role="alert">{form.createCollectionError}</p>
				{/if}
				<button type="submit">{t('portfolio.createCollection')}</button>
			</form>
			{#if data.collections.length}
				<nav class="collection-list" aria-label={t('portfolio.yourCollections')}>
					{#each data.collections as collection (collection.id)}
						<a href={`/?collection=${encodeURIComponent(collection.id)}`}>{collection.name}</a>
					{/each}
				</nav>
			{/if}
		</section>
	{:else}
		<section class="collection-header" aria-labelledby="collection-title">
			<div>
				<p class="eyebrow">{t('portfolio.yourItemsEyebrow')}</p>
				<h1 id="collection-title">Portfolio</h1>
			</div>
			<p>{t('portfolio.itemsCount', { count: data.items.length })}</p>
		</section>

		{#if data.collections.length > 1}
			<nav
				class="collection-switcher"
				aria-label={t('portfolio.switchCollection')}
				data-testid="collection-switcher"
			>
				{#each data.collections as collection (collection.id)}
					<a
						href={`/?collection=${encodeURIComponent(collection.id)}`}
						aria-current={collection.id === data.collection.id ? 'page' : undefined}
					>
						{collection.name}
					</a>
				{/each}
			</nav>
		{/if}

		<div class="workspace">
			<div class="item-form-column">
				<section class="item-form" aria-labelledby="add-item-title">
					<div>
						<p class="eyebrow">{t('portfolio.addItemEyebrow')}</p>
						<h2 id="add-item-title">{t('portfolio.addItemTitle')}</h2>
					</div>
					<form method="POST" action="?/addItem">
						<input name="collectionId" type="hidden" value={data.collection.id} />
						<label>
							<span>{t('portfolio.itemTitle')}</span>
							<input name="title" required />
						</label>
						<div class="form-grid">
							<label>
								<span>{t('portfolio.price')}</span>
								<input
									name="priceEuros"
									type="text"
									inputmode="decimal"
									placeholder={t('portfolio.priceExample')}
									required
								/>
							</label>
							<label>
								<span>{t('portfolio.category')}</span>
								<select name="category" aria-label={t('portfolio.category')}>
									{#each data.categoryOptions as category (category)}
										<option value={category}>{categoryLabel(category)}</option>
									{/each}
								</select>
							</label>
							<label>
								<span>{t('portfolio.condition')}</span>
								<select name="condition" aria-label={t('portfolio.condition')}>
									{#each data.conditionOptions as condition (condition)}
										<option value={condition}>{conditionLabel(condition)}</option>
									{/each}
								</select>
							</label>
						</div>
						<label>
							<span>{t('portfolio.externalDescription')}</span>
							<textarea
								name="externalDescription"
								rows="3"
								data-testid="item-external-description-input"></textarea>
						</label>
						<label>
							<span>{t('portfolio.internalNotes')}</span>
							<textarea name="internalNotes" rows="3"></textarea>
						</label>
						<div class="flag-checkboxes">
							<label class="checkbox">
								<input
									name="isComplete"
									type="checkbox"
									value="1"
									data-testid="item-complete-checkbox"
								/>
								<span>{t('portfolio.isComplete')}</span>
							</label>
							<label class="checkbox">
								<input
									name="isFunctional"
									type="checkbox"
									value="1"
									data-testid="item-functional-checkbox"
								/>
								<span>{t('portfolio.isFunctional')}</span>
							</label>
						</div>
						{#if form?.addItemError}
							<p class="form-error" role="alert">{form.addItemError}</p>
						{/if}
						<button type="submit">
							<Icon name="plus" />
							{t('portfolio.addItem')}
						</button>
						{#if data.createdItemId}
							<a
								class="manage-images-link"
								href={`/items/${encodeURIComponent(data.createdItemId)}`}
								data-testid="manage-images-link"
							>
								<Icon name="photo" />
								{t('portfolio.manageImages')}
							</a>
						{/if}
					</form>
				</section>
			</div>

			<div class="items-column">
				{#if data.saleStatistics && data.saleStatistics.soldItemCount > 0}
					<section
						class="sale-statistics"
						aria-labelledby="sale-statistics-title"
						data-testid="sale-statistics"
					>
						<p class="eyebrow">{t('portfolio.saleStatisticsEyebrow')}</p>
						<h2 id="sale-statistics-title">
							<Icon name="euro" tone="ok" />
							{t('portfolio.soldSummary', {
								count: data.saleStatistics.soldItemCount,
								proceeds: formatPrice(data.saleStatistics.totalProceedsCents)
							})}
						</h2>
						<div class="statistics-grid">
							<div class="statistics-group">
								<h3>{t('portfolio.byChannel')}</h3>
								<ul data-testid="sale-statistics-channels">
									{#each data.saleStatistics.proceedsByChannel as entry (entry.channel)}
										<li>
											<span>{saleChannelLabel(entry.channel)}</span>
											<span class="statistics-value"
												>{entry.soldItemCount}× · {formatPrice(entry.totalProceedsCents)} €</span
											>
										</li>
									{/each}
								</ul>
							</div>
							<div class="statistics-group">
								<h3>{t('portfolio.byMonth')}</h3>
								<ul data-testid="sale-statistics-months">
									{#each data.saleStatistics.proceedsByMonth as entry (entry.month)}
										<li>
											<span>{formatSaleMonth(entry.month)}</span>
											<span class="statistics-value"
												>{entry.soldItemCount}× · {formatPrice(entry.totalProceedsCents)} €</span
											>
										</li>
									{/each}
								</ul>
							</div>
						</div>
					</section>
				{/if}
				<ItemFilterForm
					action="/"
					hiddenFields={data.collection ? { collection: data.collection.id } : {}}
					{appliedFilters}
					categoryOptions={data.categoryOptions}
					conditionOptions={data.conditionOptions}
					hasActive={hasActiveFilters}
					resetHref={data.collection
						? `/?collection=${encodeURIComponent(data.collection.id)}`
						: '/'}
					testIdPrefix="filter"
				/>
				<section class="items" aria-labelledby="items-title">
					{#if data.items.length}
						<div class="item-grid">
							{#each data.items as item (item.id)}
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
								<article
									data-testid="item-card"
									class="tile-link"
									tabindex="0"
									onclick={() => goto(`/items/${encodeURIComponent(item.id)}`)}
									onkeydown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') {
											goto(`/items/${encodeURIComponent(item.id)}`);
										}
									}}
								>
									<div class="tile-media">
										{#if item.coverImageKey}
											<TileImage
												class="item-image photo"
												storageKey={item.coverImageKey}
												alt={item.title}
											/>
										{:else}
											<div class="item-image" aria-hidden="true">
												{item.title.slice(0, 1).toUpperCase()}
											</div>
										{/if}
										<span class="kat">{categoryLabel(item.category)}</span>
									</div>
									<div class="item-copy">
										<h2>{item.title}</h2>
										<p class="price">{formatPrice(item.priceCents)} €</p>
									</div>
									<div class="tile-bottom">
										{#if item.soldAt}
											<span class="badge sold" data-testid="item-sold-badge"
												><Icon name="check" size="sm" />{t(
													'portfolio.sold'
												)}{item.saleProceedsCents !== null
													? ` · ${formatPrice(item.saleProceedsCents)} €`
													: ''}</span
											>
										{:else}
											<span class="badge open"
												><Icon name="package" size="sm" />{t('portfolio.open')}</span
											>
											<form method="POST" action="?/quickSellItem">
												<input name="itemId" type="hidden" value={item.id} />
												<button class="pay" type="submit" data-testid="quick-sell-item">
													<Icon name="euro" size="sm" />
													{t('portfolio.quickSell')}
												</button>
											</form>
										{/if}
									</div>
								</article>
							{/each}
						</div>
					{:else if hasActiveFilters}
						<p class="empty" data-testid="filter-empty-state">{t('portfolio.noItemsForFilters')}</p>
					{:else}
						<p class="empty">{t('portfolio.waitingForFirstItem')}</p>
					{/if}
				</section>
			</div>
		</div>
	{/if}
</main>

<style>
	main {
		max-width: 72rem;
		margin: 0 auto;
		padding: 0 1.5rem 4rem;
	}

	nav a,
	nav a:hover {
		background: var(--color-accent-soft);
		transform: translateY(-1px);
	}

	nav a[aria-current='page'] {
		background: var(--color-accent-strong);
		box-shadow: var(--shadow-cta);
		color: #fff;
	}

	.password-help {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-tile);
		padding: 1.1rem 1.2rem;
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

	.instance-import {
		border-top: 1px solid var(--color-border);
		display: grid;
		gap: 0.6rem;
		margin-top: 1.6rem;
		padding-top: 1.4rem;
	}

	.instance-import h2 {
		align-items: center;
		display: flex;
		font-size: 1.05rem;
		gap: 0.4rem;
		margin: 0;
	}

	.import-intro,
	.import-hint {
		color: var(--color-text-muted);
		font-size: 0.82rem;
		line-height: 1.5;
		margin: 0;
	}

	.instance-import form {
		display: grid;
		gap: var(--gap-action-row);
	}

	.instance-import {
		min-width: 0;
	}

	.instance-import fieldset {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		display: grid;
		gap: 0.4rem;
		margin: 0;
		padding: 0.85rem 0.95rem;
	}

	.instance-import legend {
		color: var(--color-text-muted);
		font-size: 0.82rem;
		font-weight: 700;
		padding: 0 0.35rem;
	}

	.admin-choice {
		align-items: center;
		display: flex;
		font-size: 0.88rem;
		gap: 0.5rem;
		padding: 0.3rem 0;
	}

	/* Follows the project's checkbox convention: no native control, explicit theme tokens. */
	.admin-choice input[type='radio'] {
		appearance: none;
		background-color: var(--color-surface-strong);
		border: 1px solid var(--color-border);
		border-radius: 50%;
		box-shadow: none;
		cursor: pointer;
		height: 1.05rem;
		margin: 0;
		padding: 0;
		position: relative;
		width: 1.05rem;
	}

	.admin-choice input[type='radio']:focus-visible {
		border-color: var(--color-ice);
		box-shadow: 0 0 0 4px var(--focus-ring);
		outline: none;
	}

	.admin-choice input[type='radio']:checked {
		border-color: var(--color-accent);
		border-width: 0.3rem;
	}

	.admin-choice:has(input[type='radio']:checked) span {
		color: var(--color-accent-strong);
		font-weight: 700;
	}

	.instance-import button[type='submit'] {
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
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-accent);
		cursor: pointer;
		display: inline-flex;
		font-size: 0.88rem;
		font-weight: 700;
		gap: 0.35rem;
		justify-self: start;
		max-width: 100%;
		overflow: hidden;
		padding: 0.6rem 0.95rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-button:hover {
		background: var(--color-accent-soft);
	}

	.import-report {
		display: grid;
		gap: 0.8rem;
	}

	.import-report h3 {
		align-items: center;
		display: flex;
		font-size: 0.95rem;
		gap: 0.4rem;
		margin: 0;
	}

	.import-counts {
		display: grid;
		gap: 0.5rem 1rem;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		margin: 0;
	}

	.import-counts div {
		display: grid;
		gap: 0.1rem;
	}

	.import-counts dt {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.import-counts dd {
		font-size: 0.95rem;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		margin: 0;
	}

	@media (min-width: 30rem) {
		.import-counts dd,
		.import-users td:not(:first-child),
		.import-users th:not(:first-child) {
			white-space: nowrap;
		}
	}

	.import-users {
		border-collapse: collapse;
		font-size: 0.85rem;
		width: 100%;
	}

	.import-users caption {
		color: var(--color-text-muted);
		font-size: 0.78rem;
		font-weight: 700;
		padding-bottom: 0.35rem;
		text-align: left;
	}

	.import-users th,
	.import-users td {
		border-bottom: 1px solid var(--color-border);
		padding: 0.35rem 0.4rem;
		text-align: left;
	}

	.import-users th {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.import-users td:not(:first-child),
	.import-users th:not(:first-child) {
		text-align: right;
	}

	.import-table-scroll {
		overflow-x: auto;
	}

	/* Narrow screens: every row becomes a labelled block so no column is cut off. */
	@media (max-width: 30rem) {
		.import-table-scroll {
			overflow-x: visible;
		}

		.import-users thead {
			border: 0;
			clip-path: inset(50%);
			height: 1px;
			overflow: hidden;
			position: absolute;
			white-space: nowrap;
			width: 1px;
		}

		.import-users,
		.import-users tbody,
		.import-users tr,
		.import-users td {
			display: block;
			width: 100%;
		}

		.import-users tr {
			border: 1px solid var(--color-border);
			border-radius: var(--radius-control);
			margin-bottom: 0.5rem;
			padding: 0.6rem 0.7rem;
		}

		.import-users td {
			border-bottom: 0;
			display: flex;
			justify-content: space-between;
			padding: 0.15rem 0;
			text-align: right;
		}

		.import-users td::before {
			color: var(--color-text-muted);
			content: attr(data-label);
			font-size: 0.72rem;
			font-weight: 700;
			letter-spacing: 0.04em;
			text-transform: uppercase;
		}

		.import-users td:first-child {
			border-bottom: 1px solid var(--color-border);
			font-weight: 700;
			margin-bottom: 0.35rem;
			padding-bottom: 0.35rem;
		}
	}

	.import-warnings {
		background: var(--color-accent-soft);
		border-radius: var(--radius-control);
		font-size: 0.8rem;
		padding: 0.7rem 0.85rem;
	}

	.import-warnings h4 {
		font-size: 0.78rem;
		margin: 0 0 0.3rem;
	}

	.import-warnings ul {
		margin: 0;
		padding-left: 1.1rem;
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

	.flag-checkboxes {
		display: flex;
		gap: 1rem;
	}

	label.checkbox {
		align-items: center;
		display: flex;
		flex-direction: row;
		gap: 0.45rem;
	}

	label.checkbox span {
		color: var(--color-text);
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
	}

	label.checkbox input[type='checkbox'] {
		appearance: none;
		background-color: var(--color-surface-strong);
		background-image: none;
		background-position: center;
		background-repeat: no-repeat;
		background-size: 0.8rem;
		border: 1px solid var(--color-border);
		border-radius: 0.3rem;
		box-shadow: none;
		cursor: pointer;
		height: 1.05rem;
		margin: 0;
		padding: 0;
		width: 1.05rem;
	}

	label.checkbox input[type='checkbox']:focus-visible {
		border-color: var(--color-ice);
		box-shadow: 0 0 0 4px var(--focus-ring);
		outline: none;
	}

	label.checkbox:has(input[name='isComplete']:checked) span {
		color: var(--color-ok);
	}

	label.checkbox:has(input[name='isFunctional']:checked) span {
		color: var(--color-info, #3884ff);
	}

	label.checkbox:has(input[name='isComplete']:checked) input[type='checkbox'] {
		background-color: var(--color-ok);
		background-image: var(--checkbox-checkmark);
		border-color: var(--color-ok);
	}

	label.checkbox:has(input[name='isFunctional']:checked) input[type='checkbox'] {
		background-color: var(--color-info, #3884ff);
		background-image: var(--checkbox-checkmark);
		border-color: var(--color-info, #3884ff);
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

	select {
		appearance: none;
		background-image: var(--select-arrow);
		background-position: right var(--select-arrow-inset) center;
		background-repeat: no-repeat;
		background-size: var(--select-arrow-size);
		padding-right: var(--select-control-end-padding);
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

	.item-form select {
		background-color: var(--color-input);
		background-image:
			var(--select-form-arrow),
			linear-gradient(135deg, var(--color-surface), var(--color-surface-strong));
		background-position:
			right var(--select-arrow-inset) center,
			center;
		background-repeat: no-repeat;
		background-size:
			var(--select-form-arrow-size),
			100% 100%;
		border-color: var(--color-border);
		box-shadow:
			inset 0 1px 0 var(--glass),
			0 1px 2px var(--color-border);
		font-weight: 600;
		min-height: 2.85rem;
		padding-right: calc(var(--select-arrow-inset) + var(--select-form-arrow-size) + 0.7rem);
	}

	.item-form select:hover:not(:disabled) {
		background-image:
			var(--select-form-arrow),
			linear-gradient(135deg, var(--color-surface), var(--color-accent-soft));
		border-color: var(--color-ice);
		box-shadow:
			inset 0 1px 0 var(--glass),
			0 4px 12px var(--color-accent-soft);
	}

	/* Keep the focus ring visible: the select rules above set box-shadow at the
	   same specificity but later in the sheet, so the shared :focus rule alone
	   would be overridden. */
	.item-form select:focus,
	.item-form select:focus-visible {
		border-color: var(--color-ice);
		box-shadow: 0 0 0 4px var(--focus-ring);
		outline: none;
	}

	button {
		align-items: center;
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border: 0;
		border-radius: var(--radius-control);
		box-shadow: var(--shadow-btn);
		color: white;
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		font-size: 0.95rem;
		font-weight: 700;
		gap: 0.4rem;
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

	.collection-header {
		align-items: end;
		border-bottom: 1px solid var(--color-border);
		display: flex;
		gap: 1rem;
		justify-content: space-between;
		padding-bottom: 0;
	}

	.collection-header h1 {
		color: var(--color-accent-strong);
	}

	.collection-header > p {
		color: var(--color-text-muted);
		margin: 0;
	}

	.workspace {
		align-items: start;
		display: grid;
		gap: 2rem;
		grid-template-columns: minmax(16rem, 0.75fr) minmax(0, 1.75fr);
		padding-top: 2rem;
	}

	.item-form-column {
		display: grid;
		gap: 1.5rem;
	}

	.items-column {
		display: grid;
		gap: 1.5rem;
	}

	.item-form {
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

	.manage-images-link {
		align-items: center;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-accent);
		display: flex;
		font-size: 0.9rem;
		font-weight: 700;
		gap: 0.4rem;
		justify-content: center;
		padding: 0.6rem 1.1rem;
		text-decoration: none;
	}

	.manage-images-link:hover {
		background: var(--color-accent-soft);
	}

	.item-grid {
		display: grid;
		gap: 1rem;
		grid-auto-rows: 1fr;
		grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
	}

	article {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-tile);
		display: flex;
		flex-direction: column;
		height: 100%;
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

	:global(.item-image.photo) {
		aspect-ratio: 1;
		height: auto;
		width: 100%;
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
		align-items: center;
		border-radius: 999px;
		display: inline-flex;
		font-size: 0.68rem;
		font-weight: 800;
		gap: 0.25rem;
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
		align-items: center;
		background: var(--color-ok-soft);
		border: 1px solid var(--color-ok-border);
		border-radius: var(--radius-small);
		box-shadow: none;
		color: var(--color-ok);
		display: inline-flex;
		font-size: 0.78rem;
		font-weight: 700;
		gap: 0.25rem;
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
		align-items: center;
		display: flex;
		font-size: 1.1rem;
		gap: 0.4rem;
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

	.password-help {
		display: grid;
		gap: 0.85rem;
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
