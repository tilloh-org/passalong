<script lang="ts">
	import { formatPrice } from '$lib/utils/format';

	/**
	 * One bucket of a horizontal bar chart.
	 */
	interface BarEntry {
		/** Localized bucket label. */
		label: string;
		/** Bucket value in cents. */
		valueCents: number;
		/** Optional count annotation (e.g. "3 sales"). */
		countLabel?: string;
	}

	let {
		entries,
		testId,
		emptyLabel,
		accent = 'proceeds'
	}: {
		entries: BarEntry[];
		testId: string;
		emptyLabel?: string;
		accent?: 'proceeds' | 'expenses';
	} = $props();

	/** The largest bucket value in the series. */
	const maximum = $derived(Math.max(0, ...entries.map((entry) => entry.valueCents)));

	/**
	 * Compute the CSS width percentage for a horizontal bar.
	 *
	 * @param {number} value - The bucket value.
	 * @param {number} max - The largest bucket value in the series.
	 * @returns {number} The bar width in percent (0–100).
	 */
	function barWidth(value: number, max: number): number {
		return max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
	}
</script>

{#if entries.length > 0}
	<ul class="bar-list" data-testid={testId} class:expenses={accent === 'expenses'}>
		{#each entries as entry (entry.label)}
			<li>
				<div class="bar-row">
					<span class="bar-label">{entry.label}</span>
					<span class="bar-value">{formatPrice(entry.valueCents)} €</span>
				</div>
				<div class="bar-track">
					<div class="bar-fill" style={`width: ${barWidth(entry.valueCents, maximum)}%`}></div>
				</div>
				{#if entry.countLabel}
					<span class="bar-count">{entry.countLabel}</span>
				{/if}
			</li>
		{/each}
	</ul>
{:else if emptyLabel}
	<p class="empty">{emptyLabel}</p>
{/if}

<style>
	.bar-list {
		display: grid;
		gap: 0.7rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.bar-list li {
		display: grid;
		gap: 0.25rem;
	}

	.bar-row {
		display: flex;
		gap: 0.5rem;
		justify-content: space-between;
	}

	.bar-label {
		font-weight: 700;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.bar-value {
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.bar-track {
		background: var(--color-accent-soft);
		border-radius: 999px;
		height: 0.5rem;
		overflow: hidden;
	}

	.bar-fill {
		background: linear-gradient(90deg, var(--color-accent-strong), var(--color-accent));
		border-radius: 999px;
		height: 100%;
		min-width: 0.5rem;
	}

	.bar-list.expenses .bar-track {
		background: var(--color-danger-soft, rgba(196, 83, 74, 0.16));
	}

	.bar-list.expenses .bar-fill {
		background: linear-gradient(90deg, var(--color-danger), var(--color-danger-border, #a34640));
	}

	.bar-count {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 300;
	}

	.empty {
		color: var(--color-text-muted);
		margin: 0;
	}
</style>
