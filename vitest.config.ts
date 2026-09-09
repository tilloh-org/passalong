import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'$lib': fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	plugins: [
		svelte({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			}
		})
	],
	test: {
		include: ['src/**/*.test.ts'],
		exclude: ['e2e/**', 'node_modules/**'],
		setupFiles: ['src/test-setup.ts']
	}
});