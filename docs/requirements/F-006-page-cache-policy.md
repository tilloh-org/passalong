<!-- Feature requirements for the cache policy of server-rendered pages. -->

# F-006 — Cache policy of server-rendered pages

Replaces: nothing
Implemented: PR #79 (2026-10-18)

## Goal

Every page the instance renders for a visitor carries an explicit cache policy. A browser must not
show a stale page from its cache: after signing in, after saving a form or after a restore, the
visitor sees the current state without a manual reload.

## Functional requirements

- FA-1: Every server-rendered document answers with `cache-control: private, no-store`.
- FA-2: Responses that are not documents keep their own caching behaviour: bundled assets stay
  cacheable (SvelteKit's immutable caching), form-action answers and exports keep their headers.
- FA-3: The maintenance page keeps its own headers (`no-store`, `retry-after`), and the sign-in page
  stays reachable during a maintenance window with the same document policy as in normal operation.

## Non-functional requirements

- NFA-1: The policy is set once, for all pages, in the server hook — not per route, so a new route
  cannot forget it.
- NFA-2: The decision keys off the request (`accept: text/html`), not off a list of paths, so it
  cannot drift when routes change.
- NFA-3: No session-dependent page may be stored by a shared cache: the policy is `private`.

## Technical constraints

- The hook sets the header through the framework's header API (`event.setHeaders`) before resolving
  the request; the maintenance response is returned directly and keeps its own headers.
- No route touches its own caching headers; the export endpoint keeps `private, no-store` as before.

## Security level

before: 2 · after: 2

Pages hold session-scoped data; a browser cache that keeps serving them without revalidation can
show data of a previous session or a previous state of the same instance.

## Out of scope

- Caching strategy for the static assets (they keep the framework defaults).
- `ETag` handling: the pages keep the `ETag` the framework generates; the policy simply forbids
  reusing a stored copy without asking the server.
- Offline capability or a service worker.
