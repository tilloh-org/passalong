<script lang="ts" module>
	/** Expense category identifiers mirrored from the server. */
	const expenseCategories: ExpenseCategory[] = [
		'fee',
		'supplies',
		'transport',
		'purchase',
		'other'
	];
</script>

<script lang="ts">
	import { t, getLocale } from '$lib/i18n/index.svelte';
	import { formatPrice } from '$lib/utils/format';
	import type { Expense, ExpenseCategory, MarketDay } from '$lib/server/collection-repository';

	let { data, form } = $props();

	/**
	 * Whether the create form is currently open.
	 */
	let createFormOpen = $state(false);

	/**
	 * Format a YYYY-MM-DD date as a localized long date for display.
	 *
	 * @param {string | null} date - The stored calendar date.
	 * @returns {string} The display date or an em dash when unset.
	 */
	function displayDate(date: string | null): string {
		if (!date) {
			return '—';
		}
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

	let editDialog: HTMLDialogElement | undefined = $state();
	let editMarketDayId = $state('');
	let editMarketDayName = $state('');
	let editMarketDayDate = $state('');
	let editMarketDayStartTime = $state('');
	let editMarketDayEndTime = $state('');
	let editMarketDayLocation = $state('');
	let editMarketDayNotes = $state('');

	/**
	 * Open the edit dialog for one market day.
	 *
	 * @param {MarketDay} marketDay - The market day to edit.
	 */
	function openEditDialog(marketDay: MarketDay): void {
		editMarketDayId = marketDay.id;
		editMarketDayName = marketDay.name;
		editMarketDayDate = marketDay.date ?? '';
		editMarketDayStartTime = marketDay.startTime ?? '';
		editMarketDayEndTime = marketDay.endTime ?? '';
		editMarketDayLocation = marketDay.location;
		editMarketDayNotes = marketDay.notes;
		editDialog?.showModal();
	}

	/**
	 * Close the edit dialog and reset its draft state.
	 */
	function closeEditDialog(): void {
		editDialog?.close();
		editMarketDayId = '';
	}

	/**
	 * Whether the expense form is currently open.
	 */
	let expenseFormOpen = $state(false);
	let expenseDialog: HTMLDialogElement | undefined = $state();
	let editExpenseId = $state('');
	let editExpenseLabel = $state('');
	let editExpenseCategory: ExpenseCategory | undefined = $state(undefined);
	let editExpenseAmount = $state('');
	let editExpenseDate = $state('');
	let editExpenseMarketDayId = $state('');

	/**
	 * Translate an expense category identifier for display.
	 *
	 * @param {ExpenseCategory} category - Technical category identifier.
	 * @returns {string} Localized category label.
	 */
	function expenseCategoryLabel(category: ExpenseCategory): string {
		return t(`expenses.category.${category}`);
	}

	/**
	 * Populate and open the expense edit dialog for one expense.
	 *
	 * @param {Expense} expense - The expense to edit.
	 */
	function openExpenseDialog(expense: Expense): void {
		editExpenseId = expense.id;
		editExpenseLabel = expense.label;
		editExpenseCategory = expense.category;
		editExpenseAmount = formatPrice(expense.amountCents);
		editExpenseDate = expense.expenseDate;
		editExpenseMarketDayId = expense.marketDayId ?? '';
		expenseDialog?.showModal();
	}

	/**
	 * Close the expense dialog and clear its draft state.
	 */
	function closeExpenseDialog(): void {
		expenseDialog?.close();
		editExpenseId = '';
	}
</script>

<svelte:head>
	<title>{t('marketDays.titleSuffix')} · passalong</title>
</svelte:head>

<main class="market-days-page">
	<section class="head">
		<h1 data-testid="market-days-title">{t('marketDays.title')}</h1>
		<p class="sub">{t('marketDays.sub')}</p>
	</section>

	<section class="panel" aria-labelledby="create-title">
		<div class="panel-head">
			<h2 id="create-title">{t('marketDays.createTitle')}</h2>
			<button
				type="button"
				class="toggle"
				data-testid="market-days-create-toggle"
				onclick={() => (createFormOpen = !createFormOpen)}
			>
				{createFormOpen ? t('marketDays.cancel') : t('marketDays.createToggle')}
			</button>
		</div>
		{#if form?.marketDayError}
			<p class="form-error" role="alert" data-testid="market-days-error">{form.marketDayError}</p>
		{/if}
		{#if createFormOpen}
			<form
				method="POST"
				action="?/createMarketDay"
				class="form-grid"
				data-testid="market-days-create-form"
			>
				<label>
					<span>{t('marketDays.name')}</span>
					<input name="name" required data-testid="market-days-name-input" />
				</label>
				<label>
					<span>{t('marketDays.date')}</span>
					<input name="date" type="date" data-testid="market-days-date-input" />
				</label>
				<label>
					<span>{t('marketDays.startTime')}</span>
					<input name="startTime" type="time" data-testid="market-days-start-input" />
				</label>
				<label>
					<span>{t('marketDays.endTime')}</span>
					<input name="endTime" type="time" data-testid="market-days-end-input" />
				</label>
				<label class="wide">
					<span>{t('marketDays.location')}</span>
					<input name="location" data-testid="market-days-location-input" />
				</label>
				<label class="wide">
					<span>{t('marketDays.notes')}</span>
					<input
						name="notes"
						placeholder={t('marketDays.notesPlaceholder')}
						data-testid="market-days-notes-input"
					/>
				</label>
				<div class="actions">
					<button type="submit" data-testid="market-days-create-submit"
						>{t('marketDays.create')}</button
					>
				</div>
			</form>
		{/if}
	</section>

	<section class="list" data-testid="market-days-list">
		{#if data.marketDays.length}
			{#each data.marketDays as marketDay (marketDay.id)}
				<article class="market-day" class:closed={marketDay.closedAt} data-testid="market-day-item">
					<div class="day-head">
						<div>
							<h3>{marketDay.name}</h3>
							<p class="meta">
								<span class="pill" class:closed-pill={marketDay.closedAt}
									>{statusLabel(marketDay)}</span
								>
								{#if marketDay.date}
									<span class="date">{displayDate(marketDay.date)}</span>
								{/if}
								{#if marketDay.startTime}
									<span class="time"
										>{marketDay.startTime}{marketDay.endTime ? `–${marketDay.endTime}` : ''}</span
									>
								{/if}
							</p>
						</div>
						<div class="day-actions">
							<button
								type="button"
								class="secondary"
								data-testid="market-days-edit-trigger"
								onclick={() => openEditDialog(marketDay)}
							>
								{t('marketDays.edit')}
							</button>
							<form
								method="POST"
								action={marketDay.closedAt ? '?/reopenMarketDay' : '?/closeMarketDay'}
								class="inline"
							>
								<input type="hidden" name="marketDayId" value={marketDay.id} />
								{#if marketDay.closedAt}
									<button type="submit" class="secondary" data-testid="market-days-reopen"
										>{t('marketDays.reopen')}</button
									>
								{:else}
									<button type="submit" class="primary" data-testid="market-days-close"
										>{t('marketDays.close')}</button
									>
								{/if}
							</form>
							<form method="POST" action="?/deleteMarketDay" class="inline">
								<input type="hidden" name="marketDayId" value={marketDay.id} />
								<button type="submit" class="danger" data-testid="market-days-delete"
									>{t('marketDays.delete')}</button
								>
							</form>
						</div>
					</div>
					{#if marketDay.location || marketDay.notes}
						<div class="day-details">
							{#if marketDay.location}
								<p class="location">{marketDay.location}</p>
							{/if}
							{#if marketDay.notes}
								<p class="notes">{marketDay.notes}</p>
							{/if}
						</div>
					{/if}
				</article>
			{/each}
		{:else}
			<p class="empty" data-testid="market-days-empty">{t('marketDays.empty')}</p>
		{/if}
	</section>

	<section class="panel" aria-labelledby="settlement-title">
		<h2 id="settlement-title">{t('settlement.title')}</h2>
		<div class="settlement-list" data-testid="settlement-list">
			{#each data.settlements as settlement (settlement.marketDayId)}
				{#if settlement.soldItemCount > 0 || settlement.totalExpensesCents > 0}
					<div class="settlement-row" data-testid="settlement-item">
						<div>
							<strong>{settlement.marketDayName}</strong>
							<span class="meta"
								>{t('settlement.soldCount', { count: settlement.soldItemCount })}</span
							>
						</div>
						<div class="settlement-numbers">
							<span class="positive"
								>{t('settlement.proceeds', {
									proceeds: formatPrice(settlement.totalProceedsCents)
								})}</span
							>
							<span
								>{t('settlement.expenses', {
									expenses: formatPrice(settlement.totalExpensesCents)
								})}</span
							>
							<strong class:negative={settlement.netResultCents < 0}
								>{t('settlement.net', { net: formatPrice(settlement.netResultCents) })}</strong
							>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	</section>

	<section class="panel" aria-labelledby="expenses-title">
		<div class="panel-head">
			<h2 id="expenses-title">{t('expenses.title')}</h2>
			<button
				type="button"
				class="toggle"
				data-testid="expenses-toggle"
				onclick={() => (expenseFormOpen = !expenseFormOpen)}
			>
				{expenseFormOpen ? t('marketDays.cancel') : t('expenses.toggle')}
			</button>
		</div>
		<p class="panel-sub">{t('expenses.sub')}</p>
		{#if form?.expenseError}
			<p class="form-error" role="alert" data-testid="expenses-error">
				{t(`expenses.error.${form.expenseError}`)}
			</p>
		{/if}
		{#if expenseFormOpen}
			<form
				method="POST"
				action="?/createExpense"
				class="form-grid"
				data-testid="expenses-create-form"
			>
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
				<label class="wide">
					<span>{t('expenses.marketDay')}</span>
					<select name="marketDayId" data-testid="expenses-market-day-input">
						<option value="">{t('expenses.noMarketDay')}</option>
						{#each data.marketDays as marketDay (marketDay.id)}
							<option value={marketDay.id}>{marketDay.name}</option>
						{/each}
					</select>
				</label>
				<div class="actions">
					<button type="submit" data-testid="expenses-create-submit">{t('expenses.create')}</button>
				</div>
			</form>
		{/if}
		<section class="list" data-testid="expenses-list">
			{#if data.expenses.length}
				{#each data.expenses as expense (expense.id)}
					<article class="expense-row" data-testid="expense-item">
						<div class="expense-main">
							<div>
								<strong>{expense.label}</strong>
								<span class="meta"
									>{expenseCategoryLabel(expense.category)}{expense.marketDayName
										? ` · ${expense.marketDayName}`
										: ''}</span
								>
							</div>
							<strong class="amount">{formatPrice(expense.amountCents)} €</strong>
						</div>
						<div class="expense-actions">
							<button
								type="button"
								class="secondary"
								data-testid="expenses-edit-trigger"
								onclick={() => openExpenseDialog(expense)}
							>
								{t('expenses.edit')}
							</button>
							<form method="POST" action="?/deleteExpense" class="inline">
								<input type="hidden" name="expenseId" value={expense.id} />
								<button type="submit" class="danger" data-testid="expenses-delete"
									>{t('expenses.delete')}</button
								>
							</form>
						</div>
					</article>
				{/each}
			{:else}
				<p class="empty" data-testid="expenses-empty">{t('expenses.empty')}</p>
			{/if}
		</section>
	</section>
</main>

<dialog
	class="edit-dialog"
	bind:this={expenseDialog}
	aria-label={t('expenses.edit')}
	data-testid="expenses-edit-dialog"
>
	<div class="dialog-head">
		<h3>{t('expenses.edit')}</h3>
		<button type="button" class="secondary" onclick={closeExpenseDialog}
			>{t('marketDays.cancel')}</button
		>
	</div>
	<form method="POST" action="?/updateExpense">
		<input type="hidden" name="expenseId" value={editExpenseId} />
		<div class="form-grid">
			<label>
				<span>{t('expenses.label')}</span>
				<input name="label" value={editExpenseLabel} required />
			</label>
			<label>
				<span>{t('expenses.category')}</span>
				<select name="category" bind:value={editExpenseCategory} required>
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
					value={editExpenseAmount}
					required
				/>
			</label>
			<label>
				<span>{t('expenses.date')}</span>
				<input name="expenseDate" type="date" value={editExpenseDate} />
			</label>
			<label class="wide">
				<span>{t('expenses.marketDay')}</span>
				<select name="marketDayId" bind:value={editExpenseMarketDayId}>
					<option value="">{t('expenses.noMarketDay')}</option>
					{#each data.marketDays as marketDay (marketDay.id)}
						<option value={marketDay.id}>{marketDay.name}</option>
					{/each}
				</select>
			</label>
		</div>
		<div class="actions">
			<button type="submit" data-testid="expenses-save">{t('expenses.save')}</button>
		</div>
	</form>
</dialog>

<dialog
	class="edit-dialog"
	bind:this={editDialog}
	aria-label={t('marketDays.edit')}
	data-testid="market-days-edit-dialog"
>
	<div class="dialog-head">
		<h3>{t('marketDays.editTitle')}</h3>
		<button type="button" class="secondary" onclick={closeEditDialog}
			>{t('marketDays.cancel')}</button
		>
	</div>
	<form method="POST" action="?/updateMarketDay">
		<input type="hidden" name="marketDayId" value={editMarketDayId} />
		<div class="form-grid">
			<label>
				<span>{t('marketDays.name')}</span>
				<input name="name" value={editMarketDayName} required />
			</label>
			<label>
				<span>{t('marketDays.date')}</span>
				<input name="date" type="date" value={editMarketDayDate} />
			</label>
			<label>
				<span>{t('marketDays.startTime')}</span>
				<input name="startTime" type="time" value={editMarketDayStartTime} />
			</label>
			<label>
				<span>{t('marketDays.endTime')}</span>
				<input name="endTime" type="time" value={editMarketDayEndTime} />
			</label>
			<label class="wide">
				<span>{t('marketDays.location')}</span>
				<input name="location" value={editMarketDayLocation} />
			</label>
			<label class="wide">
				<span>{t('marketDays.notes')}</span>
				<input
					name="notes"
					value={editMarketDayNotes}
					placeholder={t('marketDays.notesPlaceholder')}
				/>
			</label>
		</div>
		<div class="actions">
			<button type="submit">{t('marketDays.save')}</button>
		</div>
	</form>
</dialog>

<style>
	.market-days-page {
		margin: 0 auto;
		max-width: 52rem;
		padding: 0 1.25rem 3rem;
	}

	.head {
		padding: 1.5rem 1rem 1rem;
		text-align: center;
	}

	.head h1 {
		color: var(--color-accent-strong);
		font-size: 1.7rem;
		font-weight: 800;
		margin: 0;
	}

	.head .sub {
		color: var(--color-text-muted);
		font-size: 0.92rem;
		margin: 6px 0 0;
	}

	.panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		margin-bottom: 1rem;
		padding: 1.1rem;
	}

	.panel-head {
		align-items: center;
		display: flex;
		justify-content: space-between;
	}

	.panel-head h2 {
		font-size: 1rem;
		margin: 0;
	}

	.form-grid {
		display: grid;
		gap: 0.8rem;
		grid-template-columns: repeat(2, 1fr);
		margin-top: 0.8rem;
	}

	.form-grid label {
		display: grid;
		gap: 0.3rem;
	}

	.form-grid label.wide {
		grid-column: 1 / -1;
	}

	.form-grid label > span {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.form-grid input {
		background: var(--color-input);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		font: inherit;
		padding: 0.6rem 0.75rem;
		width: 100%;
	}

	.form-grid input:focus {
		border-color: var(--color-ice);
		box-shadow: 0 0 0 4px var(--focus-ring);
		outline: none;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
	}

	.actions button {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border: 0;
		border-radius: var(--radius-control);
		box-shadow: var(--shadow-cta);
		color: #fff;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 700;
		padding: 0.6rem 1.1rem;
	}

	.market-day {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		margin-bottom: 0.8rem;
		padding: 1rem 1.1rem;
	}

	.market-day.closed {
		opacity: 0.65;
	}

	.day-head {
		align-items: flex-start;
		display: flex;
		gap: 0.8rem;
		justify-content: space-between;
	}

	.day-head h3 {
		color: var(--color-accent-strong);
		font-size: 1.05rem;
		margin: 0;
	}

	.meta {
		align-items: center;
		color: var(--color-text-muted);
		display: flex;
		font-size: 0.85rem;
		gap: 0.6rem;
		margin: 4px 0 0;
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

	.day-actions {
		align-items: center;
		display: flex;
		flex-shrink: 0;
		gap: 0.5rem;
	}

	.day-actions .inline {
		display: contents;
	}

	.secondary,
	.primary {
		border-radius: var(--radius-control);
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 700;
		padding: 0.5rem 0.85rem;
		transition: filter 0.2s ease;
	}

	.secondary {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		color: var(--color-accent);
	}

	.primary {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border: 0;
		box-shadow: var(--shadow-cta);
		color: #fff;
	}

	.secondary:focus-visible,
	.primary:focus-visible,
	.toggle:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.toggle {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-accent);
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 700;
		padding: 0.5rem 0.9rem;
	}

	.day-details {
		border-top: 1px solid var(--color-border);
		margin-top: 0.7rem;
		padding-top: 0.6rem;
	}

	.day-details .location,
	.day-details .notes {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		margin: 0;
	}

	.empty {
		color: var(--color-text-muted);
		padding: 3rem 1rem;
		text-align: center;
	}

	.form-error {
		background: var(--color-warn-soft);
		border-radius: var(--radius-control);
		color: var(--color-warn);
		padding: 0.6rem 0.9rem;
	}

	.edit-dialog {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		max-width: min(34rem, 92vw);
		padding: 1.25rem;
		width: 34rem;
	}

	.dialog-head {
		align-items: center;
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.dialog-head h3 {
		color: var(--color-accent-strong);
		font-size: 1.1rem;
		margin: 0;
	}

	.edit-dialog form > .actions {
		justify-content: flex-end;
		margin-top: 1rem;
	}

	@media (max-width: 600px) {
		.day-actions {
			flex-direction: column;
		}

		.form-grid {
			grid-template-columns: 1fr;
		}
	}
	.panel-sub {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		margin: -0.4rem 0 0;
	}

	.settlement-list {
		display: grid;
		gap: 0.6rem;
		margin-top: 0.8rem;
	}

	.settlement-row {
		align-items: center;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.65rem;
		display: flex;
		gap: 0.8rem;
		justify-content: space-between;
		padding: 0.7rem 0.9rem;
	}

	.settlement-row .meta {
		color: var(--color-text-muted);
		display: block;
		font-size: 0.8rem;
	}

	.settlement-numbers {
		display: grid;
		font-size: 0.85rem;
		gap: 0.15rem;
		justify-items: end;
	}

	.settlement-numbers .positive {
		color: var(--color-ok);
	}

	.settlement-numbers strong.negative {
		color: var(--color-danger);
	}

	.expense-row {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		margin-bottom: 0.6rem;
		padding: 0.8rem 1rem;
	}

	.expense-main {
		align-items: center;
		display: flex;
		gap: 0.8rem;
		justify-content: space-between;
	}

	.expense-main .meta {
		color: var(--color-text-muted);
		display: block;
		font-size: 0.8rem;
		margin-top: 2px;
	}

	.expense-main .amount {
		color: var(--color-accent-strong);
		white-space: nowrap;
	}

	.expense-actions {
		display: flex;
		gap: var(--gap-action-row);
		justify-content: flex-end;
		margin-top: var(--gap-action-block);
	}

	.danger {
		background: var(--color-danger-soft);
		border: 1px solid var(--color-danger);
		border-radius: var(--radius-control);
		color: var(--color-danger);
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 700;
		padding: 0.5rem 0.85rem;
	}

	.inline {
		display: contents;
	}
</style>
