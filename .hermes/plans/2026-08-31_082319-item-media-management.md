# Item media management (image upload) implementation plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Let users upload photos for items, store them durably on the host filesystem, show a cover image per item, and add a visual release-process diagram to `docs/release-process.md`.

**Architecture:** Store media outside SQLite as content-addressed files under a persistent `data/media/` volume, with only relative `storage_key` metadata in the existing `item_images` table. Serve uploads through a tenant/owner-authorized, session-scoped route instead of static hosting. Validation happens server-side before persistence; uploads use multipart forms via a SvelteKit server action.

**Tech stack:** SvelteKit server actions (`+page.server.ts`), better-sqlite3, Node `fs/promises` + `node:crypto`, Vitest, Playwright, Docker Compose.

---

## Task 0: Release-process diagram (independent of media work)

**Objective:** Commit the requested image-based release-pipeline visual and reference it in `docs/release-process.md`.

**Files:**
- Create: `docs/release-process.png` (hand-built SVG → PNG render)
- Modify: `docs/release-process.md` (embed image under the “Release sequence” heading)

**Steps:**
1. Draft a dark-themed SVG showing the full cycle: feature/fix PR → squash into `develop` → release candidate (merge commit) → Release Please PR (merge commit) → tag + image → backmerge `main → develop` (merge commit). Annotate each arrow with its merge method (squash vs. merge commit) and add a legend.
2. Render the SVG to PNG (e.g. `rsvg-convert` or Chromium screenshot) and visually verify it against `vision_analyze`.
3. Commit as one docs commit on the media branch and reference via `![Release process](./release-process.png)`.

---

### Task 1: Media storage helpers with failing tests first

**Objective:** Save validated uploads to disk and read them back safely.

**Files:**
- Create: `src/lib/server/media-storage.ts`
- Create: `src/lib/server/media-storage.test.ts`

**Steps:**
1. Write failing tests: reject empty files, oversize files, unknown MIME types / mismatched magic bytes, non-image payloads; accept a small PNG and return a deterministic storage key.
2. Run targeted tests and verify failure (module missing).
3. Implement with `node:crypto` SHA-256 content hashing, `fs/promises` writes under the configured root, plus a constant set of allowed types and a literal-free `maximumImageBytes` policy value following the literal-policy convention.
4. Re-run targeted tests, then the full unit suite.

### Task 2: Repository methods for item images (TDD)

**Objective:** Tenant-scoped image metadata with cover handling.

**Files:**
- Modify: `src/lib/server/collection-repository.ts`
- Modify: `src/lib/server/collection-repository.test.ts`

**Steps:**
1. Failing tests: add image (first image auto-becomes cover), reorder/replace cover, list images per item, delete an image, and reject cross-tenant access.
2. Implement `addItemImage`, `setItemCover`, `deleteItemImage`, `listItemImages` inside the repository, each scoped by `scope.userId` / `scope.tenantId` and using immediate transactions for cover swaps.
3. Enforce the existing unique `(item_id, tenant_id, position)` constraint semantics and normalize position gaps.
4. Verify the legacy-schema fixture migration still passes; run the repository suite, `npm run check`, and `npm run build`.

### Task 3: Upload and serve routes (server actions)

**Objective:** Accept multipart uploads in the authenticated UI and serve images only to authorized viewers.

**Files:**
- Modify: `src/routes/+page.server.ts` (new upload / delete actions, plus a `?image=<key>`-style load-time serving path or a dedicated `src/routes/media/[key]/+server.ts`)
- Modify: `src/routes/+page.svelte` (upload form per item, cover preview, delete/cover buttons)
- Modify: `src/lib/server/page-actions.test.ts`

**Steps:**
1. Failing action tests: anonymous upload → 401; cross-tenant read → 404/403; oversized/invalid upload → 400 with user-facing German message; owner upload succeeds and persists only relative keys.
2. Implement `uploadItemImage` and `removeItemImage` actions (Same-Origin + session + owner checks), and the authorized image-serving route with `Cache-Control: private, no-store`, strict `Content-Type`, and hash-derived immutable filenames.
3. Update the item form (`enctype="multipart/form-data"`, `type="file"`, `accept="image/png,image/jpeg,image/webp"`) and the item card to render the cover image.
4. Run action tests, Svelte check, build, and the Playwright suite.

### Task 4: E2E coverage and Docker volume wiring

**Objective:** Prove the full upload → display → delete path in the browser, and persist media across containers.

**Files:**
- Modify: `e2e/core-collection.spec.ts`
- Modify: `Dockerfile` / `docker-compose.yml` (media volume, upload directory permission, healthcheck unchanged)
- Modify: `README.md` (media storage section)

**Steps:**
1. Add one compact E2E to the existing core flow: register → collection → item → upload a small generated PNG → assert cover thumbnail and hash-based filename appear → delete image → assert fallback letter tile returns.
2. Wire the host media directory into the compose volume, create it with the unprivileged UID in the Dockerfile build, and confirm media survives container recreation (local Docker test with sysbox).
3. Run the entire verification gate: audit, unit, check, build, E2E, release-flow suite, compose config, diff check.

### Task 5: Review, screenshots, documentation, PR

**Objective:** Land the slice with evidence and Tim's screenshot conventions.

**Steps:**
1. Independent read-only review focused on tenant isolation of media, path traversal (`storage_key` never used directly in filesystem paths), MIME sniffing, and upload DoS bounds.
2. Update `docs/screenshots/` with an item-card-with-cover screenshot and post it as a PR comment (raw link) per the screenshot convention.
3. Squash-merge conventions apply: single PR `feat/item-media` against `develop`, body with summary + testing checklist + screenshots comment.

## Risks and boundaries

- Media writes are the first filesystem writes outside SQLite: keep an explicit configurable root, refuse path traversal, and verify parent-directory creation is race-safe (`mkdir` with `recursive`).
- No image processing/resize library in this slice (`sharp` etc. deferred) — accept only validated PNG/JPEG/WebP and render scaled via CSS.
- Keep `item_images` schema additive and idempotent — the table already exists; no destructive migration.
- Upload size limit is a named policy constant, wired into tests, not a silent default.