<script lang="ts">
	import { formatPrice } from '$lib/utils/format';

	/**
	 * One slice of the donut chart.
	 */
	interface DonutSlice {
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
		emptyLabel
	}: {
		slices: DonutSlice[];
		testId: string;
		/** Label in the donut hole (e.g. "Erlös"). */
		centerLabel?: string;
		/** Value in the donut hole in cents. */
		centerValueCents?: number;
		emptyLabel?: string;
	} = $props();

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
	 * Build the conic-gradient CSS for the donut ring.
	 *
	 * @returns {string} The conic-gradient background value.
	 */
	const ringStyle = $derived.by(() => {
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
	<div class="donut-wrap" data-testid={testId}>
		<div
			class="donut"
			style={ringStyle}
			role="img"
			aria-label={slices
				.map((slice) => `${slice.label}: ${formatPrice(slice.valueCents)} €`)
				.join(', ')}
		>
			<div class="hole">
				{#if centerValueCents !== undefined}
					<span class="hole-label">{centerLabel}</span>
					<strong class="hole-value">{formatPrice(centerValueCents)} €</strong>
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
					<div class="legend-text">
						<span class="legend-label">{slice.label}</span>
						<span class="legend-value">{formatPrice(slice.valueCents)} €</span>
						{#if slice.countLabel}
							<span class="legend-count">{slice.countLabel}</span>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</div>
{:else if emptyLabel}
	<p class="empty">{emptyLabel}</p>
{/if}

<style>
	.donut-wrap {
		display: grid;
		gap: 1rem;
		justify-items: start;
	}

	.donut {
		max-width: 11rem;
	}

	.donut {
		aspect-ratio: 1;
		border-radius: 50%;
		position: relative;
		width: 100%;
	}

	.hole {
		align-items: center;
		background: var(--color-surface);
		border-radius: 50%;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		inset: 22%;
		justify-content: center;
		position: absolute;
		text-align: center;
	}

	.hole-label {
		color: var(--color-text-muted);
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.hole-value {
		color: var(--color-accent-strong);
		font-size: 1rem;
	}

	.legend {
		display: grid;
		gap: 0.4rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.legend li {
		align-items: flex-start;
		display: flex;
		gap: 0.5rem;
		min-width: 0;
	}

	.legend-text {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}

	.swatch {
		align-self: center;
		border-radius: 3px;
		display: inline-block;
		flex-shrink: 0;
		height: 0.7rem;
		width: 0.7rem;
	}

	.legend-label {
		font-weight: 700;
	}

	.legend-value {
		color: var(--color-text-muted);
	}

	.legend-count {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 300;
	}

	.empty {
		color: var(--color-text-muted);
		margin: 0;
	}
</style>
