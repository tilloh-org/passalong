<script lang="ts">
	import { formatPrice } from '$lib/utils/format';
	import { getLocale, t } from '$lib/i18n/index.svelte';
	import type { SaleHistoryEntry } from '$lib/server/collection-repository';

	let { data, form } = $props();
	let editDialog: HTMLDialogElement | undefined = $state();
	let editItemId = $state('');
	let editItemTitle = $state('');
	let editChannel = $state('flea-market');
	let editProceeds = $state('');
	let editMarketDayId = $state('');

	/**
	 * Translate a technical sale-channel identifier for display.
	 *
	 * @param {string} channel - Technical sale-channel identifier.
	 * @returns {string} Localized sale-channel label.
	 */
	function saleChannelLabel(channel: string): string {
		return t(`channel.${channel}`);
	}

	/**
	 * Format a canonical sale timestamp using the active locale.
	 *
	 * @param {string} timestamp - Canonical UTC ISO timestamp.
	 * @returns {string} Localized date and time.
	 */
	function displayTimestamp(timestamp: string): string {
		return new Date(timestamp).toLocaleString(getLocale(), {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}

	/**
	 * Populate and open the correction dialog for one sale.
	 *
	 * @param {SaleHistoryEntry} sale - Sale selected for correction.
	 */
	function openEditDialog(sale: SaleHistoryEntry): void {
		editItemId = sale.itemId;
		editItemTitle = sale.itemTitle;
		editChannel = sale.saleChannel;
		editProceeds = formatPrice(sale.saleProceedsCents);
		editMarketDayId = sale.marketDayId ?? '';
		editDialog?.showModal();
	}

	/**
	 * Close the correction dialog and clear its item identity.
	 */
	function closeEditDialog(): void {
		editDialog?.close();
		editItemId = '';
	}
</script>

<svelte:head>
	<title>{t('saleHistory.titleSuffix')} · passalong</title>
</svelte:head>

<main class="sales-page">
	<section class="head">
		<p class="eyebrow">{t('portfolio.saleStatisticsEyebrow')}</p>
		<h1 data-testid="sale-history-title">{t('saleHistory.title')}</h1>
		<p class="sub">{t('saleHistory.sub')}</p>
	</section>

	<section class="summary" data-testid="sale-history-summary">
		<strong>{t('saleHistory.summary', { count: data.summary.soldItemCount, proceeds: formatPrice(data.summary.totalProceedsCents) })}</strong>
	</section>

	<section class="filter-panel" aria-labelledby="sale-filter-title">
		<h2 id="sale-filter-title">{t('saleHistory.filters')}</h2>
		<form method="GET" class="filter-form" data-testid="sale-history-filters">
			<label>
				<span>{t('item.marketDay')}</span>
				<select name="marketDayId">
					<option value="">{t('saleHistory.allMarketDays')}</option>
					{#each data.marketDays as marketDay}
						<option value={marketDay.id} selected={data.filters.marketDayId === marketDay.id}>{marketDay.name}</option>
					{/each}
				</select>
			</label>
			<label>
				<span>{t('item.channel')}</span>
				<select name="channel">
					<option value="">{t('saleHistory.allChannels')}</option>
					{#each data.saleChannelOptions as channel}
						<option value={channel} selected={data.filters.channel === channel}>{saleChannelLabel(channel)}</option>
					{/each}
				</select>
			</label>
			<div class="filter-actions">
				<a class="secondary-link" href="/sales">{t('saleHistory.resetFilters')}</a>
				<button type="submit">{t('saleHistory.applyFilters')}</button>
			</div>
		</form>
	</section>

	{#if form?.saleHistoryError}
		<p class="form-error" role="alert" data-testid="sale-history-error">{t(`saleHistory.error.${form.saleHistoryError}`)}</p>
	{/if}

	<section class="sales-list" data-testid="sale-history-list">
		{#if data.sales.length}
			{#each data.sales as sale (sale.itemId)}
				<article class="sale-card" data-testid="sale-history-item">
					<div class="sale-main">
						<div>
							<p class="category-pill">{t(`category.${sale.category}`)}</p>
							<h2>{sale.itemTitle}</h2>
							<p class="sale-date">{t('saleHistory.soldAt', { date: displayTimestamp(sale.soldAt) })}</p>
						</div>
						<strong class="proceeds">{formatPrice(sale.saleProceedsCents)} €</strong>
					</div>
					<div class="sale-meta">
						<span>{saleChannelLabel(sale.saleChannel)}</span>
						<span>{sale.marketDayName ?? t('saleHistory.withoutMarketDay')}</span>
					</div>
					<div class="sale-actions">
						<form method="POST" action="?/reopenItem">
							<input type="hidden" name="itemId" value={sale.itemId} />
							<button type="submit" class="danger" data-testid="sale-history-reopen">{t('saleHistory.reopen')}</button>
						</form>
						<button type="button" data-testid="sale-history-edit" onclick={() => openEditDialog(sale)}>{t('saleHistory.edit')}</button>
					</div>
				</article>
			{/each}
		{:else}
			<p class="empty" data-testid="sale-history-empty">
				{data.filters.marketDayId || data.filters.channel ? t('saleHistory.emptyFiltered') : t('saleHistory.empty')}
			</p>
		{/if}
	</section>
</main>

<dialog class="edit-dialog" bind:this={editDialog} aria-label={t('saleHistory.editTitle')} data-testid="sale-history-edit-dialog">
	<div class="dialog-head">
		<div>
			<p class="eyebrow">{t('saleHistory.editTitle')}</p>
			<h2>{editItemTitle}</h2>
		</div>
		<button type="button" class="secondary" onclick={closeEditDialog}>{t('saleHistory.close')}</button>
	</div>
	<form method="POST" action="?/updateSale">
		<input type="hidden" name="itemId" value={editItemId} />
		<div class="form-grid">
			<label>
				<span>{t('item.channelLabel')}</span>
				<select name="channel" bind:value={editChannel}>
					{#each data.saleChannelOptions as channel}
						<option value={channel}>{saleChannelLabel(channel)}</option>
					{/each}
				</select>
			</label>
			<label>
				<span>{t('item.proceeds')}</span>
				<input name="proceedsEuros" type="text" inputmode="decimal" bind:value={editProceeds} required />
			</label>
			<label class="wide">
				<span>{t('item.marketDay')}</span>
				<select name="marketDayId" bind:value={editMarketDayId}>
					<option value="">{t('item.noMarketDay')}</option>
					{#each data.marketDays as marketDay}
						<option value={marketDay.id}>{marketDay.name}</option>
					{/each}
				</select>
			</label>
		</div>
		<div class="dialog-actions">
			<button type="submit" data-testid="sale-history-save">{t('saleHistory.save')}</button>
		</div>
	</form>
</dialog>

<style>
	.sales-page {
		margin: 0 auto;
		max-width: 56rem;
		padding: 0 1.25rem 3rem;
	}

	.head {
		padding: 1.5rem 1rem 1rem;
		text-align: center;
	}

	.eyebrow {
		color: var(--color-accent);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		margin: 0 0 0.35rem;
		text-transform: uppercase;
	}

	.head h1 {
		color: var(--color-accent-strong);
		font-size: 1.8rem;
		margin: 0;
	}

	.sub {
		color: var(--color-text-muted);
		margin: 0.45rem auto 0;
		max-width: 38rem;
	}

	.summary,
	.filter-panel,
	.sale-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
	}

	.summary {
		color: var(--color-accent-strong);
		font-size: 1.15rem;
		margin-bottom: 1rem;
		padding: 1rem 1.2rem;
		text-align: center;
	}

	.filter-panel {
		margin-bottom: 1rem;
		padding: 1rem;
	}

	.filter-panel h2 {
		font-size: 1rem;
		margin: 0 0 0.8rem;
	}

	.filter-form,
	.form-grid {
		display: grid;
		gap: 0.8rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	label {
		display: grid;
		gap: 0.35rem;
	}

	label > span {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 700;
	}

	.wide,
	.filter-actions {
		grid-column: 1 / -1;
	}

	select,
	input {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.65rem;
		color: var(--color-text);
		font: inherit;
		padding: 0.65rem 0.75rem;
	}

	.filter-actions,
	.sale-actions,
	.dialog-actions {
		align-items: center;
		display: flex;
		gap: var(--gap-action-row);
		justify-content: flex-end;
	}

	.secondary-link {
		color: var(--color-text-muted);
		font-size: 0.85rem;
	}

	.sales-list {
		display: grid;
		gap: 0.85rem;
	}

	.sale-card {
		padding: 1rem;
	}

	.sale-main {
		align-items: start;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	.sale-card h2 {
		font-size: 1.08rem;
		margin: 0.25rem 0;
	}

	.category-pill {
		background: var(--color-accent-soft);
		border-radius: 999px;
		color: var(--color-accent-strong);
		display: inline-block;
		font-size: 0.68rem;
		font-weight: 800;
		margin: 0;
		padding: 0.2rem 0.55rem;
	}

	.sale-date,
	.sale-meta {
		color: var(--color-text-muted);
		font-size: 0.82rem;
	}

	.sale-date {
		margin: 0;
	}

	.proceeds {
		color: var(--color-accent-strong);
		font-size: 1.15rem;
		white-space: nowrap;
	}

	.sale-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem 1rem;
		margin-top: 0.75rem;
	}

	.sale-meta span::before {
		content: '•';
		margin-right: 0.4rem;
	}

	.sale-actions {
		border-top: 1px solid var(--color-border);
		margin-top: var(--gap-action-block);
		padding-top: var(--gap-action-row);
	}

	button {
		cursor: pointer;
	}

	button.danger {
		background: var(--color-danger-soft);
		border-color: var(--color-danger);
		color: var(--color-danger);
	}

	.empty,
	.form-error {
		border-radius: var(--radius-card);
		padding: 1rem;
		text-align: center;
	}

	.empty {
		background: var(--color-surface);
		border: 1px dashed var(--color-border);
		color: var(--color-text-muted);
	}

	.form-error {
		background: var(--color-danger-soft);
		color: var(--color-danger);
	}

	.edit-dialog {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		color: var(--color-text);
		max-width: 34rem;
		padding: 1.2rem;
		width: min(calc(100% - 2rem), 34rem);
	}

	.edit-dialog::backdrop {
		background: var(--scrim);
	}

	.dialog-head {
		align-items: start;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.dialog-head h2 {
		font-size: 1.2rem;
		margin: 0;
	}

	.dialog-actions {
		margin-top: var(--gap-action-block);
	}

	@media (max-width: 600px) {
		.sales-page {
			padding-inline: 0.75rem;
		}

		.filter-form,
		.form-grid {
			grid-template-columns: 1fr;
		}

		.sale-main {
			align-items: flex-start;
		}

		.sale-actions {
			align-items: stretch;
			flex-direction: column-reverse;
		}

		.sale-actions form,
		.sale-actions button {
			width: 100%;
		}
	}
</style>
