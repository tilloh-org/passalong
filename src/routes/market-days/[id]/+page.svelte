<script lang="ts" module>
	const expenseCategories = ['fee', 'supplies', 'transport', 'purchase', 'other'] as const;
</script>

<script lang="ts">
	import BarList from '$lib/components/statistics/bar-list.svelte';
	import ChartToggle from '$lib/components/statistics/chart-toggle.svelte';
	import PieChart from '$lib/components/statistics/pie-chart.svelte';
	import { getLocale, t } from '$lib/i18n/index.svelte';
	import { formatPrice } from '$lib/utils/format';
	import type { Expense, ExpenseCategory, MarketDay } from '$lib/server/collection-repository';

	type ChartType = 'bars' | 'pie';

	let { data } = $props();
	const returnTo = $derived(`/market-days/${data.marketDay.id}`);
	let proceedsChartType = $state<ChartType>('bars');
	let salesChartType = $state<ChartType>('pie');
	let expenseFormOpen = $state(false);
	let editDialog: HTMLDialogElement | undefined = $state();
	let expenseDialog: HTMLDialogElement | undefined = $state();
	let editExpenseId = $state('');
	let editExpenseLabel = $state('');
	let editExpenseCategory = $state<ExpenseCategory>('fee');
	let editExpenseAmount = $state('');
	let editExpenseDate = $state('');

	/**
	 * Format a YYYY-MM-DD date as a localized long date for display.
	 *
	 * @param {string | null} date - The stored calendar date.
	 * @returns {string} The display date or an em dash when unset.
	 */
	function displayDate(date: string | null): string {
		if (!date) return '—';
		const parsed = new Date(`${date}T00:00:00.000Z`);
		return Number.isNaN(parsed.getTime())
			? date
			: parsed.toLocaleDateString(getLocale(), { dateStyle: 'long', timeZone: 'UTC' });
	}

	/**
	 * Format an open/closed market day for the status pill.
	 *
	 * @param {MarketDay} marketDay - The market day to describe.
	 * @returns {string} The human-readable status label.
	 */
	function statusLabel(marketDay: MarketDay): string {
		return marketDay.closedAt ? t('marketDays.closed') : t('marketDays.open');
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
	 * @param {ExpenseCategory} category - Technical category identifier.
	 * @returns {string} Localized category label.
	 */
	function expenseCategoryLabel(category: ExpenseCategory): string {
		return t(`expenses.category.${category}`);
	}

	/** Open the market-day edit dialog. */
	function openEditDialog(): void {
		editDialog?.showModal();
	}

	/** Close the market-day edit dialog. */
	function closeEditDialog(): void {
		editDialog?.close();
	}

	/**
	 * Populate and open the edit dialog for an expense belonging to this market day.
	 *
	 * @param {Expense} expense - The expense to edit.
	 */
	function openExpenseDialog(expense: Expense): void {
		editExpenseId = expense.id;
		editExpenseLabel = expense.label;
		editExpenseCategory = expense.category;
		editExpenseAmount = formatPrice(expense.amountCents);
		editExpenseDate = expense.expenseDate;
		expenseDialog?.showModal();
	}

	/** Close the expense edit dialog. */
	function closeExpenseDialog(): void {
		expenseDialog?.close();
	}
</script>

<svelte:head>
	<title>{data.marketDay.name} · {t('marketDays.titleSuffix')} · passalong</title>
</svelte:head>

<main class="market-day-detail-page">
	<a class="back-link" href="/market-days">← {t('marketDays.back')}</a>

	<section class="panel detail-header" data-testid="market-day-detail-header">
		<div class="detail-header-main">
			<div>
				<div class="status-row">
					<span class="pill" class:closed-pill={data.marketDay.closedAt}
						>{statusLabel(data.marketDay)}</span
					>
					<span>{displayDate(data.marketDay.date)}</span>
				</div>
				<h1>{data.marketDay.name}</h1>
				{#if data.marketDay.location || data.marketDay.startTime || data.marketDay.notes}
					<div class="detail-meta">
						{#if data.marketDay.location}<span>{data.marketDay.location}</span>{/if}
						{#if data.marketDay.startTime}
							<span
								>{data.marketDay.startTime}{data.marketDay.endTime
									? `–${data.marketDay.endTime}`
									: ''}</span
							>
						{/if}
						{#if data.marketDay.notes}<span>{data.marketDay.notes}</span>{/if}
					</div>
				{/if}
			</div>
			<div class="headline-totals">
				<strong>{t('settlement.net', { net: formatPrice(data.settlement.netResultCents) })}</strong>
				<span>{t('settlement.soldCount', { count: data.settlement.soldItemCount })}</span>
			</div>
		</div>
		<div class="actions day-actions">
			<form method="POST" action="?/deleteMarketDay">
				<input type="hidden" name="marketDayId" value={data.marketDay.id} />
				<button type="submit" class="danger" data-testid="market-days-delete"
					>{t('marketDays.delete')}</button
				>
			</form>
			<button
				type="button"
				class="secondary"
				data-testid="market-days-edit-trigger"
				onclick={openEditDialog}>{t('marketDays.edit')}</button
			>
			<form
				method="POST"
				action={data.marketDay.closedAt ? '?/reopenMarketDay' : '?/closeMarketDay'}
			>
				<input type="hidden" name="marketDayId" value={data.marketDay.id} />
				<input type="hidden" name="returnTo" value={returnTo} />
				{#if data.marketDay.closedAt}
					<button type="submit" class="secondary" data-testid="market-days-reopen"
						>{t('marketDays.reopen')}</button
					>
				{:else}
					<button type="submit" class="primary" data-testid="market-days-close"
						>{t('marketDays.close')}</button
					>
				{/if}
			</form>
		</div>
	</section>

	<section class="panel" aria-labelledby="sales-title" data-testid="market-day-sales">
		<div class="panel-head">
			<div>
				<h2 id="sales-title">{t('marketDays.salesTitle')}</h2>
				<p>{t('marketDays.salesSub')}</p>
			</div>
		</div>
		{#if data.soldItems.length}
			<div class="sale-list">
				{#each data.soldItems as item (item.id)}
					<a class="sale-row" href={`/items/${item.id}`} data-testid="market-day-sale-item">
						<div>
							<strong>{item.title}</strong>
							<span>{categoryLabel(item.category)}</span>
						</div>
						<strong>{formatPrice(item.saleProceedsCents ?? 0)} €</strong>
					</a>
				{/each}
			</div>
		{:else}
			<p class="empty">{t('marketDays.salesEmpty')}</p>
		{/if}
	</section>

	<section class="panel" aria-labelledby="expenses-title" data-testid="market-day-expenses">
		<div class="panel-head">
			<div>
				<h2 id="expenses-title">{t('expenses.title')}</h2>
				<p>{t('marketDays.expensesSub')}</p>
			</div>
			<button
				type="button"
				class="secondary"
				data-testid="expenses-toggle"
				onclick={() => (expenseFormOpen = !expenseFormOpen)}
				>{expenseFormOpen ? t('marketDays.cancel') : t('expenses.toggle')}</button
			>
		</div>
		{#if expenseFormOpen}
			<form
				method="POST"
				action="?/createExpense"
				class="form-grid"
				data-testid="expenses-create-form"
			>
				<input type="hidden" name="marketDayId" value={data.marketDay.id} />
				<input type="hidden" name="returnTo" value={returnTo} />
				<label>
					<span>{t('expenses.label')}</span>
					<input name="label" required data-testid="expenses-label-input" />
				</label>
				<label>
					<span>{t('expenses.category')}</span>
					<select name="category" required data-testid="expenses-category-input">
						{#each expenseCategories as category (category)}
							<option value={category}>{expenseCategoryLabel(category)}</option>
						{/each}
					</select>
				</label>
				<label>
					<span>{t('expenses.amount')}</span>
					<input
						name="amountEuros"
						type="text"
						inputmode="decimal"
						required
						data-testid="expenses-amount-input"
					/>
				</label>
				<label>
					<span>{t('expenses.date')}</span>
					<input name="expenseDate" type="date" data-testid="expenses-date-input" />
				</label>
				<div class="actions form-actions">
					<button type="submit" data-testid="expenses-create-submit">{t('expenses.create')}</button>
				</div>
			</form>
		{/if}
		{#if data.expenses.length}
			<div class="expense-list">
				{#each data.expenses as expense (expense.id)}
					<article class="expense-row" data-testid="expense-item">
						<div>
							<strong>{expense.label}</strong>
							<span
								>{expenseCategoryLabel(expense.category)} · {displayDate(expense.expenseDate)}</span
							>
						</div>
						<strong class="negative">-{formatPrice(expense.amountCents)} €</strong>
						<div class="expense-actions">
							<button
								type="button"
								class="secondary"
								data-testid="expenses-edit-trigger"
								onclick={() => openExpenseDialog(expense)}>{t('expenses.edit')}</button
							>
							<form method="POST" action="?/deleteExpense">
								<input type="hidden" name="expenseId" value={expense.id} />
								<input type="hidden" name="returnTo" value={returnTo} />
								<button type="submit" class="danger" data-testid="expenses-delete"
									>{t('expenses.delete')}</button
								>
							</form>
						</div>
					</article>
				{/each}
			</div>
		{:else}
			<p class="empty" data-testid="expenses-empty">{t('expenses.empty')}</p>
		{/if}
	</section>

	<section
		class="panel statistics-panel"
		aria-labelledby="statistics-title"
		data-testid="market-day-statistics"
	>
		<div class="panel-head">
			<div>
				<h2 id="statistics-title">{t('marketDays.statisticsTitle')}</h2>
				<p>{t('marketDays.statisticsSub')}</p>
			</div>
		</div>
		<div class="settlement-overview">
			<div>
				<span
					>{t('settlement.proceeds', {
						proceeds: formatPrice(data.settlement.totalProceedsCents)
					})}</span
				>
				<span class="negative"
					>{t('settlement.expenses', {
						expenses: formatPrice(data.settlement.totalExpensesCents)
					})}</span
				>
			</div>
			<strong class:negative={data.settlement.netResultCents < 0}
				>{t('settlement.net', { net: formatPrice(data.settlement.netResultCents) })}</strong
			>
		</div>
		{#if data.settlement.proceedsByCategory.length || data.settlement.expensesByCategory.length}
			<div class="chart-grid">
				{#if data.settlement.proceedsByCategory.length}
					<section class="chart-card">
						<h3>{t('statistics.proceedsPerCategory')}</h3>
						<ChartToggle
							testId="market-day-proceeds-toggle"
							value={proceedsChartType}
							onchange={(mode) => (proceedsChartType = mode)}
						/>
						{#if proceedsChartType === 'pie'}
							<PieChart
								slices={data.settlement.proceedsByCategory.map((entry) => ({
									label: categoryLabel(entry.category),
									valueCents: entry.totalProceedsCents
								}))}
								testId="market-day-proceeds-chart"
								centerLabel={t('statistics.totalLabel')}
								centerValueCents={data.settlement.totalProceedsCents}
							/>
						{:else}
							<BarList
								entries={data.settlement.proceedsByCategory.map((entry) => ({
									label: categoryLabel(entry.category),
									valueCents: entry.totalProceedsCents
								}))}
								testId="market-day-proceeds-chart"
							/>
						{/if}
					</section>
					<section class="chart-card">
						<h3>{t('statistics.salesPerCategory')}</h3>
						<ChartToggle
							testId="market-day-sales-toggle"
							value={salesChartType}
							onchange={(mode) => (salesChartType = mode)}
						/>
						{#if salesChartType === 'pie'}
							<PieChart
								mode="count"
								slices={data.settlement.proceedsByCategory.map((entry) => ({
									label: categoryLabel(entry.category),
									valueCents: entry.soldItemCount
								}))}
								testId="market-day-sales-chart"
								centerLabel={t('statistics.totalLabel')}
								centerCount={data.settlement.soldItemCount}
							/>
						{:else}
							<BarList
								mode="count"
								entries={data.settlement.proceedsByCategory.map((entry) => ({
									label: categoryLabel(entry.category),
									valueCents: entry.soldItemCount
								}))}
								testId="market-day-sales-chart"
							/>
						{/if}
					</section>
				{/if}
				{#if data.settlement.expensesByCategory.length}
					<section class="chart-card expense-chart-card">
						<h3>{t('statistics.expensesByCategory')}</h3>
						<BarList
							accent="expenses"
							entries={data.settlement.expensesByCategory.map((entry) => ({
								label: expenseCategoryLabel(entry.category),
								valueCents: entry.totalExpensesCents
							}))}
							testId="market-day-expenses-chart"
						/>
					</section>
				{/if}
			</div>
		{:else}
			<p class="empty">{t('settlement.empty')}</p>
		{/if}
	</section>
</main>

<dialog
	class="edit-dialog"
	bind:this={editDialog}
	aria-label={t('marketDays.edit')}
	data-testid="market-days-edit-dialog"
>
	<div class="dialog-head">
		<h2>{t('marketDays.editTitle')}</h2>
		<button type="button" class="secondary" onclick={closeEditDialog}
			>{t('marketDays.cancel')}</button
		>
	</div>
	<form method="POST" action="?/updateMarketDay" class="form-grid">
		<input type="hidden" name="marketDayId" value={data.marketDay.id} />
		<input type="hidden" name="returnTo" value={returnTo} />
		<label
			><span>{t('marketDays.name')}</span><input
				name="name"
				value={data.marketDay.name}
				required
			/></label
		>
		<label
			><span>{t('marketDays.date')}</span><input
				name="date"
				type="date"
				value={data.marketDay.date ?? ''}
			/></label
		>
		<label
			><span>{t('marketDays.startTime')}</span><input
				name="startTime"
				type="time"
				value={data.marketDay.startTime ?? ''}
			/></label
		>
		<label
			><span>{t('marketDays.endTime')}</span><input
				name="endTime"
				type="time"
				value={data.marketDay.endTime ?? ''}
			/></label
		>
		<label class="wide"
			><span>{t('marketDays.location')}</span><input
				name="location"
				value={data.marketDay.location}
			/></label
		>
		<label class="wide"
			><span>{t('marketDays.notes')}</span><input
				name="notes"
				value={data.marketDay.notes}
			/></label
		>
		<div class="actions form-actions"><button type="submit">{t('marketDays.save')}</button></div>
	</form>
</dialog>

<dialog
	class="edit-dialog"
	bind:this={expenseDialog}
	aria-label={t('expenses.edit')}
	data-testid="expenses-edit-dialog"
>
	<div class="dialog-head">
		<h2>{t('expenses.edit')}</h2>
		<button type="button" class="secondary" onclick={closeExpenseDialog}
			>{t('marketDays.cancel')}</button
		>
	</div>
	<form method="POST" action="?/updateExpense" class="form-grid">
		<input type="hidden" name="expenseId" value={editExpenseId} />
		<input type="hidden" name="marketDayId" value={data.marketDay.id} />
		<input type="hidden" name="returnTo" value={returnTo} />
		<label
			><span>{t('expenses.label')}</span><input
				name="label"
				value={editExpenseLabel}
				required
			/></label
		>
		<label
			><span>{t('expenses.category')}</span><select
				name="category"
				bind:value={editExpenseCategory}
				required
				>{#each expenseCategories as category (category)}<option value={category}
						>{expenseCategoryLabel(category)}</option
					>{/each}</select
			></label
		>
		<label
			><span>{t('expenses.amount')}</span><input
				name="amountEuros"
				value={editExpenseAmount}
				inputmode="decimal"
				required
			/></label
		>
		<label
			><span>{t('expenses.date')}</span><input
				name="expenseDate"
				type="date"
				value={editExpenseDate}
			/></label
		>
		<div class="actions form-actions">
			<button type="submit" data-testid="expenses-save">{t('expenses.save')}</button>
		</div>
	</form>
</dialog>

<style>
	.market-day-detail-page {
		margin: 0 auto;
		max-width: 52rem;
		padding: 1.5rem 1.25rem 3rem;
	}
	.back-link {
		display: inline-flex;
		font-size: 0.9rem;
		font-weight: 700;
		margin-bottom: 0.9rem;
		text-decoration: none;
	}
	.panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		margin-bottom: 1rem;
		padding: 1.1rem;
	}
	.detail-header-main,
	.settlement-overview {
		align-items: flex-start;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}
	.status-row,
	.detail-meta,
	.settlement-overview > div {
		align-items: center;
		color: var(--color-text-muted);
		display: flex;
		flex-wrap: wrap;
		font-size: 0.85rem;
		gap: 0.6rem;
	}
	.detail-header h1 {
		color: var(--color-accent-strong);
		font-size: 1.55rem;
		margin: 0.55rem 0 0;
	}
	.detail-meta {
		margin-top: 0.4rem;
	}
	.headline-totals {
		display: grid;
		gap: 0.15rem;
		text-align: right;
	}
	.headline-totals strong,
	.settlement-overview > strong {
		color: var(--color-accent-strong);
		white-space: nowrap;
	}
	.headline-totals span {
		color: var(--color-text-muted);
		font-size: 0.8rem;
	}
	.pill {
		background: var(--color-ok-soft);
		border: 1px solid var(--color-ok-border);
		border-radius: 999px;
		color: var(--color-ok);
		font-size: 0.68rem;
		font-weight: 800;
		padding: 2px 10px;
	}
	.closed-pill {
		background: var(--color-warn-soft);
		border-color: var(--color-warn);
		color: var(--color-warn);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-action-row);
		justify-content: flex-end;
		margin-top: var(--gap-action-block);
	}
	.day-actions {
		border-top: 1px solid var(--color-border);
		padding-top: var(--gap-action-block);
	}
	.actions form,
	.expense-actions form {
		display: contents;
	}
	button {
		border-radius: var(--radius-control);
		cursor: pointer;
		font: inherit;
		font-size: 0.84rem;
		font-weight: 700;
		padding: 0.55rem 0.85rem;
	}
	.primary,
	.actions > button:not(.secondary):not(.danger),
	.actions button[type='submit']:not(.secondary):not(.danger) {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border: 0;
		box-shadow: var(--shadow-cta);
		color: #fff;
	}
	.secondary {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		color: var(--color-accent);
	}
	.danger {
		background: var(--color-danger-soft);
		border: 1px solid var(--color-danger);
		color: var(--color-danger);
	}
	.panel-head h2 {
		color: var(--color-accent-strong);
		font-size: 1.1rem;
		margin: 0;
	}
	.panel-head p {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		margin: 0.3rem 0 0;
	}
	.sale-list,
	.expense-list {
		display: grid;
		gap: 0.55rem;
		margin-top: 1rem;
	}
	.sale-row,
	.expense-row {
		align-items: center;
		background: var(--color-input);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-text);
		display: flex;
		gap: 0.8rem;
		justify-content: space-between;
		padding: 0.75rem 0.85rem;
		text-decoration: none;
	}
	.sale-row:hover,
	.sale-row:focus-visible {
		background: var(--color-accent-soft);
		border-color: var(--color-accent);
	}
	.sale-row span,
	.expense-row span {
		color: var(--color-text-muted);
		display: block;
		font-size: 0.78rem;
		margin-top: 0.15rem;
	}
	.sale-row > strong {
		color: var(--color-accent-strong);
		white-space: nowrap;
	}
	.expense-row {
		flex-wrap: wrap;
	}
	.negative {
		color: var(--color-danger) !important;
	}
	.expense-actions {
		display: flex;
		gap: var(--gap-action-row);
		margin-left: auto;
	}
	.statistics-panel {
		margin-bottom: 0;
	}
	.settlement-overview {
		background: var(--color-surface-strong);
		border-radius: var(--radius-control);
		margin-top: 1rem;
		padding: 0.8rem;
	}
	.chart-grid {
		display: grid;
		gap: 0.8rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin-top: 0.8rem;
	}
	.chart-card {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		min-width: 0;
		padding: 0.85rem;
	}
	.chart-card h3 {
		font-size: 0.95rem;
		margin: 0 0 0.65rem;
		min-height: 2.4rem;
	}
	.expense-chart-card {
		grid-column: 1 / -1;
	}
	.empty {
		background: var(--color-surface-strong);
		border-radius: var(--radius-control);
		color: var(--color-text-muted);
		margin: 1rem 0 0;
		padding: 0.8rem;
	}
	.edit-dialog {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		color: var(--color-text);
		max-width: min(38rem, 92vw);
		padding: 1.25rem;
		width: 38rem;
	}
	.dialog-head {
		align-items: center;
		display: flex;
		justify-content: space-between;
	}
	.dialog-head h2 {
		color: var(--color-accent-strong);
		font-size: 1.05rem;
		margin: 0;
	}
	.form-grid {
		display: grid;
		gap: 0.8rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin-top: 1rem;
	}
	.form-grid label {
		display: grid;
		gap: 0.3rem;
	}
	.form-grid label.wide,
	.form-actions {
		grid-column: 1 / -1;
	}
	.form-grid label > span {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.form-grid input,
	.form-grid select {
		background: var(--color-input);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-text);
		font: inherit;
		padding: 0.6rem 0.75rem;
		width: 100%;
	}
	.form-grid input:focus,
	.form-grid select:focus {
		border-color: var(--color-ice);
		box-shadow: 0 0 0 4px var(--focus-ring);
		outline: none;
	}
	@media (max-width: 600px) {
		.market-day-detail-page {
			padding-inline: 1rem;
		}
		.detail-header-main,
		.settlement-overview {
			flex-direction: column;
		}
		.headline-totals {
			text-align: left;
		}
		.chart-grid,
		.form-grid {
			grid-template-columns: 1fr;
		}
		.expense-chart-card {
			grid-column: auto;
		}
		.chart-card h3 {
			min-height: 0;
		}
		.expense-actions {
			margin-left: 0;
			width: 100%;
		}
		.expense-actions button {
			flex: 1;
		}
	}
</style>
