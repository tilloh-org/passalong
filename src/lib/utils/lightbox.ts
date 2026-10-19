/**
 * Navigation arithmetic for the image lightbox.
 *
 * The lightbox is the one place where a gallery is browsed one image at a time, so its index rules
 * live here rather than in the component: wrapping, the single-image case and the empty case are
 * easy to get wrong and awkward to assert through the DOM.
 */

/** A minimal horizontal drag distance, in pixels, before it counts as a swipe. */
const swipeDistanceThreshold = 40;

/** How much larger the horizontal move must be than the vertical one to count as a swipe. */
const swipeHorizontalRatio = 2;

/**
 * Clamp an index into `[0, imageCount - 1]`.
 *
 * @param {number} index - The requested index.
 * @param {number} imageCount - How many images the gallery holds.
 * @returns {number} A valid index; `0` when the gallery is empty.
 */
export function clampIndex(index: number, imageCount: number): number {
	if (imageCount <= 0) {
		return 0;
	}
	return Math.min(Math.max(index, 0), imageCount - 1);
}

/**
 * The index reached by moving forward, wrapping past the last image.
 *
 * @param {number} index - The current index.
 * @param {number} imageCount - How many images the gallery holds.
 * @returns {number} The next index, or the current one when there is nothing to advance to.
 */
export function nextIndex(index: number, imageCount: number): number {
	if (imageCount <= 1) {
		return clampIndex(index, imageCount);
	}
	return (clampIndex(index, imageCount) + 1) % imageCount;
}

/**
 * The index reached by moving backward, wrapping before the first image.
 *
 * @param {number} index - The current index.
 * @param {number} imageCount - How many images the gallery holds.
 * @returns {number} The previous index, or the current one when there is nothing to go back to.
 */
export function previousIndex(index: number, imageCount: number): number {
	if (imageCount <= 1) {
		return clampIndex(index, imageCount);
	}
	return (clampIndex(index, imageCount) - 1 + imageCount) % imageCount;
}

/**
 * Classify a drag as a gallery swipe.
 *
 * A touch that moves only a little is a tap, and a gesture that is mostly vertical is the user
 * scrolling the page or the browser's own back gesture — neither should change the image.
 *
 * @param {number} deltaX - Horizontal drag distance in pixels; negative is to the left.
 * @param {number} deltaY - Vertical drag distance in pixels.
 * @returns {'next' | 'previous' | null} The swipe direction, or `null` when it is not a swipe.
 */
export function swipeDirection(deltaX: number, deltaY: number): 'next' | 'previous' | null {
	if (Math.abs(deltaX) < swipeDistanceThreshold) {
		return null;
	}
	if (Math.abs(deltaX) < Math.abs(deltaY) * swipeHorizontalRatio) {
		return null;
	}
	// Dragging the image to the left reveals what comes after it.
	return deltaX < 0 ? 'next' : 'previous';
}

/**
 * Order a stored image list for browsing and display.
 *
 * The cover leads and the rest keep their stored order. Every surface uses this one rule, so the
 * seller's "Image 2" label, the viewer's counter and the buyer's gallery all describe the same
 * sequence — the bug this replaces was a manage list sorted one way while the viewer numbered it
 * another.
 *
 * @template {{ isCover: boolean }} T - An image record.
 * @param {T[]} images - The stored images.
 * @returns {T[]} A new array with the cover first; the input is left untouched.
 */
export function orderImages<T extends { isCover: boolean }>(images: T[]): T[] {
	return [...images.filter((image) => image.isCover), ...images.filter((image) => !image.isCover)];
}
