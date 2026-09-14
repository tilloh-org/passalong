<script lang="ts">
	import { goto } from '$app/navigation';
	import jsQR from 'jsqr';
	import { onMount } from 'svelte';
	import { resolveArticleDetailPath } from '$lib/utils/scan';
	import { t } from '$lib/i18n/index.svelte';

	const cameraScanFramesPerSecond = 10;
	const cameraScanIntervalMs = 1_000 / cameraScanFramesPerSecond;

	let videoElement = $state<HTMLVideoElement | null>(null);
	let mediaStream = $state<MediaStream | null>(null);
	let cameraActive = $state(false);
	let cameraStarting = $state(false);
	let scanStatus = $state(t('scan.statusIdle'));
	let scanError = $state<string | null>(null);
	let fileScanning = $state(false);
	let scanTimerId = $state<number | null>(null);
	let scannerSession = 0;
	let scanInFlight = false;

	/**
	 * Stop every track in a media stream without depending on component state.
	 *
	 * @param {MediaStream} stream - The stream whose tracks should be released.
	 * @returns {void}
	 */
	function stopMediaStream(stream: MediaStream): void {
		for (const track of stream.getTracks()) {
			track.stop();
		}
	}

	/**
	 * Stop a running camera stream and release its device tracks.
	 *
	 * @param {boolean} [resetStatus=false] - Whether the idle status should be restored after stopping.
	 * @param {boolean} [preserveStarting=false] - Whether a new camera request already owns the starting state.
	 * @returns {Promise<void>} Resolves after the active camera stream has been released.
	 */
	async function stopScanner(resetStatus = false, preserveStarting = false): Promise<void> {
		scannerSession += 1;
		cameraActive = false;
		if (!preserveStarting) {
			cameraStarting = false;
		}
		scanInFlight = false;
		if (scanTimerId !== null) {
			clearTimeout(scanTimerId);
			scanTimerId = null;
		}
		if (mediaStream) {
			stopMediaStream(mediaStream);
			mediaStream = null;
		}
		if (videoElement) {
			videoElement.pause();
			videoElement.srcObject = null;
		}
		if (resetStatus) {
			scanError = null;
			scanStatus = t('scan.statusIdle');
		}
	}

	/**
	 * Open the resolved item route after a supported QR payload was decoded.
	 *
	 * @param {string} rawValue - The decoded QR payload.
	 * @returns {Promise<boolean>} Whether the payload resolved to a navigable item route.
	 */
	async function openDecodedItem(rawValue: string): Promise<boolean> {
		const targetPath = resolveArticleDetailPath(rawValue, window.location.origin);
		if (!targetPath) {
			scanError = t('scan.qrNotAnItem');
			return false;
		}

		scanError = null;
		scanStatus = t('scan.statusDetected');
		await stopScanner();
		await goto(targetPath);
		return true;
	}

	/**
	 * Decode a QR value from a canvas-compatible image source.
	 *
	 * @param {CanvasImageSource} source - The image or video frame to decode.
	 * @param {number} width - The decoded source width.
	 * @param {number} height - The decoded source height.
	 * @returns {string | null} The decoded QR payload, if present.
	 */
	function decodeQrFrame(source: CanvasImageSource, width: number, height: number): string | null {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) {
			return null;
		}

		context.drawImage(source, 0, 0, width, height);
		const result = jsQR(context.getImageData(0, 0, width, height).data, width, height, {
			inversionAttempts: 'dontInvert'
		});
		return result?.data ?? null;
	}

	/**
	 * Schedule the next live frame scan while the camera remains active.
	 *
	 * @returns {void}
	 */
	function scheduleScanFrame(): void {
		scanTimerId = window.setTimeout(() => {
			void scanLiveFrame();
		}, cameraScanIntervalMs);
	}

	/**
	 * Decode one camera frame and continue scanning until a valid item code is found.
	 *
	 * @returns {Promise<void>} Resolves after a frame has been handled or navigation begins.
	 */
	async function scanLiveFrame(): Promise<void> {
		if (!cameraActive || scanInFlight || !videoElement) {
			return;
		}

		if (videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
			scheduleScanFrame();
			return;
		}

		const decodedText = decodeQrFrame(
			videoElement,
			videoElement.videoWidth,
			videoElement.videoHeight
		);
		if (decodedText) {
			scanInFlight = true;
			const itemOpened = await openDecodedItem(decodedText);
			if (!itemOpened) {
				scanInFlight = false;
				if (cameraActive) {
					scheduleScanFrame();
				}
			}
			return;
		}

		if (cameraActive) {
			scheduleScanFrame();
		}
	}

	/**
	 * Start the live camera scanner with the outward-facing camera when available.
	 *
	 * @returns {Promise<void>} Resolves once the scanner is ready or an error is shown.
	 */
	async function startScanner(): Promise<void> {
		if (cameraActive || cameraStarting) {
			return;
		}

		cameraStarting = true;
		await stopScanner(false, true);
		const session = scannerSession;
		scanError = null;
		scanStatus = t('scan.statusStarting');

		try {
			if (!navigator.mediaDevices?.getUserMedia || !videoElement) {
				throw new Error('Camera access is not available.');
			}
			const requestedStream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: { facingMode: { ideal: 'environment' } }
			});
			if (session !== scannerSession || !videoElement) {
				stopMediaStream(requestedStream);
				return;
			}

			mediaStream = requestedStream;
			videoElement.srcObject = requestedStream;
			await videoElement.play();
			if (session !== scannerSession || !videoElement) {
				stopMediaStream(requestedStream);
				if (mediaStream === requestedStream) {
					mediaStream = null;
				}
				return;
			}

			cameraActive = true;
			scanStatus = t('scan.statusActive');
			scheduleScanFrame();
		} catch {
			if (session === scannerSession) {
				await stopScanner();
				scanStatus = t('scan.statusCameraFailed');
			}
		} finally {
			if (session === scannerSession) {
				cameraStarting = false;
			}
		}
	}

	/**
	 * Load an image file for the local QR decoder without uploading it anywhere.
	 *
	 * @param {File} file - The selected image file.
	 * @returns {Promise<HTMLImageElement>} The loaded browser image.
	 */
	function loadImageFile(file: File): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const imageUrl = URL.createObjectURL(file);
			const image = new Image();
			image.onload = () => {
				URL.revokeObjectURL(imageUrl);
				resolve(image);
			};
			image.onerror = () => {
				URL.revokeObjectURL(imageUrl);
				reject(new Error('The selected image could not be loaded.'));
			};
			image.src = imageUrl;
		});
	}

	/**
	 * Decode a selected QR image locally and open the matching item when found.
	 *
	 * @param {Event} event - The selected image input event.
	 * @returns {Promise<void>} Resolves after the selected file has been processed.
	 */
	async function scanSelectedFile(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.item(0);
		if (!file) {
			return;
		}

		scanError = null;
		fileScanning = true;
		scanStatus = t('scan.statusFileScanning');
		await stopScanner();

		try {
			const image = await loadImageFile(file);
			const decodedText = decodeQrFrame(image, image.naturalWidth, image.naturalHeight);
			if (!decodedText) {
				scanError = t('scan.statusFileFailed');
				scanStatus = t('scan.statusFileFailed');
				return;
			}
			const itemOpened = await openDecodedItem(decodedText);
			if (!itemOpened) {
				scanStatus = t('scan.statusIdle');
			}
		} catch {
			scanError = t('scan.statusFileFailed');
			scanStatus = t('scan.statusFileFailed');
		} finally {
			fileScanning = false;
			input.value = '';
		}
	}

	onMount(() => {
		return () => {
			void stopScanner();
		};
	});
</script>

<svelte:head>
	<title>{t('scan.title')} · passalong</title>
	<meta name="description" content={t('scan.metaDescription')} />
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="scan-page">
	<section class="hero card">
		<div class="hero-copy">
			<p class="eyebrow">{t('scan.eyebrow')}</p>
			<h1>{t('scan.title')}</h1>
			<p>{t('scan.heroIntro')}</p>
		</div>
		<div class="hero-actions">
			<button
				type="button"
				class="primary"
				onclick={() => void startScanner()}
				disabled={cameraActive || cameraStarting}
			>
				{t('scan.startCamera')}
			</button>
			<button
				type="button"
				class="secondary"
				onclick={() => void stopScanner(true)}
				disabled={!cameraActive && !cameraStarting}
			>
				{t('scan.stopCamera')}
			</button>
		</div>
	</section>

	<section class="scanner-grid">
		<article class="card camera-card" aria-labelledby="camera-title">
			<h2 id="camera-title">{t('scan.cameraTitle')}</h2>
			<div class:active={cameraActive} class="camera-shell">
				<video
					bind:this={videoElement}
					autoplay
					playsinline
					muted
					class:active={cameraActive}
					aria-label={t('scan.cameraPreviewLabel')}
				></video>
				{#if !cameraActive && !fileScanning}
					<div class="camera-placeholder" aria-hidden="true"><span>QR</span></div>
				{/if}
			</div>
			<p class="status" aria-live="polite">{scanStatus}</p>
			{#if scanError}
				<p class="error" role="alert">{scanError}</p>
			{/if}
			<p class="hint">{t('scan.cameraHint')}</p>
		</article>

		<aside class="card file-card" aria-labelledby="file-title">
			<h2 id="file-title">{t('scan.fileTitle')}</h2>
			<p>{t('scan.fileIntro')}</p>
			<label class="file-picker" for="scan-image-file">
				<span>{t('scan.fileInputLabel')}</span>
				<input
					id="scan-image-file"
					type="file"
					accept="image/*"
					capture="environment"
					disabled={fileScanning}
					onchange={(event) => void scanSelectedFile(event)}
				/>
			</label>
			<p class="hint">{t('scan.fileHint')}</p>
		</aside>
	</section>
</main>

<style>
	.scan-page {
		margin: 0 auto;
		max-width: 72rem;
		padding: 0 1.5rem 4rem;
	}

	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
	}

	.hero {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-action-block);
		justify-content: space-between;
		padding: 1.5rem;
	}

	.hero-copy {
		max-width: 40rem;
	}

	.eyebrow {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		margin: 0 0 0.35rem;
		text-transform: uppercase;
	}

	h1,
	h2 {
		color: var(--color-accent-strong);
		margin: 0;
	}

	h1 {
		font-size: clamp(1.8rem, 2.5vw, 2.5rem);
		letter-spacing: -0.03em;
	}

	.hero p,
	.file-card p {
		color: var(--color-text-muted);
		line-height: 1.6;
		margin: 0.45rem 0 0;
	}

	.hero-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-action-row);
		justify-content: flex-end;
	}

	button,
	.file-picker {
		align-items: center;
		border-radius: 999px;
		display: inline-flex;
		font: inherit;
		font-weight: 700;
		height: 42px;
		justify-content: center;
		padding: 0 1rem;
		text-decoration: none;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease,
			filter 0.2s ease;
	}

	button,
	.file-picker {
		cursor: pointer;
	}

	button:hover:not(:disabled),
	.file-picker:hover {
		filter: brightness(1.08);
		transform: translateY(-1px);
	}

	button:focus-visible,
	.file-picker:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	button.primary {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border: 0;
		box-shadow: var(--shadow-cta);
		color: #fff;
	}

	button.secondary,
	.file-picker {
		background: var(--color-surface-strong);
		border: 1px solid var(--color-border);
		color: var(--color-accent);
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
		transform: none;
	}

	.scanner-grid {
		display: grid;
		gap: var(--gap-action-block);
		grid-template-columns: minmax(0, 1.2fr) minmax(18rem, 0.8fr);
		margin-top: var(--gap-action-block);
	}

	.camera-card,
	.file-card {
		padding: 1.25rem;
	}

	.camera-card h2,
	.file-card h2 {
		font-size: 1.05rem;
		margin-bottom: 0.8rem;
	}

	.camera-shell {
		aspect-ratio: 4 / 3;
		background: linear-gradient(145deg, var(--color-surface-strong), var(--fog));
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		overflow: hidden;
		position: relative;
	}

	video {
		background: #0a1016;
		height: 100%;
		object-fit: cover;
		opacity: 0;
		width: 100%;
	}

	video.active {
		opacity: 1;
	}

	.camera-placeholder {
		align-items: center;
		bottom: 0;
		display: flex;
		justify-content: center;
		left: 0;
		position: absolute;
		right: 0;
		top: 0;
	}

	.camera-placeholder span {
		align-items: center;
		background: rgba(10, 16, 22, 0.68);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 999px;
		color: #fff;
		display: inline-flex;
		font-size: 1.9rem;
		font-weight: 800;
		height: 5rem;
		justify-content: center;
		width: 5rem;
	}

	.status,
	.hint {
		color: var(--color-text-muted);
		line-height: 1.55;
		margin: 0.8rem 0 0;
	}

	.error {
		color: var(--color-danger);
		font-weight: 700;
		margin: 0.65rem 0 0;
	}

	.file-picker {
		margin-top: var(--gap-action-block);
		position: relative;
	}

	.file-picker input {
		height: 1px;
		opacity: 0;
		position: absolute;
		width: 1px;
	}

	@media (max-width: 880px) {
		.scanner-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
