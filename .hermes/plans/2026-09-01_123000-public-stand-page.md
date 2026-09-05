# Public stand page implementation plan

> **For Hermes:** Implement task-by-task with TDD and an independent correctness review before the PR.

**Goal:** Give owners a shareable, read-only public page for one collection (`/stand/[collectionId]`) that shows its available items (photo, title, price, category, condition) without any internal data.

**Design decisions**
- Public route `/stand/[collectionId]` renders items of a collection **without authentication**.
- **Data minimization**: only items *not* marked sold are listed; no internal notes, no sold/proceeds fields, no owner identities beyond the collection name. Cover image only via the existing authorized media route check — for the stand page, images are served through the same `/media/[key]` route, which stays session-guarded; the stand page therefore shows the letter fallback tile if the viewer has no session (privacy-first: no leak of tenant images without authentication).
- Repository: `getPublicStandView(collectionId)` returning `{ collectionName, items: [{id, title, priceCents, category, condition}] }` or `null` for unknown IDs — read-only, no tenant scoping (it is public by design), but scoped to that single collection id.
- No caching headers beyond the default; no index-follow concerns for a self-hosted instance.

**Tasks**
1. RED: repository test — public view returns only unsold items of the requested collection with the reduced field set; unknown id → null.
2. GREEN: implement `getPublicStandView` in `collection-repository.ts`.
3. RED: route test — `/stand/[collectionId]` renders item titles/prices for anonymous visitors, excludes sold items and internal notes; unknown id → 404.
4. GREEN: implement `src/routes/stand/[collectionId]/+page.server.ts` and `+page.svelte` (dark, self-contained card grid, price via `formatPrice`).
5. E2E: anonymous visitor flow — create items via UI as owner, open stand link from the collection page ("Standseite" link/button), assert public view without internal notes and sold badge.
6. Full verification + screenshot + independent review + PR.

**Verification gates (same as previous slices):** `npm test`, `npm run check`, `npm run build`, `npm run test:e2e`, release-flow suite, compose config, diff check.