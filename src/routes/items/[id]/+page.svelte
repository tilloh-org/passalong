<script lang="ts">
	import { formatPrice } from '$lib/utils/format';
	import { t } from '$lib/i18n/index.svelte';
	import ItemInfoBlock from '$lib/components/item-info-block.svelte';

	let { data, form } = $props();

	/**
	 * Translate a sale channel key in the active locale.
	 *
	 * @param {string} channel - A sale channel key such as `flea-market`.
	 * @returns {string} Human-readable channel label.
	 */
	const saleChannelLabel = (channel: string) => t(`channel.${channel}`);

	const saleChannelOptions = (['flea-market', 'online-marketplace', 'shop', 'private-sale', 'other'] as const).map((value) => ({
		value,
		label: saleChannelLabel(value)
	}));

	const coverImageKey = $derived(data.images.find((image) => image.isCover)?.storageKey ?? null);
	const qrCodeDataUrl = $derived(data.qrCodeDataUrl);

	let imagesDialog = $state<HTMLDialogElement | null>(null);
	let editDialog = $state<HTMLDialogElement | null>(null);
</script>

<svelte:head>
	<title>{data.item.title} · {t('item.titleSuffix')} · passalong</title>
</svelte:head>

<main class="detail">
	{#if form && 'csrfError' in form && form.csrfError}
		<p class="form-error" role="alert">{form.csrfError}</p>
	{/if}

	<section class="detail-card" aria-labelledby="item-title">
		<div class="media-column">
			{#if coverImageKey}
				<img class="cover" src={`/media/${encodeURIComponent(coverImageKey)}`} alt={data.item.title} />
			{:else}
				<div class="cover placeholder" aria-hidden="true">{data.item.title.slice(0, 1).toUpperCase()}</div>
			{/if}
		</div>

		<div class="info-column">
			<ItemInfoBlock item={data.item} variant="internal" />
			{#if data.item.soldAt}
				<p class="sold-badge" data-testid="item-sold-badge">
					{t('item.soldOnChannel', { channel: saleChannelLabel(data.item.saleChannel ?? 'other') })}{data.item.saleProceedsCents !== null ? ` ${t('item.soldWithProceeds', { proceeds: formatPrice(data.item.saleProceedsCents) })}` : ''}
				</p>
			{/if}

			<section class="panel" aria-labelledby="photos-title">
					<h2 id="photos-title">{t('item.photosTitle')}</h2>
					{#if data.images.length}
						<div class="cover-preview">
							{#if coverImageKey}
								<img
									class="cover-thumb"
									src={`/media/${encodeURIComponent(coverImageKey)}`}
									alt={t('item.coverAlt', { name: data.item.title })}
								/>
							{:else}
								<div class="cover-thumb placeholder" aria-hidden="true">{data.item.title.slice(0, 1).toUpperCase()}</div>
							{/if}
							<span class="cover-count" data-testid="item-image-count">{data.images.length === 1 ? t('item.photoCount', { count: data.images.length }) : t('item.photoCountPlural', { count: data.images.length })}</span>
						</div>
					{:else}
						<p class="empty">{t('item.noPhotos')}</p>
					{/if}
				</section>

				<dialog class="images-dialog" bind:this={imagesDialog} aria-label={t('item.photosDialogLabel')} data-testid="images-dialog">
					<div class="dialog-head">
						<h3>{t('item.managePhotos')}</h3>
						<button type="button" class="secondary" onclick={() => imagesDialog?.close()}>{t('profile.close')}</button>
					</div>
					<p class="dialog-hint">{t('item.setCoverHint')}</p>
					<form method="POST" action="?/uploadItemImage" enctype="multipart/form-data" class="dialog-upload">
						<input name="itemId" type="hidden" value={data.item.id} />
						<input
							name="image"
							id="item-image-file"
							type="file"
							accept="image/png,image/jpeg,image/webp"
							multiple
							data-testid="item-image-input"
							class="visually-hidden-input"
							required
						/>
						<label class="file-button" for="item-image-file">
							{t('item.choosePhoto')}
						</label>
						<button type="submit">{t('item.savePhoto')}</button>
						</form>
					{#if form?.uploadImageError}
						<p class="form-error" role="alert">{form.uploadImageError}</p>
					{/if}
					<ul class="image-list">
						{#each data.images as image (image.id)}
							<li class:image-selected={image.isCover}>
								<img
									class="thumb"
									src={`/media/${encodeURIComponent(image.storageKey)}`}
									alt={t('item.photoAlt', { name: data.item.title })}
									loading="lazy"
								/>
								<div class="image-actions">
									<span class="image-name" data-testid="item-image-key">
										{image.isCover ? t('item.coverImage') : t('item.imageNumber', { number: image.position + 1 })}
									</span>
									<div class="image-buttons">
										{#if !image.isCover}
											<form method="POST" action="?/setItemCover">
												<input name="itemId" type="hidden" value={data.item.id} />
												<input name="imageId" type="hidden" value={image.id} />
												<button type="submit" class="secondary" data-testid="set-item-cover">{t('item.setAsCover')}</button>
											</form>
										{/if}
										<form method="POST" action="?/removeItemImage">
											<input name="itemId" type="hidden" value={data.item.id} />
											<input name="imageId" type="hidden" value={image.id} />
											<button type="submit" class="danger" data-testid="remove-item-image">{t('item.remove')}</button>
										</form>
									</div>
								</div>
							</li>
						{/each}
					</ul>
				</dialog>

				<section class="panel" aria-labelledby="sale-title">
				<h2 id="sale-title">{t('item.saleTitle')}</h2>
				{#if data.item.soldAt}
					<p class="sold-summary">
						{t('item.soldSummary', { date: new Date(data.item.soldAt).toLocaleDateString(), channel: saleChannelLabel(data.item.saleChannel ?? 'other') })}
						{#if data.item.saleProceedsCents !== null}
							{t('item.proceedsPrefix', { proceeds: formatPrice(data.item.saleProceedsCents) })}
						{/if}
					</p>
					<form method="POST" action="?/unmarkItemSold">
						<input name="itemId" type="hidden" value={data.item.id} />
						<button type="submit" class="danger" data-testid="unmark-item-sold">{t('item.undoSale')}</button>
					</form>
				{:else}
					<form method="POST" action="?/markItemSold" data-testid="item-sale-section">
						<input name="itemId" type="hidden" value={data.item.id} />
						<div class="form-grid">
							<label>
								<span>{t('item.channel')}</span>
								<select name="channel" aria-label={t('item.channelLabel')}>
									{#each saleChannelOptions as channel}
										<option value={channel.value}>{channel.label}</option>
									{/each}
								</select>
							</label>
							<label>
								<span>{t('item.proceeds')}</span>
								<input
									name="proceedsEuros"
									type="text"
									inputmode="decimal"
									min="0"
									value={formatPrice(data.item.priceCents)}
									required
									data-testid="item-proceeds"
								/>
							</label>
						</div>
						{#if form?.saleStatusError}
							<p class="form-error" role="alert">{form.saleStatusError}</p>
						{/if}
						<button type="submit" data-testid="mark-item-sold">{t('item.markSold')}</button>
						</form>
						{/if}
						</section>
						</div>
						</section>

						<section class="actions-row" aria-label={t('item.actionsLabel')} data-testid="item-actions">
						<form method="POST" action="?/deleteItem" class="action-form">
						<input name="itemId" type="hidden" value={data.item.id} />
						<button type="submit" class="action-btn danger-btn" data-testid="delete-item">{t('item.deleteItem')}</button>
						</form>
						<button type="button" class="action-btn blue-btn" onclick={() => imagesDialog?.showModal()} data-testid="images-dialog-trigger">
						{t('item.imagesButton', { count: data.images.length })}
						</button>
						<button type="button" class="action-btn blue-btn" onclick={() => editDialog?.showModal()} data-testid="edit-dialog-trigger">
						{t('item.edit')}
						</button>
						<form method="POST" action="?/setItemReservation" class="action-form">
						<input name="itemId" type="hidden" value={data.item.id} />
						<button type="submit" class="action-btn amber-btn" data-testid="toggle-item-reservation">
						{data.item.reservedAt ? t('item.removeReservation') : t('item.reserve')}
						</button>
						</form>
						</section>

	<dialog class="edit-dialog" bind:this={editDialog} aria-label={t('item.editDialogLabel')} data-testid="edit-dialog">
		<div class="dialog-head">
			<h3>{t('item.editDialogTitle')}</h3>
			<button type="button" class="secondary" onclick={() => editDialog?.close()}>{t('profile.close')}</button>
		</div>
		<form method="POST" action="?/updateItem">
			<input name="itemId" type="hidden" value={data.item.id} />
			<div class="form-grid">
				<label>
					<span>{t('portfolio.itemTitle')}</span>
					<input name="title" type="text" value={data.item.title} required />
				</label>
				<label>
					<span>{t('portfolio.price')}</span>
					<input name="priceEuros" type="text" inputmode="decimal" value={formatPrice(data.item.priceCents)} required />
				</label>
				<label>
					<span>{t('portfolio.category')}</span>
					<select name="category" aria-label={t('portfolio.category')}>
						{#each data.categoryOptions as category}
							<option value={category} selected={category === data.item.category}>{t(`category.${category}`)}</option>
						{/each}
					</select>
				</label>
				<label>
					<span>{t('portfolio.condition')}</span>
					<select name="condition" aria-label={t('portfolio.condition')}>
						{#each data.conditionOptions as condition}
							<option value={condition} selected={condition === data.item.condition}>{t(`condition.${condition}`)}</option>
						{/each}
					</select>
				</label>
			</div>
			<label class="dialog-textarea">
				<span>{t('portfolio.externalDescription')}</span>
				<textarea name="externalDescription" rows="3">{data.item.externalDescription}</textarea>
			</label>
			<label class="dialog-textarea">
				<span>{t('portfolio.internalNotes')}</span>
				<textarea name="internalNotes" rows="3">{data.item.internalNotes}</textarea>
			</label>
			<div class="flag-checkboxes">
				<label class="checkbox">
					<input name="isComplete" type="checkbox" value="1" checked={data.item.isComplete} />
					<span>{t('portfolio.isComplete')}</span>
				</label>
				<label class="checkbox">
					<input name="isFunctional" type="checkbox" value="1" checked={data.item.isFunctional} />
					<span>{t('portfolio.isFunctional')}</span>
				</label>
			</div>
			{#if form?.updateItemError}
				<p class="form-error" role="alert">{form.updateItemError}</p>
			{/if}
			<button type="submit">{t('profile.saveChanges')}</button>
		</form>
	</dialog>

	<section class="qr-panel" aria-labelledby="qr-title" data-testid="item-qr-panel">
		<h2 id="qr-title">{t('item.qrTitle')} <span class="qr-hint">{t('item.qrHint')}</span></h2>
		<div class="qr-body">
			<img
				class="qr-image"
				src={qrCodeDataUrl}
				alt={t('item.qrAlt')}
				data-testid="item-qr-image"
			/>
			<a class="qr-download" href={qrCodeDataUrl} download="qr-{data.item.id}.png" data-testid="item-qr-download">
				{t('item.downloadQr')}
			</a>
		</div>
	</section>
</main>

<style>
	.detail {
		margin: 0 auto;
		max-width: 64rem;
		padding: 0 1.5rem 4rem;
	}

	.detail-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		display: grid;
		gap: 1.5rem;
		grid-template-columns: minmax(16rem, 0.9fr) minmax(0, 1.4fr);
		padding: 1.5rem;
	}

	.media-column .cover {
		aspect-ratio: 1;
		border-radius: var(--radius-card);
		display: block;
		object-fit: cover;
		width: 100%;
	}

	.media-column .cover.placeholder {
		align-items: center;
		background: linear-gradient(135deg, var(--color-surface-strong), var(--fog));
		color: var(--color-accent);
		display: flex;
		font-size: 4rem;
		font-weight: 800;
		justify-content: center;
	}

	.info-column {
		display: flex;
		flex-direction: column;
	}

	.cover-preview {
		align-items: center;
		display: flex;
		gap: 0.9rem;
	}

	.cover-thumb {
		border-radius: var(--radius-small);
		height: 4.5rem;
		object-fit: cover;
		width: 4.5rem;
	}

	.cover-thumb.placeholder {
		align-items: center;
		background: linear-gradient(135deg, var(--color-surface-strong), var(--fog));
		color: var(--color-accent);
		display: flex;
		font-size: 1.6rem;
		font-weight: 800;
		justify-content: center;
	}

	.cover-count {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		font-weight: 700;
	}

	.actions-row {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		justify-content: flex-end;
		margin: 1.25rem 0 2rem;
	}

	.action-form {
		display: contents;
	}

	.action-btn {
		border-radius: var(--radius-control);
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 700;
		padding: 0.55rem 1rem;
		transition:
			filter 0.2s ease,
			transform 0.2s ease;
	}

	.action-btn:hover {
		filter: brightness(1.12);
		transform: translateY(-1px);
	}

	.action-btn.danger-btn {
		background: var(--color-danger-soft, rgba(220, 60, 60, 0.12));
		border: 1px solid var(--color-danger);
		color: var(--color-danger);
	}

	.action-btn.blue-btn {
		background: var(--color-info-soft, rgba(56, 132, 255, 0.12));
		border: 1px solid var(--color-info-border, rgba(56, 132, 255, 0.5));
		color: var(--color-info, #3884ff);
	}

	.action-btn.amber-btn {
		background: var(--color-warn-soft, rgba(240, 179, 0, 0.12));
		border: 1px solid var(--color-warn-border, rgba(240, 179, 0, 0.5));
		color: var(--color-warn, #f0b300);
	}

	.edit-dialog {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		max-width: min(34rem, 92vw);
		padding: 1.25rem;
		width: 34rem;
	}

	.edit-dialog::backdrop {
		background: rgba(10, 20, 28, 0.6);
	}

	.dialog-textarea {
		margin-top: 0.85rem;
	}

	.edit-dialog .flag-checkboxes {
		display: flex;
		gap: 1.1rem;
		margin: 0.9rem 0;
	}

	label.checkbox {
		align-items: center;
		cursor: pointer;
		display: flex;
		flex-direction: row;
		gap: 0.5rem;
	}

	label.checkbox span {
		color: var(--color-text);
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
	}

	label.checkbox input[type='checkbox'] {
		accent-color: var(--color-accent);
		cursor: pointer;
		height: 1.05rem;
		width: 1.05rem;
	}

	label.checkbox:has(input[name='isComplete']:checked) span {
		color: var(--color-ok);
	}

	label.checkbox:has(input[name='isFunctional']:checked) span {
		color: var(--color-info, #3884ff);
	}

	label.checkbox:has(input[name='isComplete']:checked) input[type='checkbox'] {
		accent-color: var(--color-ok);
	}

	label.checkbox:has(input[name='isFunctional']:checked) input[type='checkbox'] {
		accent-color: var(--color-info, #3884ff);
	}

	.edit-dialog form {
		display: grid;
	}

	.edit-dialog form > button,
	.images-dialog .dialog-upload > button {
		justify-self: end;
		margin-top: 0.4rem;
	}

	.sold-badge {
		align-self: flex-start;
		background: var(--color-ok-soft);
		border: 1px solid var(--color-ok-border);
		border-radius: 999px;
		color: var(--color-ok);
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.03em;
		margin: 0.6rem 0 0;
		padding: 4px 10px;
	}

	.visually-hidden-input {
		height: 1px;
		opacity: 0;
		position: absolute;
		width: 1px;
	}

	.file-button {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-accent);
		cursor: pointer;
		display: inline-block;
		font-size: 0.9rem;
		font-weight: 700;
		justify-self: start;
		padding: 0.7rem 1.1rem;
		transition:
			background 0.2s ease,
			filter 0.2s ease;
	}

	.file-button:hover {
		background: var(--color-accent-soft);
	}

	.qr-panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		margin-top: 1.5rem;
		padding: 1.5rem;
	}

	.qr-panel h2 {
		font-size: 1.05rem;
		margin: 0 0 1rem;
	}

	.qr-hint {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		font-weight: 400;
	}

	.qr-body {
		align-items: center;
		display: grid;
		gap: 1rem;
		justify-items: center;
	}

	.qr-image {
		background: white;
		border-radius: var(--radius-small);
		padding: 0.5rem;
	}

	.qr-download {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border-radius: 999px;
		box-shadow: var(--shadow-btn);
		color: white;
		font-size: 0.9rem;
		font-weight: 700;
		padding: 0.6rem 1.2rem;
		text-decoration: none;
	}

	.qr-download:hover {
		filter: brightness(1.08);
	}

	.panel {
		border-top: 1px solid var(--color-border);
		margin-top: 1.25rem;
		padding-top: 1rem;
	}

	.panel h2 {
		font-size: 1.05rem;
		margin: 0 0 0.75rem;
	}

	.panel form {
		display: grid;
		gap: 0.85rem;
	}

	.images-dialog {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		max-width: min(48rem, 92vw);
		padding: 1.25rem;
	}

	.images-dialog::backdrop {
		background: rgba(10, 20, 28, 0.6);
	}

	.dialog-head {
		align-items: center;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	.dialog-head h3 {
		font-size: 1.05rem;
		margin: 0;
	}

	.dialog-hint {
		color: var(--color-text-muted);
		font-size: 0.82rem;
		margin: 0.35rem 0 0.9rem;
	}

	.image-list {
		display: grid;
		gap: 0.6rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.image-list li {
		align-items: center;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-small);
		display: flex;
		gap: 0.75rem;
		padding: 0.5rem;
	}

	.image-list li.image-selected {
		border-color: var(--color-accent);
		box-shadow: 0 0 0 2px var(--focus-ring);
	}

	.thumb {
		border-radius: var(--radius-small);
		height: 3.5rem;
		object-fit: cover;
		width: 3.5rem;
	}

	.image-actions {
		display: grid;
		flex: 1;
		gap: 0.3rem;
	}

	.image-name {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		word-break: break-all;
	}

	.image-buttons {
		display: flex;
		gap: 0.4rem;
	}

	.image-buttons form {
		display: contents;
	}

	button {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border: 0;
		border-radius: var(--radius-control);
		box-shadow: var(--shadow-btn);
		color: white;
		cursor: pointer;
		font: inherit;
		font-size: 0.95rem;
		font-weight: 700;
		justify-self: start;
		padding: 0.7rem 1.25rem;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease,
			filter 0.2s ease;
	}

	button:hover {
		box-shadow: var(--shadow-btn-hover);
		filter: brightness(1.08);
		transform: translateY(-2px);
	}

	button.secondary {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		box-shadow: none;
		color: var(--color-accent);
		font-size: 0.75rem;
		padding: 0.4rem 0.7rem;
	}

	button.secondary:hover {
		background: var(--color-accent-soft);
		transform: none;
	}

	button.danger {
		background: transparent;
		border: 1px solid var(--color-danger);
		box-shadow: none;
		color: var(--color-danger);
		font-size: 0.75rem;
		padding: 0.4rem 0.7rem;
	}

	button.danger:hover {
		background: var(--color-danger-soft);
		box-shadow: none;
		transform: none;
	}

	.form-error {
		background: var(--color-danger-soft);
		border: 1px solid var(--color-danger);
		border-radius: var(--radius-control);
		color: var(--color-text);
		margin: 0;
		padding: 0.65rem 0.8rem;
	}

	label {
		display: grid;
		gap: 0.3rem;
	}

	label span {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	input,
	select,
	textarea {
		background: var(--color-input);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-text);
		font: inherit;
		padding: 0.68rem 0.85rem;
	}

	input:focus,
	select:focus,
	textarea:focus {
		border-color: var(--color-ice);
		box-shadow: 0 0 0 4px var(--focus-ring);
		outline: none;
	}

	.form-grid {
		display: grid;
		gap: 1rem;
	}

	.sold-summary {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		margin: 0 0 0.75rem;
	}

	.empty {
		color: var(--color-text-muted);
		font-size: 0.9rem;
	}

	@media (max-width: 48rem) {
		.detail-card {
			grid-template-columns: 1fr;
		}
	}
</style>