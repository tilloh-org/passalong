<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * Shared shell for every dialog in the app.
	 *
	 * The shell owns the dialog chrome — surface, backdrop, header row, close control, and the
	 * internal spacing rhythm — so no screen re-declares it and the dialogs cannot drift apart.
	 * It is built on the native `<dialog>` element, so focus trapping, `Escape` and the top layer
	 * come from the browser instead of being reimplemented.
	 *
	 * Two variants exist because they do different jobs:
	 * - `modal` (default) presents a task or a decision. It dims the page with `--scrim`, which
	 *   keeps the page readable on purpose, and gives the content a card surface.
	 * - `fullscreen` presents content for its own sake, such as the photo viewer. It **hides**
	 *   the page with the much darker `--scrim-viewer` and paints no card, because anything else
	 *   on screen competes with the content. Its close control floats over the content, and a
	 *   caller that needs its own top bar (a counter, a title) passes `bar`.
	 *
	 * Spacing is token-driven: `--gap-dialog-head` between the header row and the body,
	 * `--gap-dialog-block` between body blocks, `--gap-dialog-field` between a field label and
	 * its control.
	 */

	/** The two jobs a dialog can do; see the component note above. */
	type DialogVariant = 'modal' | 'fullscreen';

	let {
		variant = 'modal',
		labelledBy,
		ariaLabel,
		closeLabel,
		showClose = true,
		class: className = '',
		testId,
		header,
		bar,
		onkeydown,
		onclose,
		children
	}: {
		/** Presentational variant; `modal` is the standard dialog. */
		variant?: DialogVariant;
		/** Id of the element that names the dialog, when a heading is present. */
		labelledBy?: string;
		/** Accessible name for dialogs without a visible heading. */
		ariaLabel?: string;
		/** Visible label of the close control; defaults to the translated „Schließen". */
		closeLabel?: string;
		/** Whether the shell renders its close control. */
		showClose?: boolean;
		/** Extra class on the dialog element, for screen-scoped layout only. */
		class?: string;
		/** `data-testid` of the dialog element, so E2E can target it. */
		testId?: string;
		/** Title content rendered inside the shell's header row, left of the close control. */
		header?: import('svelte').Snippet;
		/** Full-width bar above the body, for the full-screen viewer's own chrome. */
		bar?: import('svelte').Snippet;
		/** Called for key presses inside the dialog, e.g. arrow-key gallery stepping. */
		onkeydown?: (event: KeyboardEvent) => void;
		/** Called whenever the dialog closes, including via Escape or the close control. */
		onclose?: () => void;
		/** Dialog body. */
		children: import('svelte').Snippet;
	} = $props();

	let dialog = $state<HTMLDialogElement | null>(null);

	const resolvedCloseLabel = $derived(closeLabel ?? t('profile.close'));
	const hasHeaderRow = $derived(Boolean(header) || showClose);

	/**
	 * Open the dialog as a modal.
	 *
	 * @returns {void}
	 */
	export function open(): void {
		if (!dialog?.open) {
			dialog?.showModal();
		}
	}

	/**
	 * Close the dialog.
	 *
	 * @returns {void}
	 */
	export function close(): void {
		dialog?.close();
	}

	/**
	 * Report the open state, so callers avoid double-opening.
	 *
	 * @returns {boolean} Whether the dialog is currently open.
	 */
	export function isOpen(): boolean {
		return Boolean(dialog?.open);
	}

	/**
	 * Focus the first control inside the dialog body.
	 *
	 * @returns {void}
	 */
	export function focusFirstControl(): void {
		dialog
			?.querySelector<HTMLElement>(
				'.dialog-body input, .dialog-body select, .dialog-body textarea, .dialog-body button'
			)
			?.focus();
	}

	/**
	 * Focus a control by its test id, for dialogs that open on a specific field.
	 *
	 * @param {string} testIdValue - The `data-testid` of the control to focus.
	 * @returns {void}
	 */
	export function focusTestId(testIdValue: string): void {
		dialog?.querySelector<HTMLElement>(`[data-testid="${CSS.escape(testIdValue)}"]`)?.focus();
	}
</script>

<dialog
	bind:this={dialog}
	class="dialog-shell {variant} {className}"
	aria-labelledby={labelledBy}
	aria-label={ariaLabel}
	data-testid={testId}
	data-variant={variant}
	{onkeydown}
	onclose={() => onclose?.()}
>
	{#if bar}
		<div class="dialog-bar">
			{@render bar()}
		</div>
	{/if}

	{#if hasHeaderRow}
		<div class="dialog-head">
			{#if header}
				{@render header()}
			{/if}
			{#if showClose}
				<button
					type="button"
					class="dialog-close secondary"
					data-testid="dialog-close"
					onclick={() => dialog?.close()}
				>
					<Icon name="x" size="sm" />
					<span class="dialog-close-label">{resolvedCloseLabel}</span>
				</button>
			{/if}
		</div>
	{/if}

	<div class="dialog-body">
		{@render children()}
	</div>
</dialog>

<style>
	/*
	 * The chrome lives here and nowhere else. Colours come from theme tokens only: a hard-coded
	 * scrim is invisible in one of the two themes.
	 */
	.dialog-shell {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		color: var(--color-text);
		padding: 1.25rem;
	}

	.dialog-shell::backdrop {
		background: var(--scrim);
	}

	/* The header row and the blocks below it share one rhythm for every dialog. */
	.dialog-head {
		align-items: center;
		display: flex;
		gap: var(--gap-dialog-head);
		justify-content: space-between;
	}

	.dialog-head:not(:last-child) {
		margin-bottom: var(--gap-dialog-head);
	}

	.dialog-body {
		display: grid;
		gap: var(--gap-dialog-block);
		/*
		 * A grid stretches its children to the column width, which turned every action in a
		 * dialog into a full-width bar. Children keep their natural width by default; the few
		 * blocks that genuinely need the full width opt in below.
		 */
		justify-items: start;
	}

	/*
	 * Action rows: adjacent controls read as one row of options, never as stacked bars. The
	 * primary control keeps the rightmost slot, secondary controls sit to its left.
	 */
	.dialog-body :global(.dialog-actions) {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-action-row);
		justify-content: flex-end;
		width: 100%;
	}

	/* An action row that belongs to the flow of a sentence reads left-aligned. */
	.dialog-body :global(.dialog-actions.is-leading) {
		justify-content: flex-start;
	}

	/*
	 * Long-form content spans the dialog; only controls keep their natural width. `max-width`
	 * rather than `width` so a control that must stay compact (the shell's own close button)
	 * is not stretched.
	 */
	.dialog-body :global(input),
	.dialog-body :global(textarea),
	.dialog-body :global(select),
	.dialog-body :global(table),
	.dialog-body :global(form),
	.dialog-body :global(section),
	.dialog-body :global(p) {
		width: 100%;
	}

	/* A field label sits tightly above its control, everywhere. */
	.dialog-body :global(label) {
		display: grid;
		gap: var(--gap-dialog-field);
	}

	/*
	 * The shell must style its own close control: the project has no global button base style,
	 * so a bare <button> renders as the browser default (grey fill, outset border, no radius).
	 */
	.dialog-close {
		align-items: center;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		box-shadow: none;
		color: var(--color-accent);
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		gap: var(--gap-dialog-field);
		padding: 0.5rem 0.9rem;
		transition:
			background 0.2s ease,
			border-color 0.2s ease;
	}

	.dialog-close:hover {
		background: var(--color-accent-soft);
	}

	.dialog-close:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	/* The full-screen viewer hides the page instead of dimming it, and paints no card. */
	.dialog-shell.fullscreen {
		background: transparent;
		border: none;
		box-shadow: none;
		color: var(--viewer-control-fg);
		height: 100dvh;
		margin: 0;
		max-height: 100dvh;
		max-width: 100vw;
		padding: 0;
		width: 100vw;
	}

	.dialog-shell.fullscreen::backdrop {
		background: var(--scrim-viewer);
	}

	/*
	 * The viewer lays out its own full-bleed stage. It must not inherit the modal's
	 * shrink-to-content rule: a stage narrowed to its content pulls the absolutely positioned
	 * nav arrows off-screen (measured: stage width 17 px instead of 390 px, next arrow at -35).
	 */
	.dialog-shell.fullscreen .dialog-body {
		display: block;
		height: 100%;
		width: 100%;
	}

	.dialog-shell.fullscreen .dialog-head {
		position: absolute;
		right: max(0.5rem, env(safe-area-inset-right));
		top: max(0.5rem, env(safe-area-inset-top));
		z-index: 2;
	}

	/*
	 * A viewer label repeats nothing, so the glyph alone is enough on narrow screens where the
	 * bar already carries text.
	 */
	@media (max-width: 30rem) {
		.dialog-shell.fullscreen .dialog-close-label {
			display: none;
		}
	}

	.dialog-bar {
		align-items: center;
		background: var(--viewer-bar-bg);
		display: flex;
		gap: var(--gap-dialog-head);
		justify-content: space-between;
		padding: 0.75rem max(0.75rem, env(safe-area-inset-right)) 0.75rem
			max(0.75rem, env(safe-area-inset-left));
	}
</style>
