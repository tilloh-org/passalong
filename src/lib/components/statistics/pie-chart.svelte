<script lang="ts">
	import { formatPrice } from '$lib/utils/format';

	/**
	 * One slice of the pie chart.
	 */
	interface PieSlice {
		/** Localized slice label. */
		label: string;
		/** Slice value in cents. */
		valueCents: number;
		/** Optional count annotation (e.g. "3 sales"). */
		countLabel?: string;
	}

	let {
		slices,
		testId,
		centerLabel,
		centerValueCents,
		centerCount,
		mode = 'money',
		emptyLabel
	}: {
		slices: PieSlice[];
		testId: string;
		/** Label under the center total (e.g. "Gesamt"). */
		centerLabel?: string;
		/** Monetary total in the pie center in cents (money mode). */
		centerValueCents?: number;
		/** Count total in the pie center (count mode, rendered as "{count}x"). */
		centerCount?: number;
		/** How slice values render: euros ("10,00 €") or counts ("2x"). */
		mode?: 'money' | 'count';
		emptyLabel?: string;
	} = $props();

	/**
	 * Format one slice value according to the chart mode.
	 *
	 * @param {number} valueCents - The raw slice value.
	 * @returns {string} The formatted legend value.
	 */
	function sliceValue(valueCents: number): string {
		return mode === 'count' ? `${valueCents}x` : `${formatPrice(valueCents)} €`;
	}

	/** Palette for up to eight slices, repeated afterwards. */
	const palette = [
		'var(--color-accent-strong)',
		'var(--color-accent)',
		'#5b9aa8',
		'#7db4bf',
		'#a3cdd4',
		'#c9e2e6',
		'#2c5560',
		'#41707c'
	];

	/** The total of all slice values. */
	const total = $derived(
		Math.max(
			1,
			slices.reduce((sum, slice) => sum + slice.valueCents, 0)
		)
	);

	/**
	 * Build the conic-gradient CSS for the pie.
	 *
	 * @returns {string} The conic-gradient background value.
	 */
	const pieStyle = $derived.by(() => {
		let cursor = 0;
		const stops: string[] = [];
		slices.forEach((slice, index) => {
			const share = (slice.valueCents / total) * 100;
			const start = cursor;
			cursor += share;
			stops.push(`${palette[index % palette.length]} ${start}% ${cursor}%`);
		});
		if (cursor < 100) {
			stops.push(`var(--color-border) ${cursor}% 100%`);
		}
		return `background: conic-gradient(${stops.join(', ')})`;
	});
</script>

{#if slices.length > 0}
	<div class="pie-wrap" data-testid={testId}>
		<div
			class="pie"
			style={pieStyle}
			role="img"
			aria-label={slices
				.map((slice) => `${slice.label}: ${sliceValue(slice.valueCents)}`)
				.join(', ')}
		>
			<div class="pie-center">
				{#if centerCount !== undefined}
					<strong class="pie-total">{centerCount}x</strong>
				{:else if centerValueCents !== undefined}
					<strong class="pie-total">{formatPrice(centerValueCents)} €</strong>
				{/if}
				{#if centerLabel}
					<span class="pie-center-label">{centerLabel}</span>
				{/if}
			</div>
		</div>
		<ul class="legend">
			{#each slices as slice, index (slice.label)}
				<li>
					<span
						class="swatch"
						style={`background: ${palette[index % palette.length]}`}
						aria-hidden="true"
					></span>
					<span class="legend-label">{slice.label}</span>
					<span class="legend-value">{sliceValue(slice.valueCents)}</span>
				</li>
			{/each}
		</ul>
	</div>
{:else if emptyLabel}
	<p class="empty">{emptyLabel}</p>
{/if}

<style>
	.pie-wrap {
		display: grid;
		gap: 1rem;
		justify-items: start;
	}

	.pie {
		aspect-ratio: 1;
		border-radius: 50%;
		box-shadow: var(--shadow-card);
		max-width: 11rem;
		position: relative;
		width: 100%;
	}

	.pie-center {
		align-items: center;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		inset: 0;
		justify-content: center;
		position: absolute;
		text-align: center;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
	}

	.pie-total {
		color: #fff;
		font-size: 1.3rem;
	}

	.pie-center-label {
		color: rgba(255, 255, 255, 0.75);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.legend {
		display: grid;
		gap: 0.4rem;
		list-style: none;
		margin: 0;
		padding: 0;
		width: 100%;
	}

	.legend li {
		align-items: center;
		display: flex;
		gap: 0.5rem;
		min-width: 0;
	}

	.legend-label {
		font-weight: 700;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.legend-value {
		color: var(--color-text-muted);
		margin-left: auto;
		white-space: nowrap;
	}

	.swatch {
		align-self: center;
		border-radius: 3px;
		display: inline-block;
		flex-shrink: 0;
		height: 0.7rem;
		width: 0.7rem;
	}

	.empty {
		color: var(--color-text-muted);
		margin: 0;
	}
</style>
