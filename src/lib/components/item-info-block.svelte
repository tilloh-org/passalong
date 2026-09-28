<script lang="ts">
	import { formatPrice } from '$lib/utils/format';
	import { t } from '$lib/i18n/index.svelte';
	import Icon from '$lib/components/icon.svelte';

	/**
	 * Buyer-facing item information block, shared by the internal item
	 * detail page and the public stand item page.
	 *
	 * The public variant omits owner-only fields (internal notes) and
	 * owner-only status details (sale proceeds); the internal variant
	 * renders the full field set.
	 */

	interface ItemInfo {
		title: string;
		priceCents: number;
		category: string;
		condition: string;
		externalDescription: string;
		internalNotes?: string;
		isComplete?: boolean;
		isFunctional?: boolean;
		reservedAt: string | null;
		soldAt?: string | null;
	}

	let { item, variant = 'internal' }: { item: ItemInfo; variant?: 'internal' | 'public' } =
		$props();

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
	 * Whether the item is currently reserved (and not sold).
	 */
	const isReserved = $derived(Boolean(item.reservedAt) && !item.soldAt);
</script>

<p class="eyebrow">
	<Icon name="tag" size="sm" tone="muted" />
	{categoryLabel(item.category)} · {conditionLabel(item.condition)}
</p>
<h1 class="item-title">{item.title}</h1>
<p class="price">{formatPrice(item.priceCents)} €</p>
<div class="flag-pills" data-testid="item-flag-pills">
	<span class="flag-pill category"><Icon name="tag" size="sm" />{categoryLabel(item.category)}</span
	>
	{#if item.isComplete}
		<span class="flag-pill complete"><Icon name="check" size="sm" />{t('item.complete')}</span>
	{/if}
	{#if item.isFunctional}
		<span class="flag-pill functional"
			><Icon name="settings" size="sm" />{t('item.functional')}</span
		>
	{/if}
	{#if isReserved}
		<span class="flag-pill reserved" data-testid="item-reserved-badge"
			><Icon name="bookmark" size="sm" />{t('item.reserved')}</span
		>
	{/if}
</div>
{#if item.externalDescription}
	<div class="description external" data-testid="item-external-description">
		<strong><Icon name="note" size="sm" />{t('item.descriptionLabel')}</strong>
		<p>{item.externalDescription}</p>
	</div>
{/if}
{#if variant === 'internal' && item.internalNotes}
	<div class="description internal" data-testid="item-internal-notes">
		<strong><Icon name="note" size="sm" />{t('item.internalNotesLabel')}</strong>
		<p>{item.internalNotes}</p>
	</div>
{/if}

<style>
	.eyebrow {
		align-items: center;
		color: var(--color-text-muted);
		display: flex;
		font-size: 0.85rem;
		font-weight: 600;
		gap: 0.3rem;
		letter-spacing: 0.02em;
		margin: 0;
	}

	.item-title {
		color: var(--color-accent-strong);
		font-size: 1.6rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		margin: 4px 0 0;
	}

	.price {
		color: var(--color-accent);
		font-size: 1.35rem;
		font-weight: 800;
		margin: 6px 0 0;
	}

	.flag-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 10px;
	}

	.flag-pill {
		align-items: center;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		color: var(--color-text-muted);
		display: inline-flex;
		font-size: 0.72rem;
		font-weight: 700;
		gap: 0.25rem;
		padding: 3px 10px;
	}

	.flag-pill.complete {
		background: var(--color-ok-soft);
		border: 1px solid var(--color-ok-border);
		color: var(--color-ok);
	}

	.flag-pill.reserved {
		background: var(--color-warn-soft);
		border: 1px solid var(--color-warn);
		color: var(--color-warn);
	}

	.description {
		border-top: 1px solid var(--color-border);
		font-size: 0.92rem;
		line-height: 1.5;
		margin-top: 14px;
		padding-top: 10px;
	}

	.description strong {
		align-items: center;
		color: var(--color-text-muted);
		display: inline-flex;
		font-size: 0.78rem;
		gap: 0.3rem;
		margin-bottom: 2px;
	}

	.description p {
		margin: 0;
		white-space: pre-line;
	}
</style>
