# Item detail page implementation plan

> **For Hermes:** Implement task-by-task with TDD and an independent correctness review before the PR.

**Goal:** Give each item a detail page `/artikel/[id]` (Marktbude-style: `/artikel/<hash>`) that concentrates per-item management — photo upload/cover/delete, sale registration (full form incl. channel/date/proceeds), unmark sale — and links from the collection tiles. The collection cards keep their Marktbude look (category badge, status pill, quick-sell) but the tiles become clickable and the accordion placeholders disappear from them.

**Design decisions**
- Route `/artikel/[id]` requires authentication; owner/tenant-scoped access (404 otherwise), reusing `getItemForOwner` + a new `listItemImagesForOwner`.
- Page shows: large cover image (or letter tile), title, price, category/condition, internal notes; photo management (upload, set as cover via list, delete); sale section (mark sold with channel/date/proceeds, unmark); QR-free for now.
- Actions `?/uploadItemImage`, `?/removeItemImage`, `?/setItemCover`, `?/markItemSold`, `?/unmarkItemSold` move from the home page to the detail page route (they only ever operated on one item). The home page keeps `quickSellItem`.
- Collection tiles link to `/artikel/[id]`; the home load keeps serving cover metadata for the tiles.
- The photo/sale panels are removed from `+page.svelte` (home) — that markup and its actions migrate to the detail page.

**Tasks**
1. RED: repository test — `getItemForOwner` exists (done), plus `listItemImages` already exists; verify detail-page data assembly (item + images) is owner-scoped; unknown/foreign id → null/404.
2. RED: route test — `/artikel/[id]` renders item data for the owner, 404 for unknown id and foreign tenant; anonymous → 401/redirect to login.
3. GREEN: implement `src/routes/artikel/[id]/+page.server.ts` (load + migrated actions) and `+page.svelte`.
4. Home page cleanup: tiles become links to the detail page; remove image/sale panels from `+page.svelte`; `quickSellItem` stays on the home route.
5. E2E: core flow — tile click opens detail page, upload photo, set cover, delete photo, register sale with full form, unmark; statistics still update.
6. Full verification + screenshot + independent review + PR.

**Verification gates (same as previous slices):** `npm test`, `npm run check`, `npm run build`, `npm run test:e2e`, release-flow suite, compose config, diff check.