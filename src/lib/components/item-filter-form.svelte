<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
	import type { ItemCategory, ItemCondition, ItemStatusFilter } from '$lib/server/collection-repository';

	/**
	 * Buyer/owner item filter form, shared by the portfolio page and the
	 * public stand page. The action target and the hidden context fields
	 * come from the caller; the visible controls and their labels are
	 * identical everywhere.
	 */

	interface FilterState {
		query: string | null;
		category: ItemCategory | string | null;
		condition: ItemCondition | string | null;
		status: ItemStatusFilter | string | null;
	}

	let {
		action,
		hiddenFields = {},
		appliedFilters,
		categoryOptions,
		conditionOptions,
		statusOptions = ['open', 'reserved', 'sold'],
		hasActive,
		resetHref,
		testIdPrefix
	}: {
		action: string;
		hiddenFields?: Record<string, string>;
		appliedFilters: FilterState;
		categoryOptions: readonly string[];
		conditionOptions: readonly string[];
		statusOptions?: readonly string[];
		hasActive: boolean;
		resetHref: string;
		/** Prefix for the data-testid values; pass '' to keep the legacy portfolio ids. */
		testIdPrefix: string;
	} = $props();

	const testId = (suffix: string) => `${testIdPrefix}${suffix}`;

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
	 * Translate a status filter key in the active locale.
	 *
	 * @param {string} status - A status filter key such as `open`.
	 * @returns {string} Human-readable status label.
	 */
	const statusFilterLabel = (status: string) => t(`statusFilter.${status}`);
</script>

<form class="item-filters" method="GET" action={action} data-testid={testId('-filter-form')}>
	{#each Object.entries(hiddenFields) as [name, value] (name)}
		<input type="hidden" name={name} value={value} />
	{/each}
	<label class="filter-search">
		<span>{t('portfolio.search')}</span>
		<input
			name="q"
			type="search"
			value={appliedFilters.query ?? ''}
			placeholder={t('portfolio.searchPlaceholder')}
			data-testid={testId('-search-input')}
		/>
	</label>
	<label>
		<span>{t('portfolio.category')}</span>
		<select name="category" data-testid={testId('-category-select')}>
			<option value="">{t('portfolio.all')}</option>
			{#each categoryOptions as category}
				<option value={category} selected={appliedFilters.category === category}>{categoryLabel(category)}</option>
			{/each}
		</select>
	</label>
	<label>
		<span>{t('portfolio.condition')}</span>
		<select name="condition" data-testid={testId('-condition-select')}>
			<option value="">{t('portfolio.all')}</option>
			{#each conditionOptions as condition}
				<option value={condition} selected={appliedFilters.condition === condition}>{conditionLabel(condition)}</option>
			{/each}
		</select>
	</label>
	<label>
		<span>{t('portfolio.status')}</span>
		<select name="status" data-testid={testId('-status-select')}>
			<option value="">{t('portfolio.all')}</option>
			{#each statusOptions as status}
				<option value={status} selected={appliedFilters.status === status}>{statusFilterLabel(status)}</option>
			{/each}
		</select>
	</label>
	<div class="filter-actions">
		<button type="submit" class="filter-apply" data-testid={testId('-apply')}>{t('portfolio.applyFilters')}</button>
		{#if hasActive}
			<a class="filter-reset" href={resetHref} data-testid={testId('-reset')}>{t('portfolio.resetFilters')}</a>
		{/if}
	</div>
</form>

<style>
	.item-filters {
		align-items: end;
		display: grid;
		gap: 1rem;
		grid-template-columns: minmax(12rem, 1.6fr) repeat(3, minmax(0, 1fr)) auto;
		margin: 0 0 0.25rem;
	}

	.item-filters label {
		display: grid;
		gap: 0.3rem;
	}

	.item-filters label > span {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.item-filters input,
	.item-filters select {
		background: var(--color-input);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-text);
		font: inherit;
		font-size: 0.9rem;
		padding: 0.6rem 0.75rem;
		width: 100%;
	}

	.item-filters input:focus,
	.item-filters select:focus {
		border-color: var(--color-ice);
		box-shadow: 0 0 0 4px var(--focus-ring);
		outline: none;
	}

	.filter-actions {
		align-items: center;
		display: flex;
		gap: 0.6rem;
		justify-content: flex-end;
	}

	.filter-apply {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border: 0;
		border-radius: var(--radius-control);
		box-shadow: var(--shadow-cta);
		color: #fff;
		font-size: 0.9rem;
		font-weight: 700;
		padding: 0.6rem 1.1rem;
	}

	.filter-apply:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.filter-reset {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-accent);
		font-size: 0.9rem;
		font-weight: 700;
		padding: 0.6rem 1rem;
		text-decoration: none;
	}

	.filter-reset:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	@media (max-width: 880px) {
		.item-filters {
			grid-template-columns: 1fr 1fr;
		}

		.item-filters .filter-search {
			grid-column: 1 / -1;
		}
	}
</style>