<script lang="ts">
	/**
	 * A single metric card inside the summary card row.
	 */
	interface StatCard {
		/** Localized metric label. */
		label: string;
		/** Formatted metric value (price string without currency symbol). */
		value: string;
		/** Optional secondary meta line under the value. */
		meta?: string;
		/** Whether the value represents a negative result (accent styling). */
		negative?: boolean;
	}

	let { cards, testIdPrefix }: { cards: StatCard[]; testIdPrefix: string } = $props();
</script>

<div class="totals" data-testid="statistics-totals">
	{#each cards as card, index (card.label)}
		<div
			class="total-card"
			class:negative={card.negative === true}
			data-testid={`${testIdPrefix}-${index}`}
		>
			<span class="total-label">{card.label}</span>
			<strong>{card.value} €</strong>
			{#if card.meta}
				<span class="total-meta">{card.meta}</span>
			{/if}
		</div>
	{/each}
</div>

<style>
	.totals {
		display: grid;
		gap: 0.8rem;
		grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
		margin-bottom: 1.2rem;
	}

	.total-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		display: grid;
		gap: 0.2rem;
		padding: 0.9rem 1rem;
	}

	.total-card.negative strong {
		color: var(--color-danger);
	}

	.total-label {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.total-card strong {
		color: var(--color-accent-strong);
		font-size: 1.25rem;
	}

	.total-meta {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 300;
	}
</style>
