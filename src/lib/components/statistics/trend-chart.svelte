<script lang="ts">
	import { getLocale } from '$lib/i18n/index.svelte';
	import { formatPrice } from '$lib/utils/format';

	/**
	 * One day of the proceeds trend series.
	 */
	interface TrendEntry {
		/** ISO date (YYYY-MM-DD). */
		day: string;
		/** Proceeds of the day in cents. */
		totalProceedsCents: number;
	}

	let {
		entries,
		testId,
		emptyLabel
	}: { entries: TrendEntry[]; testId: string; emptyLabel?: string } = $props();

	/** The largest single-day proceeds value. */
	const maximum = $derived(Math.max(0, ...entries.map((entry) => entry.totalProceedsCents)));

	/**
	 * Compute the CSS height percentage for a vertical bar.
	 *
	 * @param {number} value - The day value.
	 * @param {number} max - The largest day value in the series.
	 * @returns {number} The bar height in percent (0–100).
	 */
	function barHeight(value: number, max: number): number {
		return max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
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
</script>

{#if entries.length > 0}
	<div class="trend-chart" data-testid={testId}>
		{#each entries as entry (entry.day)}
			<div class="trend-column">
				<span class="trend-value">{formatPrice(entry.totalProceedsCents)} €</span>
				<div class="trend-bar-track">
					<div
						class="trend-bar"
						style={`height: ${barHeight(entry.totalProceedsCents, maximum)}%`}
					></div>
				</div>
				<span class="trend-day">{dayLabel(entry.day)}</span>
			</div>
		{/each}
	</div>
{:else if emptyLabel}
	<p class="empty">{emptyLabel}</p>
{/if}

<style>
	.trend-chart {
		align-items: end;
		display: grid;
		gap: 0.6rem;
		grid-auto-flow: column;
		grid-auto-columns: minmax(3rem, 1fr);
		height: 11rem;
	}

	.trend-column {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		height: 100%;
		justify-content: flex-end;
		text-align: center;
	}

	.trend-value {
		color: var(--color-text-muted);
		font-size: 0.7rem;
		white-space: nowrap;
	}

	.trend-bar-track {
		background: var(--color-accent-soft);
		border-radius: 0.4rem 0.4rem 0 0;
		flex: 1;
		overflow: hidden;
	}

	.trend-bar {
		background: linear-gradient(180deg, var(--color-accent-strong), var(--color-accent));
		border-radius: 0.4rem 0.4rem 0 0;
		margin-top: auto;
		width: 100%;
	}

	.trend-day {
		color: var(--color-text-muted);
		font-size: 0.68rem;
		white-space: nowrap;
	}

	.empty {
		color: var(--color-text-muted);
		margin: 0;
	}
</style>
