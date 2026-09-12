<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';

	/** The two supported chart renderings for one card. */
	type ChartType = 'bars' | 'pie';

	let {
		value,
		onchange,
		testId
	}: {
		/** Currently active chart type. */
		value: ChartType;
		/** Called with the newly selected chart type. */
		onchange: (next: ChartType) => void;
		testId: string;
	} = $props();
</script>

<div class="chart-toggle" data-testid={testId} role="group">
	<button
		type="button"
		class="chart-toggle-option"
		class:active={value === 'bars'}
		aria-pressed={value === 'bars'}
		data-testid={`${testId}-bars`}
		onclick={() => onchange('bars')}
	>
		<svg class="icon" aria-hidden="true" focusable="false">
			<use href="#icon-chart-bars" />
		</svg>
		<span>{t('chartToggle.bars')}</span>
	</button>
	<button
		type="button"
		class="chart-toggle-option"
		class:active={value === 'pie'}
		aria-pressed={value === 'pie'}
		data-testid={`${testId}-pie`}
		onclick={() => onchange('pie')}
	>
		<svg class="icon" aria-hidden="true" focusable="false">
			<use href="#icon-chart-pie" />
		</svg>
		<span>{t('chartToggle.pie')}</span>
	</button>
</div>

<style>
	.chart-toggle {
		background: var(--color-accent-soft);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		display: inline-grid;
		gap: 0.15rem;
		grid-auto-flow: column;
		margin: 0 0 0.8rem;
		padding: 0.2rem;
	}

	.chart-toggle-option {
		align-items: center;
		background: transparent;
		border: 0;
		border-radius: 999px;
		color: var(--color-text-muted);
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		font-size: 0.78rem;
		font-weight: 700;
		gap: 0.35rem;
		padding: 0.35rem 0.8rem;
	}

	.chart-toggle-option.active {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		box-shadow: var(--shadow-cta);
		color: #fff;
	}

	.chart-toggle-option:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.icon {
		height: 0.85rem;
		width: 0.85rem;
	}
</style>
