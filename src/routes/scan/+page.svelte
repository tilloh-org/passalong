<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { resolveArticleDetailPath } from '$lib/utils/scan';

	interface BarcodeDetectorLike {
		detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
	}

	let videoElement = $state<HTMLVideoElement | null>(null);
	let mediaStream = $state<MediaStream | null>(null);
	let barcodeDetector = $state<BarcodeDetectorLike | null>(null);
	let cameraActive = $state(false);
	let scanStatus = $state('Drücke auf „Kamera starten“, um einen QR-Code zu scannen.');
	let scanError = $state<string | null>(null);
	let manualValue = $state('');
	let animationFrameId = $state<number | null>(null);

	/**
	 * Start the live camera scanner and begin reading QR codes.
	 *
	 * @returns {Promise<void>} Resolves once the scanner is ready or a readable error has been shown.
	 */
	async function startScanner(): Promise<void> {
		scanError = null;
		scanStatus = 'Die Kamera wird gestartet…';
		if (!navigator.mediaDevices?.getUserMedia) {
			scanStatus = 'Dein Browser unterstützt keinen Kamerazugriff. Nutze den direkten Link weiter unten.';
			return;
		}

		const detectorConstructor = (window as Window & {
			BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
		}).BarcodeDetector;

		if (!detectorConstructor) {
			scanStatus = 'Dein Browser unterstützt die QR-Erkennung nicht. Nutze den direkten Link weiter unten.';
			return;
		}

		await stopScanner();
		barcodeDetector = new detectorConstructor({ formats: ['qr_code'] });

		try {
			mediaStream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
				audio: false
			});
			if (!videoElement) {
				throw new Error('Kameraelement ist nicht verfügbar.');
			}
			videoElement.srcObject = mediaStream;
			await videoElement.play();
			cameraActive = true;
			scanStatus = 'Kamera aktiv — halte den QR-Code gut sichtbar ins Bild.';
			void scanLoop();
		} catch {
			await stopScanner();
			scanStatus = 'Die Kamera konnte nicht gestartet werden. Bitte erlaube den Zugriff oder nutze den direkten Link weiter unten.';
		}
	}

	/**
	 * Stop the live scanner and release the camera stream.
	 *
	 * @returns {Promise<void>} Resolves after the active stream has been stopped.
	 */
	async function stopScanner(): Promise<void> {
		cameraActive = false;
		barcodeDetector = null;
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		if (mediaStream) {
			for (const track of mediaStream.getTracks()) {
				track.stop();
			}
			mediaStream = null;
		}
		if (videoElement) {
			videoElement.pause();
			videoElement.srcObject = null;
		}
	}

	/**
	 * Run a detection frame and open the matching article detail page on success.
	 *
	 * @returns {Promise<void>} Resolves when the next scan frame is scheduled or navigation starts.
	 */
	async function scanLoop(): Promise<void> {
		if (!cameraActive || !barcodeDetector || !videoElement) {
			return;
		}

		try {
			const detections = await barcodeDetector.detect(videoElement);
			const rawValue = detections.find((detection) => detection.rawValue)?.rawValue?.trim();
			if (rawValue) {
				const targetPath = resolveArticleDetailPath(rawValue, window.location.origin);
				if (targetPath) {
					scanStatus = 'Artikel erkannt — öffne die Detailseite…';
					await stopScanner();
					await goto(targetPath);
					return;
				}
				scanError = 'Der erkannte QR-Code führt nicht zu einer Artikeldetailseite.';
			}
		} catch {
			// Ignore transient detector failures and try again on the next frame.
		}

		if (!cameraActive) {
			return;
		}

		animationFrameId = window.requestAnimationFrame(() => {
			void scanLoop();
		});
	}

	/**
	 * Open the article detail page from the manual input field.
	 *
	 * @returns {Promise<void>} Resolves after navigation is triggered.
	 */
	async function openManualTarget(): Promise<void> {
		const targetPath = resolveArticleDetailPath(manualValue, window.location.origin);
		if (!targetPath) {
			scanError = 'Bitte gib einen gültigen Artikellink oder eine Artikel-ID ein.';
			return;
		}
		scanError = null;
		await stopScanner();
		await goto(targetPath);
	}

	onMount(() => {
		return () => {
			void stopScanner();
		};
	});
</script>

<svelte:head>
	<title>Artikel scannen · passalong</title>
	<meta name="description" content="Scanne einen Artikellink oder QR-Code, um direkt zur Artikeldetailseite zu springen." />
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="scan-page">
	<section class="hero card">
		<div class="hero-copy">
			<p class="eyebrow">Nur für Verkäufer</p>
			<h1>Artikel scannen</h1>
			<p>
				Scanne den QR-Code am Artikelschild oder füge den Link ein, um sofort zur Artikeldetailseite zu springen.
			</p>
		</div>
		<div class="hero-actions">
			<button type="button" class="primary" onclick={() => void startScanner()}>
				Kamera starten
			</button>
			<button type="button" class="secondary" onclick={() => void stopScanner()} disabled={!cameraActive}>
				Kamera stoppen
			</button>
		</div>
	</section>

	<section class="scanner-grid">
		<article class="card camera-card" aria-labelledby="camera-title">
			<h2 id="camera-title">Kamera</h2>
			<div class:active={cameraActive} class="camera-shell">
				<video
					bind:this={videoElement}
					autoplay
					playsinline
					muted
					class:active={cameraActive}
					aria-label="Kameravorschau zum Scannen von QR-Codes"
				></video>
				{#if !cameraActive}
					<div class="camera-placeholder" aria-hidden="true">
						<span>QR</span>
					</div>
				{/if}
			</div>
			<p class="status" aria-live="polite">{scanStatus}</p>
			{#if scanError}
				<p class="error" role="alert">{scanError}</p>
			{/if}
			<p class="hint">
				Halte den QR-Code mittig im Bild. Der Scanner öffnet die Artikeldetailseite automatisch.
			</p>
		</article>

		<aside class="card manual-card" aria-labelledby="manual-title">
			<h2 id="manual-title">Direkt öffnen</h2>
			<p>
				Wenn die Kamera nicht verfügbar ist, kannst du den Artikel-Link oder die Artikel-ID auch direkt eingeben.
			</p>
			<label class="field">
				<span>Artikel-Link oder -ID</span>
				<input
					type="text"
					bind:value={manualValue}
					placeholder="https://…/items/123"
					autocomplete="off"
					autocapitalize="off"
					autocorrect="off"
					spellcheck="false"
				/>
			</label>
			<div class="manual-actions">
				<button type="button" class="primary" onclick={() => void openManualTarget()}>
					Artikel öffnen
				</button>
			</div>
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
		gap: 1rem;
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

	.hero p {
		color: var(--color-text-muted);
		line-height: 1.6;
		margin: 0.45rem 0 0;
	}

	.hero-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
		justify-content: flex-end;
	}

	button {
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

	button {
		cursor: pointer;
	}

	button:hover {
		filter: brightness(1.08);
		transform: translateY(-1px);
	}

	button:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	button.primary {
		background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
		border: 0;
		box-shadow: var(--shadow-cta);
		color: #fff;
	}

	button.secondary {
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
		gap: 1rem;
		grid-template-columns: minmax(0, 1.2fr) minmax(18rem, 0.8fr);
		margin-top: 1rem;
	}

	.camera-card,
	.manual-card {
		padding: 1.25rem;
	}

	.camera-card h2,
	.manual-card h2 {
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
	.hint,
	.manual-card p {
		color: var(--color-text-muted);
		line-height: 1.55;
		margin: 0.8rem 0 0;
	}

	.error {
		color: var(--color-danger);
		font-weight: 700;
		margin: 0.65rem 0 0;
	}

	.field {
		display: grid;
		gap: 0.35rem;
		margin-top: 0.9rem;
	}

	.field span {
		color: var(--color-text);
		font-size: 0.9rem;
		font-weight: 700;
	}

	.field input {
		background: var(--color-surface-strong);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-text);
		font: inherit;
		padding: 0.8rem 0.9rem;
	}

	.manual-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
		margin-top: 1rem;
	}

	@media (max-width: 880px) {
		.scanner-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
