import { describe, expect, it } from 'vitest';
import { clampIndex, nextIndex, orderImages, previousIndex, swipeDirection } from './lightbox';

describe('lightbox navigation', () => {
	it('moves forward and wraps at the end', () => {
		// arrange
		const imageCount = 3;
		const currentIndex = 2;

		// act
		const next = nextIndex(currentIndex, imageCount);

		// assume
		expect(next).toBe(0);
	});

	it('moves backward and wraps at the start', () => {
		// arrange
		const imageCount = 3;
		const currentIndex = 0;

		// act
		const previous = previousIndex(currentIndex, imageCount);

		// assume
		expect(previous).toBe(2);
	});

	it('reports the same index for a single-image gallery', () => {
		// arrange
		const singleImageCount = 1;

		// act & assume — navigation must not leave the only valid index
		expect(nextIndex(0, singleImageCount)).toBe(0);
		expect(previousIndex(0, singleImageCount)).toBe(0);
	});

	it('treats an empty gallery as having no valid index', () => {
		// arrange
		const imageCount = 0;

		// act
		const clamped = clampIndex(4, imageCount);

		// assume
		expect(clamped).toBe(0);
	});

	it('clamps an out-of-range index into the gallery', () => {
		// arrange
		const imageCount = 3;

		// act & assume
		expect(clampIndex(-2, imageCount)).toBe(0);
		expect(clampIndex(7, imageCount)).toBe(2);
	});

	it('ignores a swipe that is mostly a scroll or a tap', () => {
		// arrange — a small horizontal move, and a mostly vertical move
		const tapDelta = { x: 12, y: 3 };
		const verticalScrollDelta = { x: 20, y: 140 };

		// act
		const tapDirection = swipeDirection(tapDelta.x, tapDelta.y);
		const scrollDirection = swipeDirection(verticalScrollDelta.x, verticalScrollDelta.y);

		// assume
		expect(tapDirection).toBeNull();
		expect(scrollDirection).toBeNull();
	});

	it('reads a deliberate horizontal swipe in both directions', () => {
		// arrange — a long drag, one to the left, one to the right
		const swipeLeft = { x: -80, y: 10 };
		const swipeRight = { x: 80, y: -8 };

		// act
		const left = swipeDirection(swipeLeft.x, swipeLeft.y);
		const right = swipeDirection(swipeRight.x, swipeRight.y);

		// assume
		expect(left).toBe('next');
		expect(right).toBe('previous');
	});
});

describe('gallery order', () => {
	it('puts the cover first and keeps the remaining photos in stored order', () => {
		// arrange
		const images = [
			{ id: 'a', position: 0, isCover: false },
			{ id: 'b', position: 1, isCover: true },
			{ id: 'c', position: 2, isCover: false }
		];

		// act
		const ordered = orderImages(images);

		// assume
		expect(ordered.map((image) => image.id)).toEqual(['b', 'a', 'c']);
	});

	it('does not mutate the stored list', () => {
		// arrange
		const images = [
			{ id: 'a', isCover: false },
			{ id: 'b', isCover: true }
		];

		// act
		const ordered = orderImages(images);

		// assume
		expect(images.map((image) => image.id)).toEqual(['a', 'b']);
		expect(ordered).not.toBe(images);
	});

	it('returns an empty gallery untouched', () => {
		// arrange
		const images: { id: string; isCover: boolean }[] = [];

		// act & assume
		expect(orderImages(images)).toEqual([]);
	});
});
