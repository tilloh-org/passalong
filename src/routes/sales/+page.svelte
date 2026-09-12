<script lang="ts">
	import { formatPrice } from '$lib/utils/format';
	import { getLocale, t } from '$lib/i18n/index.svelte';
	import type { ExpenseCategory, ItemCategory, SaleHistoryEntry, SaleStatistics } from '$lib/server/collection-repository';

	let { data } = $props();

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
	 * Translate a technical item-category identifier for display.
	 *
	 * @param {string} category - Technical item-category identifier.
	 * @returns {string} Localized item-category label.
	 */
	function categoryLabel(category: string): string {
		return t(`category.${category}`);
	}

	/**
	 * Translate an expense category identifier for display.
	 *
	 * @param {ExpenseCategory} category - Technical expense-category identifier.
	 * @returns {string} Localized expense-category label.
	 */
	function expenseCategoryLabel(category: ExpenseCategory): string {
		return t(`expenses.category.${category}`);
	}

	/**
	 * Label a market-day statistics bucket with a fallback for unassigned sales.
	 *
	 * @param {string | null} marketDayName - Market day name or null.
	 * @returns {string} The display label.
	 */
	function marketDayStatsLabel(marketDayName: string | null): string {
		return marketDayName ?? t('saleHistory.withoutMarketDayStats');
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

	{#if data.statistics.soldItemCount > 0 || data.statistics.totalExpensesCents > 0 || data.period.fromInclusive !== null || data.period.toInclusive !== null}
		<section class="statistics" aria-labelledby="sale-statistics-title" data-testid="sale-statistics">
			<h2 id="sale-statistics-title">{t('saleHistory.statistics')}</h2>
			<p class="statistics-total" data-testid="sale-statistics-total">
				{t('saleHistory.statisticsTotal', {
					count: data.statistics.soldItemCount,
					proceeds: formatPrice(data.statistics.totalProceedsCents),
					expenses: formatPrice(data.statistics.totalExpensesCents),
					net: formatPrice(data.statistics.netResultCents)
				})}
			</p>
			<div class="statistics-grid">
				<div class="statistics-group">
					<h3>{t('saleHistory.byCategory')}</h3>
					<ul data-testid="sale-statistics-categories">
						{#each data.statistics.proceedsByCategory as entry (entry.category)}
							<li>
								<span>{categoryLabel(entry.category)}</span>
								<span class="statistics-value">{entry.soldItemCount}× · {formatPrice(entry.totalProceedsCents)} €</span>
							</li>
						{/each}
					</ul>
				</div>
				<div class="statistics-group">
					<h3>{t('saleHistory.byMarketDay')}</h3>
					<ul data-testid="sale-statistics-market-days">
						{#each data.statistics.proceedsByMarketDay as entry (entry.marketDayName)}
							<li>
								<span>{marketDayStatsLabel(entry.marketDayName)}</span>
								<span class="statistics-value">{entry.soldItemCount}× · {formatPrice(entry.totalProceedsCents)} €</span>
							</li>
						{/each}
					</ul>
					<h3>{t('saleHistory.expensesByCategory')}</h3>
					<ul data-testid="sale-statistics-expenses">
						{#each data.statistics.expensesByCategory as entry (entry.category)}
							<li>
								<span>{expenseCategoryLabel(entry.category)}</span>
								<span class="statistics-value">{formatPrice(entry.totalExpensesCents)} €</span>
							</li>
						{:else}
							<li><span>—</span></li>
						{/each}
					</ul>
				</div>
				<div class="statistics-group statistics-group-period">
					<h3>{t('saleHistory.byPeriod')}</h3>
					<form method="GET" class="period-form" data-testid="sale-statistics-period">
						<input type="hidden" name="channel" value={data.filters.channel ?? ''} />
						<input type="hidden" name="category" value={data.filters.category ?? ''} />
						<label>
							<span>{t('saleHistory.periodFrom')}</span>
							<input name="from" type="date" value={data.period.fromInclusive ?? ''} />
						</label>
						<label>
							<span>{t('saleHistory.periodTo')}</span>
							<input name="to" type="date" value={data.period.toInclusive ?? ''} />
						</label>
						<div class="period-actions">
							<a class="secondary-link" href="/sales">{t('saleHistory.resetFilters')}</a>
							<button type="submit" class="filter-submit">{t('saleHistory.applyFilters')}</button>
						</div>
					</form>
				</div>

			</div>
		</section>
	{/if}

	<section class="filter-panel" aria-labelledby="sale-filter-title">
		<h2 id="sale-filter-title">{t('saleHistory.filters')}</h2>
		<form method="GET" class="filter-form" data-testid="sale-history-filters">
			<label>
				<span>{t('item.channelLabel')}</span>
				<select name="channel">
					<option value="">{t('saleHistory.allChannels')}</option>
					{#each data.saleChannelOptions as channel}
						<option value={channel} selected={data.filters.channel === channel}>{saleChannelLabel(channel)}</option>
					{/each}
				</select>
			</label>
			<label>
				<span>{t('portfolio.category')}</span>
				<select name="category">
					<option value="">{t('saleHistory.allCategories')}</option>
					{#each data.categoryOptions as category}
						<option value={category} selected={data.filters.category === category}>{categoryLabel(category)}</option>
					{/each}
				</select>
			</label>
			<label>
				<span>{t('saleHistory.proceedsMin')}</span>
				<input name="proceedsMin" type="text" inputmode="decimal" value={data.filters.proceedsMinCents === null ? '' : formatPrice(data.filters.proceedsMinCents)} />
			</label>
			<label>
				<span>{t('saleHistory.proceedsMax')}</span>
				<input name="proceedsMax" type="text" inputmode="decimal" value={data.filters.proceedsMaxCents === null ? '' : formatPrice(data.filters.proceedsMaxCents)} />
			</label>
			<div class="filter-actions">
				<a class="secondary-link" href="/sales">{t('saleHistory.resetFilters')}</a>
				<button type="submit" class="filter-submit">{t('saleHistory.applyFilters')}</button>
			</div>
		</form>
	</section>

	<section class="sales-list" data-testid="sale-history-list">
		{#if data.sales.length}
			<div class="sale-rows" role="list" data-testid="sale-history-rows">
				{#each data.sales as sale (sale.itemId)}
					<div class="sale-row" role="listitem" data-testid="sale-history-item">
						<div class="row-main">
							<span class="row-title">{sale.itemTitle}</span>
							<span class="row-meta">
								<span>{displayTimestamp(sale.soldAt)}</span>
								<span aria-hidden="true">·</span>
								<span>{saleChannelLabel(sale.saleChannel)}</span>
								<span aria-hidden="true">·</span>
								<span>{categoryLabel(sale.category)}</span>
								{#if sale.marketDayName}
									<span aria-hidden="true">·</span>
									<span>{sale.marketDayName}</span>
								{/if}
							</span>
						</div>
						<strong class="row-proceeds">{formatPrice(sale.saleProceedsCents)} €</strong>
					</div>
				{/each}
			</div>
		{:else}
			<p class="empty" data-testid="sale-history-empty">
				{data.filters.channel || data.filters.category || data.filters.proceedsMinCents !== null || data.filters.proceedsMaxCents !== null
					? t('saleHistory.emptyFiltered')
					: t('saleHistory.empty')}
			</p>
		{/if}
	</section>
</main>

<style>
	.sales-page {
		margin: 0 auto;
		max-width: 52rem;
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
	.filter-panel {
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

	.statistics {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		margin-bottom: 1rem;
		padding: 1rem;
	}

	.statistics h2 {
		font-size: 1rem;
		margin: 0 0 0.5rem;
	}

	.statistics-total {
		color: var(--color-accent-strong);
		font-weight: 700;
		margin: 0 0 0.8rem;
	}

	.statistics-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.statistics-group h3 {
		color: var(--color-text-muted);
		font-size: 0.8rem;
		margin: 0 0 0.4rem;
	}

	.statistics-group ul {
		color: var(--color-text);
		display: grid;
		font-size: 0.85rem;
		gap: 0.3rem;
		list-style: none;
		margin: 0 0 0.8rem;
		padding: 0;
	}

	.statistics-group li {
		align-items: center;
		display: flex;
		gap: 0.5rem;
		justify-content: space-between;
	}

	.statistics-value {
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.statistics-group-period {
		grid-column: 1 / -1;
	}

	.period-form {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.period-actions,
	.period-form .period-actions {
		display: flex;
		gap: var(--gap-action-row);
		justify-content: flex-end;
		grid-column: 1 / -1;
	}

	.filter-panel {
		margin-bottom: 1rem;
		padding: 1rem;
	}

	.filter-panel h2 {
		font-size: 1rem;
		margin: 0 0 0.8rem;
	}

	.filter-form {
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

	select,
	input {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.65rem;
		color: var(--color-text);
		font: inherit;
		padding: 0.65rem 0.75rem;
	}

	.filter-actions {
		align-items: center;
		display: flex;
		gap: var(--gap-action-row);
		grid-column: 1 / -1;
		justify-content: flex-end;
	}

	.secondary-link {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-accent);
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 700;
		padding: 0.5rem 0.85rem;
		text-decoration: none;
	}

	.filter-submit {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border: 0;
		border-radius: var(--radius-control);
		box-shadow: var(--shadow-cta);
		color: #fff;
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 700;
		padding: 0.5rem 0.85rem;
	}

	.secondary-link:focus-visible,
	.filter-submit:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.sale-rows {
		display: grid;
		gap: 0.4rem;
	}

	.sale-row {
		align-items: center;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		color: var(--color-text);
		display: grid;
		gap: 0 1rem;
		grid-template-columns: 1fr minmax(4.5rem, max-content);
		padding: 0.55rem 0.85rem;
	}

	.row-main {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}

	.row-title {
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-meta {
		color: var(--color-text-muted);
		display: flex;
		flex-wrap: wrap;
		font-size: 0.75rem;
		font-weight: 300;
		gap: 0.3rem 0.45rem;
	}

	.row-proceeds {
		align-self: center;
		color: var(--color-accent-strong);
		white-space: nowrap;
	}

	.empty {
		border-radius: var(--radius-card);
		padding: 1rem;
		text-align: center;
	}

	.empty {
		background: var(--color-surface);
		border: 1px dashed var(--color-border);
		color: var(--color-text-muted);
	}

	@media (max-width: 600px) {
		.sales-page {
			padding-inline: 0.75rem;
		}

		.filter-form {
			grid-template-columns: 1fr;
		}

		.sale-row {
			align-items: flex-start;
			gap: 0.5rem;
		}

		.row-proceeds {
			align-self: flex-start;
		}
	}
</style>