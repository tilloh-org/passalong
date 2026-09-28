<script lang="ts">
	import { getLocale, t } from '$lib/i18n/index.svelte';
	import { formatPrice } from '$lib/utils/format';
	import type { MarketDay } from '$lib/server/collection-repository';
	import Icon from '$lib/components/icon.svelte';

	let { data, form } = $props();

	/** Resolve a settlement summary for every market-day landing card. */
	const settlementsByMarketDay = $derived(
		new Map(data.settlements.map((settlement) => [settlement.marketDayId, settlement]))
	);

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
</script>

<svelte:head>
	<title>{t('marketDays.titleSuffix')} · passalong</title>
</svelte:head>

<main class="market-days-page">
	<section class="head">
		<h1 data-testid="market-days-title">{t('marketDays.title')}</h1>
		<p class="sub">{t('marketDays.sub')}</p>
	</section>

	<section class="panel create-panel" aria-labelledby="create-title">
		<div class="panel-head">
			<div>
				<h2 id="create-title"><Icon name="plus" />{t('marketDays.createTitle')}</h2>
				<p>{t('marketDays.createSub')}</p>
			</div>
		</div>
		{#if form?.marketDayError}
			<p class="form-error" role="alert" data-testid="market-days-error">{form.marketDayError}</p>
		{/if}
		<form
			method="POST"
			action="?/createMarketDay"
			class="form-grid"
			data-testid="market-days-create-form"
		>
			<label class="name-field">
				<span>{t('marketDays.name')}</span>
				<input name="name" required data-testid="market-days-name-input" />
			</label>
			<label>
				<span>{t('marketDays.date')}</span>
				<input name="date" type="date" data-testid="market-days-date-input" />
			</label>
			<label>
				<span>{t('marketDays.location')}</span>
				<input name="location" data-testid="market-days-location-input" />
			</label>
			<label>
				<span>{t('marketDays.startTime')}</span>
				<input name="startTime" type="time" data-testid="market-days-start-input" />
			</label>
			<label>
				<span>{t('marketDays.endTime')}</span>
				<input name="endTime" type="time" data-testid="market-days-end-input" />
			</label>
			<label class="notes-field">
				<span>{t('marketDays.notes')}</span>
				<input
					name="notes"
					placeholder={t('marketDays.notesPlaceholder')}
					data-testid="market-days-notes-input"
				/>
			</label>
			<div class="actions">
				<button type="submit" data-testid="market-days-create-submit"
					><Icon name="plus" size="sm" />{t('marketDays.create')}</button
				>
			</div>
		</form>
	</section>

	<section
		class="market-day-section"
		aria-labelledby="market-day-list-title"
		data-testid="market-days-list"
	>
		<h2 id="market-day-list-title"><Icon name="calendar" />{t('marketDays.listTitle')}</h2>
		{#if data.marketDays.length}
			<div class="market-day-list">
				{#each data.marketDays as marketDay (marketDay.id)}
					{@const settlement = settlementsByMarketDay.get(marketDay.id)}
					<a
						class="market-day-card"
						class:closed={marketDay.closedAt}
						href={`/market-days/${marketDay.id}`}
						data-testid="market-day-item"
					>
						<div class="market-day-card-top">
							<div>
								<h3>{marketDay.name}</h3>
								{#if marketDay.location}
									<p class="location">{marketDay.location}</p>
								{/if}
							</div>
							<span class="pill" class:closed-pill={marketDay.closedAt}
								>{statusLabel(marketDay)}</span
							>
						</div>
						<div class="summary">
							<span class="summary-item"
								><Icon name="calendar" size="sm" tone="muted" />{displayDate(marketDay.date)}</span
							>
							<span class="summary-item"
								><Icon name="package" size="sm" tone="muted" />{t('settlement.soldCount', {
									count: settlement?.soldItemCount ?? 0
								})}</span
							>
							<strong class="summary-item"
								><Icon name="euro" size="sm" />{t('settlement.proceeds', {
									proceeds: formatPrice(settlement?.totalProceedsCents ?? 0)
								})}</strong
							>
						</div>
					</a>
				{/each}
			</div>
		{:else}
			<p class="empty" data-testid="market-days-empty">{t('marketDays.empty')}</p>
		{/if}
	</section>
</main>

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

	.sub,
	.panel-head p {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		margin: 0.3rem 0 0;
	}

	.panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		padding: 1.15rem;
	}

	.panel-head h2,
	.market-day-section > h2 {
		align-items: center;
		color: var(--color-accent-strong);
		display: flex;
		font-size: 1.1rem;
		gap: 0.4rem;
		margin: 0;
	}

	.form-grid {
		display: grid;
		gap: 0.8rem;
		grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr));
		margin-top: 1rem;
	}

	.form-grid label {
		display: grid;
		gap: 0.3rem;
	}

	.form-grid .name-field {
		grid-column: span 2;
	}

	.form-grid .notes-field,
	.form-grid .actions {
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
		color: var(--color-text);
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
		margin-top: var(--gap-action-block);
	}

	.actions button {
		align-items: center;
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border: 0;
		border-radius: var(--radius-control);
		box-shadow: var(--shadow-cta);
		color: #fff;
		cursor: pointer;
		display: inline-flex;
		font-size: 0.9rem;
		font-weight: 700;
		gap: 0.35rem;
		padding: 0.6rem 1.1rem;
	}

	.market-day-section {
		margin-top: 1.5rem;
	}

	.market-day-list {
		display: grid;
		gap: 0.8rem;
		margin-top: 0.8rem;
	}

	.market-day-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		color: var(--color-text);
		display: grid;
		gap: 0.85rem;
		padding: 1rem 1.1rem;
		text-decoration: none;
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease,
			transform 0.2s ease;
	}

	.market-day-card:hover,
	.market-day-card:focus-visible {
		border-color: var(--color-accent);
		box-shadow: var(--shadow-tile-hover);
		transform: translateY(-2px);
	}

	.market-day-card:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 3px;
	}

	.market-day-card.closed {
		opacity: 0.72;
	}

	.market-day-card-top,
	.summary {
		align-items: center;
		display: flex;
		gap: 0.75rem;
		justify-content: space-between;
	}

	.market-day-card h3 {
		color: var(--color-accent-strong);
		font-size: 1.05rem;
		margin: 0;
	}

	.location {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		margin: 0.2rem 0 0;
	}

	.summary {
		color: var(--color-text-muted);
		font-size: 0.83rem;
		justify-content: flex-start;
	}

	.summary-item {
		align-items: center;
		display: inline-flex;
		gap: 0.3rem;
	}

	.summary strong {
		color: var(--color-accent-strong);
		margin-left: auto;
		white-space: nowrap;
	}

	.pill {
		background: var(--color-ok-soft);
		border: 1px solid var(--color-ok-border);
		border-radius: 999px;
		color: var(--color-ok);
		font-size: 0.68rem;
		font-weight: 800;
		padding: 2px 10px;
		white-space: nowrap;
	}

	.closed-pill {
		background: var(--color-warn-soft);
		border-color: var(--color-warn);
		color: var(--color-warn);
	}

	.empty {
		background: var(--color-surface);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-card);
		color: var(--color-text-muted);
		margin: 0.8rem 0 0;
		padding: 1rem;
	}

	.form-error {
		background: var(--color-warn-soft);
		border-radius: var(--radius-control);
		color: var(--color-warn);
		margin: 0.8rem 0 0;
		padding: 0.6rem 0.9rem;
	}

	@media (max-width: 600px) {
		.form-grid {
			grid-template-columns: 1fr;
		}

		.form-grid .name-field {
			grid-column: auto;
		}

		.market-day-card-top {
			align-items: flex-start;
		}

		.summary {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.25rem;
		}

		.summary strong {
			margin-left: 0;
		}
	}
</style>
