<script lang="ts">
	import { formatPrice } from '$lib/utils/format';
	import { getLocale, t } from '$lib/i18n/index.svelte';
	import type {
		ExpenseCategory,
		ItemCategory,
		SaleChannel,
		SaleStatistics
	} from '$lib/server/collection-repository';

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
	 * Translate a YYYY-MM month key into a localized label.
	 *
	 * @param {string} month - Month key in the form YYYY-MM.
	 * @returns {string} Localized month and year label.
	 */
	function monthLabel(month: string): string {
		const [year, monthNumber] = month.split('-');
		const localized = t(`month.${Number(monthNumber)}`);
		return `${localized} ${year}`;
	}

	/**
	 * Format a sold-item count with correct German singular/plural.
	 *
	 * @param {number} count - Number of sold items.
	 * @returns {string} Localized count label.
	 */
	function soldCountLabel(count: number): string {
		return count === 1 ? t('statistics.soldCountOne') : t('statistics.soldCount', { count });
	}

	/**
	 * Format an ISO day key as a localized date.
	 *
	 * @param {string} day - ISO date (YYYY-MM-DD).
	 * @returns {string} Localized date label.
	 */
	function dayLabel(day: string): string {
		const parsed = new Date(`${day}T00:00:00.000Z`);
		return Number.isNaN(parsed.getTime())
			? day
			: parsed.toLocaleDateString(getLocale(), { dateStyle: 'short', timeZone: 'UTC' });
	}

	/**
	 * Label a market-day bucket with a fallback for unassigned sales.
	 *
	 * @param {string | null} marketDayName - Market day name or null.
	 * @returns {string} The display label.
	 */
	function marketDayLabel(marketDayName: string | null): string {
		return marketDayName ?? t('statistics.withoutMarketDay');
	}

	/**
	 * Compute the CSS width percentage for a horizontal bar.
	 *
	 * @param {number} value - The bucket value.
	 * @param {number} maximum - The largest bucket value in the series.
	 * @returns {number} The bar width in percent (0–100).
	 */
	function barWidth(value: number, maximum: number): number {
		return maximum > 0 ? Math.max(2, Math.round((value / maximum) * 100)) : 0;
	}

	/** The largest single-day proceeds value for the trend chart. */
	const maxDailyProceeds = $derived(Math.max(0, ...data.proceedsByDay.map((entry) => entry.totalProceedsCents)));

	/** The largest category proceeds value for the category chart. */
	const maxCategoryProceeds = $derived(Math.max(0, ...data.statistics.proceedsByCategory.map((entry) => entry.totalProceedsCents)));

	/** The largest monthly proceeds value for the month chart. */
	const maxMonthlyProceeds = $derived(Math.max(0, ...data.statistics.proceedsByMonth.map((entry) => entry.totalProceedsCents)));

	/** The largest expense-category total for the expense chart. */
	const maxExpenseTotal = $derived(Math.max(0, ...data.statistics.expensesByCategory.map((entry) => entry.totalExpensesCents)));

	/** The largest channel proceeds value for the channel chart. */
	const maxChannelProceeds = $derived(Math.max(0, ...data.statistics.proceedsByChannel.map((entry) => entry.totalProceedsCents)));

	/** The largest market-day proceeds value for the market-day chart. */
	const maxMarketDayProceeds = $derived(Math.max(0, ...data.statistics.proceedsByMarketDay.map((entry) => entry.totalProceedsCents)));

	/** Whether the statistics contain any sale or expense activity at all. */
	const hasActivity = $derived(
		data.statistics.soldItemCount > 0 || data.statistics.totalExpensesCents > 0
	);
</script>

<svelte:head>
	<title>{t('statistics.titleSuffix')} · passalong</title>
</svelte:head>

<main class="statistics-page">
	<section class="head">
		<p class="eyebrow">{t('portfolio.saleStatisticsEyebrow')}</p>
		<h1 data-testid="statistics-title">{t('statistics.title')}</h1>
		<p class="sub">{t('statistics.sub')}</p>
	</section>

	<section class="totals" data-testid="statistics-totals">
		<div class="total-card" data-testid="statistics-gross">
			<span class="total-label">{t('statistics.gross')}</span>
			<strong>{formatPrice(data.statistics.totalProceedsCents)} €</strong>
			<span class="total-meta">{soldCountLabel(data.statistics.soldItemCount)}</span>
		</div>
		<div class="total-card" data-testid="statistics-expenses">
			<span class="total-label">{t('statistics.expensesTotal')}</span>
			<strong>{formatPrice(data.statistics.totalExpensesCents)} €</strong>
			<span class="total-meta">{t('statistics.buckets', { count: data.statistics.expensesByCategory.length })}</span>
		</div>
		<div class="total-card" class:negative={data.statistics.netResultCents < 0} data-testid="statistics-net">
			<span class="total-label">{t('statistics.net')}</span>
			<strong>{formatPrice(data.statistics.netResultCents)} €</strong>
			<span class="total-meta">{t('statistics.periodLabel', {
				from: data.period.fromInclusive ?? t('statistics.periodAny'),
				to: data.period.toInclusive ?? t('statistics.periodAny')
			})}</span>
		</div>
	</section>

	{#if hasActivity}
		<section class="chart-card" aria-labelledby="trend-title">
			<h2 id="trend-title">{t('statistics.byDay')}</h2>
			{#if data.proceedsByDay.length > 0}
				<div class="trend-chart" data-testid="statistics-trend">
					{#each data.proceedsByDay as entry (entry.day)}
						<div class="trend-column">
							<span class="trend-value">{formatPrice(entry.totalProceedsCents)} €</span>
							<div class="trend-bar-track">
								<div class="trend-bar" style={`height: ${barWidth(entry.totalProceedsCents, maxDailyProceeds)}%`}></div>
							</div>
							<span class="trend-day">{dayLabel(entry.day)}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="empty" data-testid="statistics-trend-empty">{t('statistics.empty')}</p>
			{/if}
		</section>

		<div class="chart-grid">
			<section class="chart-card" aria-labelledby="channel-title">
				<h2 id="channel-title">{t('portfolio.byChannel')}</h2>
				<ul class="bar-list" data-testid="statistics-channels">
					{#each data.statistics.proceedsByChannel as entry (entry.channel)}
						<li>
							<div class="bar-row">
								<span class="bar-label">{saleChannelLabel(entry.channel)}</span>
								<span class="statistics-value">{formatPrice(entry.totalProceedsCents)} €</span>
							</div>
							<div class="bar-track">
								<div class="bar-fill" style={`width: ${barWidth(entry.totalProceedsCents, maxChannelProceeds)}%`}></div>
							</div>
							<span class="bar-count">{soldCountLabel(entry.soldItemCount)}</span>
						</li>
					{/each}
				</ul>
			</section>

			<section class="chart-card" aria-labelledby="category-title">
				<h2 id="category-title">{t('saleHistory.byCategory')}</h2>
				<ul class="bar-list" data-testid="statistics-categories">
					{#each data.statistics.proceedsByCategory as entry (entry.category)}
						<li>
							<div class="bar-row">
								<span class="bar-label">{categoryLabel(entry.category)}</span>
								<span class="statistics-value">{formatPrice(entry.totalProceedsCents)} €</span>
							</div>
							<div class="bar-track">
								<div class="bar-fill" style={`width: ${barWidth(entry.totalProceedsCents, maxCategoryProceeds)}%`}></div>
							</div>
							<span class="bar-count">{soldCountLabel(entry.soldItemCount)}</span>
						</li>
					{/each}
				</ul>
			</section>

			<section class="chart-card" aria-labelledby="market-day-title">
				<h2 id="market-day-title">{t('saleHistory.byMarketDay')}</h2>
				<ul class="bar-list" data-testid="statistics-market-days">
					{#each data.statistics.proceedsByMarketDay as entry (entry.marketDayName)}
						<li>
							<div class="bar-row">
								<span class="bar-label">{marketDayLabel(entry.marketDayName)}</span>
								<span class="statistics-value">{formatPrice(entry.totalProceedsCents)} €</span>
							</div>
							<div class="bar-track">
								<div class="bar-fill" style={`width: ${barWidth(entry.totalProceedsCents, maxMarketDayProceeds)}%`}></div>
							</div>
							<span class="bar-count">{soldCountLabel(entry.soldItemCount)}</span>
						</li>
					{/each}
				</ul>
			</section>

			<section class="chart-card" aria-labelledby="expense-title">
				<h2 id="expense-title">{t('statistics.expensesByCategory')}</h2>
				<ul class="bar-list" data-testid="statistics-expenses">
					{#each data.statistics.expensesByCategory as entry (entry.category)}
						<li>
							<div class="bar-row">
								<span class="bar-label">{expenseCategoryLabel(entry.category)}</span>
								<span class="statistics-value">{formatPrice(entry.totalExpensesCents)} €</span>
							</div>
							<div class="bar-track expense">
								<div class="bar-fill" style={`width: ${barWidth(entry.totalExpensesCents, maxExpenseTotal)}%`}></div>
							</div>
						</li>
					{/each}
				</ul>
			</section>

			<section class="chart-card" aria-labelledby="month-title">
				<h2 id="month-title">{t('portfolio.byMonth')}</h2>
				<ul class="bar-list" data-testid="statistics-months">
					{#each data.statistics.proceedsByMonth as entry (entry.month)}
						<li>
							<div class="bar-row">
								<span class="bar-label">{monthLabel(entry.month)}</span>
								<span class="statistics-value">{formatPrice(entry.totalProceedsCents)} €</span>
							</div>
							<div class="bar-track">
								<div class="bar-fill" style={`width: ${barWidth(entry.totalProceedsCents, maxMonthlyProceeds)}%`}></div>
							</div>
							<span class="bar-count">{soldCountLabel(entry.soldItemCount)}</span>
						</li>
					{/each}
				</ul>
			</section>
		</div>
	{:else}
		<p class="empty" data-testid="statistics-empty">{t('statistics.empty')}</p>
	{/if}

	<section class="chart-card period-card" aria-labelledby="period-title">
		<h2 id="period-title">{t('saleHistory.byPeriod')}</h2>
		<form method="GET" class="period-form" data-testid="statistics-period">
			<label>
				<span>{t('saleHistory.periodFrom')}</span>
				<input name="from" type="date" value={data.period.fromInclusive ?? ''} />
			</label>
			<label>
				<span>{t('saleHistory.periodTo')}</span>
				<input name="to" type="date" value={data.period.toInclusive ?? ''} />
			</label>
			<div class="period-actions">
				<a class="secondary-link" href="/statistics">{t('saleHistory.resetFilters')}</a>
				<button type="submit" class="filter-submit">{t('saleHistory.applyFilters')}</button>
			</div>
		</form>
	</section>
</main>

<style>
	.statistics-page {
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

	.totals {
		display: grid;
		gap: 0.8rem;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin-bottom: 1rem;
	}

	.total-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		display: grid;
		gap: 0.2rem;
		padding: 0.9rem 1rem;
		text-align: center;
	}

	.total-label {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 700;
	}

	.total-card strong {
		color: var(--color-accent-strong);
		font-size: 1.3rem;
	}

	.total-card.negative strong {
		color: var(--color-danger);
	}

	.total-meta {
		color: var(--color-text-muted);
		font-size: 0.72rem;
	}

	.chart-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		margin-bottom: 1rem;
		padding: 1rem;
	}

	.chart-card h2 {
		font-size: 1rem;
		margin: 0 0 0.8rem;
	}

	.chart-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.bar-list {
		color: var(--color-text);
		display: grid;
		font-size: 0.85rem;
		gap: 0.7rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.bar-row {
		align-items: center;
		display: flex;
		gap: 0.5rem;
		justify-content: space-between;
	}

	.bar-label {
		font-weight: 700;
	}

	.statistics-value {
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.bar-track {
		background: var(--color-accent-soft);
		border-radius: 999px;
		height: 8px;
		overflow: hidden;
	}

	.bar-fill {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border-radius: 999px;
		height: 100%;
	}

	.bar-track.expense .bar-fill {
		background: var(--color-danger);
	}

	.bar-count {
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}

	.trend-chart {
		align-items: stretch;
		display: flex;
		gap: 0.6rem;
		overflow-x: auto;
	}

	.trend-column {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 5.5rem;
		text-align: center;
	}

	.trend-value {
		color: var(--color-accent-strong);
		font-size: 0.72rem;
		font-weight: 700;
	}

	.trend-bar-track {
		align-items: flex-end;
		background: var(--color-accent-soft);
		border-radius: 0.5rem;
		display: flex;
		flex: 1;
		min-height: 7rem;
		overflow: hidden;
	}

	.trend-bar {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border-radius: 0.5rem 0.5rem 0 0;
		width: 100%;
	}

	.trend-day {
		color: var(--color-text-muted);
		font-size: 0.72rem;
	}

	.empty {
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-card);
		color: var(--color-text-muted);
		padding: 1rem;
		text-align: center;
	}

	.period-actions {
		align-items: center;
		display: flex;
		gap: var(--gap-action-row);
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

	label {
		display: grid;
		gap: 0.35rem;
	}

	label > span {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 700;
	}

	input {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.65rem;
		color: var(--color-text);
		font: inherit;
		padding: 0.65rem 0.75rem;
	}

	@media (max-width: 600px) {
		.statistics-page {
			padding-inline: 0.75rem;
		}

		.totals {
			grid-template-columns: 1fr;
		}

		.chart-grid {
			grid-template-columns: 1fr;
		}
	}
</style>