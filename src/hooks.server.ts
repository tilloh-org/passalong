import { getCollectionRepository, getDatabasePath } from '$lib/server/repository';
import { readMaintenanceState } from '$lib/server/maintenance';
import type { Handle } from '@sveltejs/kit';

/**
 * Complete database migration before accepting application requests.
 *
 * Instantiating the repository runs the additive schema migrations, so the first request already
 * sees the current schema. Accounts are created through the application: the first browser
 * registration becomes the instance administrator.
 *
 * @returns {Promise<void>} A promise that resolves when startup initialization has completed.
 */
export async function init(): Promise<void> {
	getCollectionRepository();
}

const serviceUnavailableStatus = 503;
const retryAfterSeconds = 60;

/**
 * Keep the instance closed during a maintenance window — for example while a restore replaces the
 * database. Everything except the sign-in page, the instance administration and static files
 * answers with the maintenance page, so no request reads or writes a database that is being
 * swapped.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const maintenance = readMaintenanceState(getDatabasePath());
	if (maintenance && !staysReachableDuringMaintenance(event.url.pathname)) {
		return new Response(maintenancePage(event.request.headers.get('accept-language') ?? ''), {
			status: serviceUnavailableStatus,
			headers: {
				'cache-control': 'no-store',
				'content-type': 'text/html; charset=utf-8',
				'retry-after': String(retryAfterSeconds)
			}
		});
	}
	if (acceptsHtmlDocument(event.request)) {
		// Server-rendered pages carry an ETag but no cache policy, so a browser may serve a stale
		// page without revalidating — for example the sign-in page right after a registration.
		// These pages depend on the session and must not land in a shared cache.
		event.setHeaders({ 'cache-control': 'private, no-store' });
	}
	return resolve(event);
};

/**
 * Decide whether a request asks for a server-rendered document.
 *
 * Only those responses get the cache policy: bundled assets keep the immutable caching that
 * SvelteKit sets for them, and the JSON answers of form actions keep their own headers.
 *
 * @param {Request} request - The incoming request.
 * @returns {boolean} Whether the response will be an HTML document.
 */
function acceptsHtmlDocument(request: Request): boolean {
	return (request.headers.get('accept') ?? '').includes('text/html');
}

/**
 * Decide whether a path stays reachable while the instance is in maintenance.
 *
 * The sign-in page and the administration stay open so the instance administrator can sign in and
 * finish the restore; static files keep the sign-in page usable.
 *
 * @param {string} pathname - Requested path.
 * @returns {boolean} Whether the path is served during the maintenance window.
 */
function staysReachableDuringMaintenance(pathname: string): boolean {
	return (
		pathname === '/' ||
		pathname === '/admin' ||
		pathname.startsWith('/_app/') ||
		/\.[a-z0-9]+$/i.test(pathname)
	);
}

const maintenanceCopy = {
	de: {
		heading: 'Kurze Wartung',
		body: 'passalong richtet gerade eine Sicherung wieder her. Bitte versuche es in einer Minute noch einmal.',
		hint: 'Deine Daten bleiben dabei erhalten.'
	},
	en: {
		heading: 'Brief maintenance',
		body: 'passalong is restoring a backup right now. Please try again in a minute.',
		hint: 'Your data stays untouched.'
	}
} as const;

/**
 * Render the maintenance page in the language the visitor asked for.
 *
 * @param {string} acceptLanguage - The visitor's Accept-Language header.
 * @returns {string} The HTML page.
 */
function maintenancePage(acceptLanguage: string): string {
	const isEnglish = acceptLanguage.toLowerCase().startsWith('en');
	const copy = isEnglish ? maintenanceCopy.en : maintenanceCopy.de;
	return `<!doctype html>
<html lang="${isEnglish ? 'en' : 'de'}">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="robots" content="noindex" />
		<title>passalong</title>
		<style>
			:root {
				color-scheme: light dark;
				font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
			}
			body {
				align-items: center;
				background: #f6f7f9;
				color: #1d2430;
				display: flex;
				justify-content: center;
				margin: 0;
				min-height: 100vh;
			}
			main {
				background: #ffffff;
				border: 1px solid #dfe3e8;
				border-radius: 16px;
				box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
				max-width: 28rem;
				padding: 2rem;
				text-align: center;
			}
			h1 {
				font-size: 1.25rem;
				margin: 0 0 0.75rem;
			}
			p {
				line-height: 1.55;
				margin: 0 0 0.5rem;
			}
			.hint {
				color: #5b6675;
				font-size: 0.9rem;
			}
			@media (prefers-color-scheme: dark) {
				body {
					background: #14181d;
					color: #e7ebf0;
				}
				main {
					background: #1b2027;
					border-color: #2b323b;
					box-shadow: none;
				}
				.hint {
					color: #9aa7b6;
				}
			}
		</style>
	</head>
	<body>
		<main>
			<h1>${copy.heading}</h1>
			<p>${copy.body}</p>
			<p class="hint">${copy.hint}</p>
		</main>
	</body>
</html>`;
}
