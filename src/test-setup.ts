/**
 * Vitest setup: provide a real storage implementation for DOM-environment
 * tests.
 *
 * Node's own `localStorage` global stays disabled without
 * `--localstorage-file`, and the `happy-dom` environment does not install
 * `window.localStorage` itself. Tests that exercise client-side storage
 * therefore get a spec-compliant `Storage` backed by happy-dom's
 * implementation, shared per test file like a real origin's storage.
 */
import { Window } from 'happy-dom';

if (typeof window !== 'undefined' && !window.localStorage) {
	const storageWindow = new Window({ url: 'https://passalong.test/' });
	Object.defineProperty(window, 'localStorage', {
		configurable: true,
		writable: true,
		value: storageWindow.localStorage
	});
}
