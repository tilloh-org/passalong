<script lang="ts">
	import BarList from '$lib/components/statistics/bar-list.svelte';
	import DonutChart from '$lib/components/statistics/donut-chart.svelte';
	import SummaryCards from '$lib/components/statistics/summary-cards.svelte';
	import TrendChart from '$lib/components/statistics/trend-chart.svelte';
	import { formatPrice } from '$lib/utils/format';
	import { t } from '$lib/i18n/index.svelte';
	import type { ExpenseCategory } from '$lib/server/collection-repository';

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
	 * Label a market-day bucket with a fallback for unassigned sales.
	 *
	 * @param {string | null} marketDayName - Market day name or null.
	 * @returns {string} The display label.
	 */
	function marketDayLabel(marketDayName: string | null): string {
		return marketDayName ?? t('statistics.withoutMarketDay');
	}

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

	<SummaryCards
		cards={[
			{
				label: t('statistics.gross'),
				value: formatPrice(data.statistics.totalProceedsCents),
				meta: soldCountLabel(data.statistics.soldItemCount)
			},
			{
				label: t('statistics.expensesTotal'),
				value: formatPrice(data.statistics.totalExpensesCents),
				meta:
					data.statistics.expensesByCategory.length === 1
						? t('statistics.bucketsOne')
						: t('statistics.buckets', { count: data.statistics.expensesByCategory.length })
			},
			{
				label: t('statistics.net'),
				value: formatPrice(data.statistics.netResultCents),
				meta: t('statistics.periodLabel', {
					from: data.period.fromInclusive ?? t('statistics.periodAny'),
					to: data.period.toInclusive ?? t('statistics.periodAny')
				}),
				negative: data.statistics.netResultCents < 0
			}
		]}
		testIdPrefix="statistics-card"
	/>

	{#if hasActivity}
		<section class="chart-card" aria-labelledby="trend-title">
			<h2 id="trend-title">{t('statistics.byDay')}</h2>
			<TrendChart
				entries={data.proceedsByDay}
				testId="statistics-trend"
				emptyLabel={t('statistics.empty')}
			/>
		</section>

		<div class="chart-grid">
			<section class="chart-card" aria-labelledby="channel-title">
				<h2 id="channel-title">{t('portfolio.byChannel')}</h2>
				<DonutChart
					slices={data.statistics.proceedsByChannel.map((entry) => ({
						label: saleChannelLabel(entry.channel),
						valueCents: entry.totalProceedsCents,
						countLabel: soldCountLabel(entry.soldItemCount)
					}))}
					testId="statistics-channels"
					centerLabel={t('statistics.proceedsShort')}
					centerValueCents={data.statistics.totalProceedsCents}
					emptyLabel={t('statistics.empty')}
				/>
			</section>

			<section class="chart-card" aria-labelledby="category-title">
				<h2 id="category-title">{t('saleHistory.byCategory')}</h2>
				<DonutChart
					slices={data.statistics.proceedsByCategory.map((entry) => ({
						label: categoryLabel(entry.category),
						valueCents: entry.totalProceedsCents,
						countLabel: soldCountLabel(entry.soldItemCount)
					}))}
					testId="statistics-categories"
					centerLabel={t('statistics.proceedsShort')}
					centerValueCents={data.statistics.totalProceedsCents}
					emptyLabel={t('statistics.empty')}
				/>
			</section>

			<section class="chart-card" aria-labelledby="market-day-title">
				<h2 id="market-day-title">{t('saleHistory.byMarketDay')}</h2>
				<BarList
					entries={data.statistics.proceedsByMarketDay.map((entry) => ({
						label: marketDayLabel(entry.marketDayName),
						valueCents: entry.totalProceedsCents,
						countLabel: soldCountLabel(entry.soldItemCount)
					}))}
					testId="statistics-market-days"
					emptyLabel={t('statistics.empty')}
				/>
			</section>

			<section class="chart-card" aria-labelledby="expense-title">
				<h2 id="expense-title">{t('statistics.expensesByCategory')}</h2>
				<BarList
					accent="expenses"
					entries={data.statistics.expensesByCategory.map((entry) => ({
						label: expenseCategoryLabel(entry.category),
						valueCents: entry.totalExpensesCents
					}))}
					testId="statistics-expenses"
					emptyLabel={t('statistics.empty')}
				/>
			</section>

			<section class="chart-card" aria-labelledby="month-title">
				<h2 id="month-title">{t('portfolio.byMonth')}</h2>
				<BarList
					entries={data.statistics.proceedsByMonth.map((entry) => ({
						label: monthLabel(entry.month),
						valueCents: entry.totalProceedsCents,
						countLabel: soldCountLabel(entry.soldItemCount)
					}))}
					testId="statistics-months"
					emptyLabel={t('statistics.empty')}
				/>
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
				<button class="filter-submit" type="submit">{t('saleHistory.applyFilters')}</button>
			</div>
		</form>
	</section>
</main>

<style>
	.statistics-page {
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
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
	}

	.chart-grid .chart-card {
		margin-bottom: 0;
	}

	.period-form {
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

	input {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.65rem;
		color: var(--color-text);
		font: inherit;
		padding: 0.65rem 0.75rem;
	}

	.period-actions {
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

	.empty {
		color: var(--color-text-muted);
		text-align: center;
	}

	@media (max-width: 600px) {
		.statistics-page {
			padding-inline: 0.75rem;
		}

		.chart-grid {
			grid-template-columns: 1fr;
		}

		.period-form {
			grid-template-columns: 1fr;
		}
	}
</style>
