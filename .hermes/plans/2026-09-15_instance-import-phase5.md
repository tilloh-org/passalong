# Generic instance import (Phase 5) — implementation plan

> **For Hermes:** Implement task-by-task with TDD and an independent correctness review before the PR.

**Goal:** Let the instance admin load a complete multi-user archive through the _generic import dialog_, which provisions exactly one isolated tenant per source user, maps all content (items, images, avatars, market days, sales, expenses, stand pages) onto new internal UUIDs, classifies password hashes, and activates the result atomically.

**Authoritative contract:** `/opt/data/marktbude-affine.md` — sections _Generischer Import, Export und Backup_ (l. 348–463), _Phase 5_ (l. 681–731), _Persönliche Cutover-Notiz_ (l. 1050–1094).

**Architecture:** New `$lib/server/instance-import.ts` owns the import pipeline: parse → validate → stage → activate. It reuses the existing ZIP reader/writer (`buildZip`, `parseZip`, `hasValidEndOfCentralDirectory`) from `$lib/server/backup.ts` and the repository's provisioning primitives. Nothing in the pipeline branches on a source product name (contract l. 382–384, 969).

**Tech stack:** SvelteKit 2 + TypeScript, better-sqlite3, existing manual store-method ZIP codec, vitest, Playwright.

---

## Why this plan first

`restoreInstanceBackup` is a _whole-instance replace_ for archives this product produced. It cannot accept a foreign archive, and by contract it must not (§Restore, l. 487–498). The cutover notes (l. 1059) route the data takeover through the **generic import dialog** instead. Phase 5 is missing entirely: the only importer today is `importAccountData` in `$lib/server/account-transfer.ts`, which is single-account, additive, format `passalong-account-transfer` v1, and has no tenant mapping, no admin selection and no staging.

---

## Contract deltas this plan must satisfy

- Archive: `manifest.json` + a versioned logical data file + original media + checksums (l. 354–360).
- Manifest: format name, format version, archive id, createdAt, producer id _without product-specific processing logic_, per-entity counts, media count and total size, checksum algorithm, path + checksum per file (l. 362–372).
- Version rules: format version separate from schema version; unknown **major** rejected; missing optional fields of older supported versions get documented defaults; required fields never silently invented; format migration runs **before** writing to live storage; every supported older version keeps permanent regression tests + fixtures (l. 374–384).
- Mapping: one source user → one new tenant; `(id, tenant_id)` composite safety; references via an internal import-mapping table, never usernames/filenames as keys; normalized-username collision blocks activation and is reported; the dialog lists all imported users and requires exactly one admin pick; public stand pages re-published automatically (l. 386–401).
- Password hashes: never plaintext; only strictly validated documented formats; unknown hash → account imported as `password_reset_required`; the selected admin must be able to log in immediately, so an incompatible admin hash gets a new password set **before** activation (l. 403–414).
- Validation (l. 418–448): archive structure + format version, path normalization, `../`/absolute-path/symlink defence, max archive/file/extracted size, ZIP-bomb defence, checksums, source-id uniqueness, required fields, global normalized-username uniqueness, exactly one selected admin, user→tenant assignment, all foreign keys, no cross-tenant relations, item→media assignment, market-day/sale/expense relations, money + date formats, allowed image formats, real image decodability, completeness of referenced media, public stand pages and their released fields, password-hash format per account, expected vs imported record counts. Errors block activation; warnings are all reported; **no partial activation**; a failed validation leaves live data untouched.
- Atomic activation (l. 450–463): import runs in maintenance mode; new writes blocked; archive unpacked into staging **on the same persistent volume**; staging DB fully built; all schema migrations run on staging; DB + media + relations validated in staging; only then the new generation is activated atomically; DB and media are one generation; failure before activation leaves the active generation unchanged; failure right after the switch must allow automatic rollback; temp files never serve as active data; the import report persists as a generic operational record.

---

## Findings on the three previously open points

1. **Maintenance mode does not exist yet.** `grep -rni 'maintenance|503|serviceUnavailable' src/` → no hits. The contract requires writes blocked during import/restore (l. 452), so this slice must introduce it. Proposed shape: a single-writer guard in the repository plus HTTP `503` with a generic i18n message, active only while an import/restore runs. This is the largest blast radius in the plan — it touches request paths globally, so it stays a separate task (Task 6a) rather than being folded into the swap logic.
2. **Source hash scheme is confirmed: werkzeug.** `flohmarkt/app/app.py` imports `from werkzeug.security import check_password_hash, generate_password_hash` and stores the result in `users.password_hash` (l. 206, 383). Werkzeug's default format is `method$salt$hash`, e.g. `pbkdf2:sha256:600000$<salt>$<hex>`. So the documented legacy format is a werkzeug `pbkdf2` string. **Design consequence:** verification of a foreign hash must not be reimplemented with a weaker or improvised KDF. Either the classification accepts the format and passalong verifies it with the documented parameters (strict bounds on iterations/salt/hash length), or the hash is classified `unsupported` and the account lands as `password_reset_required`. Given the cutover note step 12 ("Tim meldet sich als ausgewählter Instanz-Admin an") and step 7, the pragmatic and contract-compliant path is: **the selected admin's password is set explicitly before activation**, so the admin login never depends on a foreign KDF. The converter slice decides whether werkzeug hashes are translated or dropped.
3. **Admin re-authentication is missing for restore too.** `src/routes/admin/+page.server.ts` has no password confirmation, even though the contract requires it for download, restore _and_ import (l. 63, 479). Decision needed: add the confirmation to the import action now and retrofit `restoreBackup` in the same PR (consistent, contract-compliant), or keep this slice minimal and file the retrofit separately. Recommendation: same PR — the two actions sit side by side on one dialog, and shipping one guarded and one unguarded invites the inconsistency.

---

## Decisions taken (2026-09-15, Tim)

1. **No maintenance mode in this slice.** The import runs as an admin-only action; concurrent
   writers are accepted for now. This is a documented deviation from contract l. 452 ("Import und
   Restore laufen im Wartungsmodus"). Follow-up slice if it proves necessary.
2. **No generation swap.** The import writes into the live database inside a single transaction with
   rollback instead of building a separate staging generation. Simpler, no double storage; the
   staging/atomic-generation language of contract l. 450–462 is therefore not literally met.
   Consequences to keep explicit: no pre-import full backup is produced by this path, and a failure
   _inside_ the transaction rolls back cleanly while a crash _after_ commit has no automatic
   revert.
3. **Media are written during the transaction and cleaned up on rollback**; the database remains the
   single point of truth for whether an import counts as activated.

## Not a blocker: neither product has a publication flag

The contract asks for the "öffentlicher Standseitenstatus" (l. 1074) and automatic republishing
(l. 1076). Checked in both codebases:

- **Source (Marktbude):** `users` carries `stand_id` and `stand_text`, nothing else. `stand_id` is
  generated for every user, including pre-existing ones, and `/stand/<stand_id>` serves any stand
  whose id is known. There is no visibility switch in the UI or the schema — a stand is public
  exactly when its id is known.
- **Target (passalong):** `collections` has no publication column either, and `getPublicStandView`
  serves any collection whose id is known.

Both products therefore share the same model, so there is **nothing to import and nothing to
switch**: an imported collection is public by construction, which satisfies l. 1076 trivially. The
`isPublished` field stays in the exchange format so archives carry the information and no detail is
lost, but activation only reports it. A real visibility model (including what happens to already
printed QR codes pointing at a hidden stand) would be a new product feature, not an import detail.

---

## Tasks

### Task 1 — Define and document the exchange format

**Objective:** Fix the v1 wire format in one typed module so producer and consumer cannot drift.

**Files:**

- Create: `src/lib/server/exchange-format.ts`
- Create: `src/lib/server/exchange-format.test.ts`

**Step 1: RED** — assert `EXCHANGE_FORMAT_NAME`, `EXCHANGE_FORMAT_VERSION = 1`, `MANIFEST_ENTRY_NAME = 'manifest.json'`, `DATA_ENTRY_NAME`, the media prefix, and `CHECKSUM_ALGORITHM = 'sha256'`; assert the manifest type carries format/version/archiveId/createdAt/producerId/counts/mediaStats/files, and that a v2 major is reported unsupported while v1 parses.

**Step 2: verify RED** — `pnpm exec vitest run src/lib/server/exchange-format.test.ts` → fails, module missing.

**Step 3: GREEN** — implement the constants, the `ExchangeManifest` interface and `parseExchangeManifest(json)` returning a discriminated result (`{ ok: true, manifest }` / `{ ok: false, reason }`) that rejects unknown majors and applies documented defaults for optional fields.

**Step 4: verify GREEN** — same command passes; then `pnpm test` for regressions.

**Step 5: commit** — `feat: define the generic exchange format`

### Task 2 — Archive safety gate

**Objective:** Reject hostile archives before any parsing of content.

**Files:**

- Create: `src/lib/server/archive-safety.ts`
- Create: `src/lib/server/archive-safety.test.ts`

**Step 1: RED** — cases: entry name with `../` rejected; absolute path rejected; entry declaring a symlink rejected; archive over the max archive size rejected; single file over the max file size rejected; declared uncompressed total over the max extracted size rejected; compression ratio above the bomb threshold rejected; a clean archive accepted.

**Step 2: verify RED** — run the file, expect failures for missing module.

**Step 3: GREEN** — implement `assertArchiveWithinLimits(entries, options)` with named constants (no magic numbers) and explicit reasons.

**Step 4: verify GREEN** — pass, then full suite.

**Step 5: commit** — `feat: add the archive safety gate`

### Task 3 — Import validation report

**Objective:** Produce a complete error/warning report and a dry-run verdict.

**Files:**

- Modify: `src/lib/server/instance-import.ts` (create)
- Create: `src/lib/server/instance-import.test.ts`

**Step 1: RED** — for a fixture archive with two users: assert the report lists per-user entities, expected counts, media count + checksum agreement, public stand pages, password-hash status per account and rejected fields; assert a normalized-username collision yields an **error** that blocks activation; assert warnings never block.

**Step 2: verify RED** — fails.

**Step 3: GREEN** — implement `validateInstanceArchive(...)` returning `{ errors, warnings, counts, users, media, publicStandPages, hashStatus }`; no writes anywhere in this function.

**Step 4: verify GREEN** — pass + full suite.

**Step 5: commit** — `feat: add the import validation report`

### Task 4 — Staging build with tenant and id mapping

**Objective:** Build a complete staging generation from a validated archive.

**Files:**

- Modify: `src/lib/server/instance-import.ts`
- Modify: `src/lib/server/instance-import.test.ts`

**Step 1: RED** — for the two-user fixture: assert exactly one tenant per source user; assert every item/image/market-day/sale/expense/stand row lands under the matching `tenant_id`; assert references resolve through the mapping table and never through a username or filename; assert no row carries a cross-tenant reference; assert expected == imported counts.

**Step 2: verify RED** — fails.

**Step 3: GREEN** — implement `buildStagingGeneration(...)` writing into a staging directory on the same volume, running schema migrations on it, and recording the mapping in an import-mapping table.

**Step 4: verify GREEN** — pass + full suite.

**Step 5: commit** — `feat: build the staging generation with tenant mapping`

### Task 5 — Password hash classification

**Objective:** Accept documented hash formats and mark everything else for reset.

**Files:**

- Modify: `src/lib/server/password.ts` (add classification, keep existing behaviour)
- Create: `src/lib/server/password-classification.test.ts`

**Step 1: RED** — assert a native hash classifies as compatible and stays; assert a supported documented legacy hash classifies as compatible and is rehashed on first successful login; assert an unknown hash classifies as incompatible, the account is imported, and `password_reset_required` is set; assert parameters outside the allowed bounds are rejected (resource-abuse guard).

**Step 2: verify RED** — fails.

**Step 3: GREEN** — implement `classifyPasswordHash(stored)` returning `native | supported-legacy | unsupported` with strict parsing bounds.

**Step 4: verify GREEN** — pass + full suite.

**Step 5: commit** — `feat: classify imported password hashes`

### Task 6 — Atomic activation with rollback

**Objective:** Swap DB + media as one generation, with rollback on failure.

**Files:**

- Modify: `src/lib/server/instance-import.ts`
- Modify: `src/lib/server/instance-import.test.ts`

**Step 1: RED** — assert activation replaces DB and media together; assert a failure injected before the swap leaves the active generation byte-identical; assert a failure injected after the swap rolls back automatically; assert sessions and reset tokens are invalidated; assert exactly one valid instance admin remains; assert the import report row persists.

**Step 2: verify RED** — fails.

**Step 3: GREEN** — implement `activateStagingGeneration(...)` reusing the existing swap helpers approach from `backup.ts`, plus a pre-import full backup of the active generation.

**Step 4: verify GREEN** — pass + full suite.

**Step 5: commit** — `feat: activate the imported generation atomically`

### Task 7 — First-run import dialog and actions

The dialog lives on the first-run surface, **not** behind `/admin`: the takeover runs on an instance
that has no accounts, so there is no admin to sign in as (`/admin` redirects non-admins). This is the
"offene Übernahme einer leeren Instanz" the contract names in l. 938–948, guarded by the documented
operator warning.

**Implemented:** `stageInstanceImport` (same-origin, refuses when accounts exist, validates, stages
the archive on disk under a single-use token) and `activateInstanceImport` (consumes the token,
requires exactly one admin pick plus a valid new password, then imports). UI lists every user with
item/image/password status, shows the counts and checksum result, and keeps primary actions
bottom-right per `docs/DESIGN.md`.

**Files:**

- Modify: `src/routes/admin/+page.server.ts`
- Modify: `src/routes/admin/+page.svelte`
- Modify: `src/lib/i18n/index.svelte.ts` (de + en keys)
- Modify: `src/lib/server/page-actions.test.ts`

**Step 1: RED** — assert Same-Origin + session + instance-admin gating (non-admin → 404); assert an archive is rejected when zero or more than one admin is selected; assert an incompatible admin hash requires a new password before activation; assert the success response carries the report summary.

**Step 2: verify RED** — fails.

**Step 3: GREEN** — implement the upload action, the user list with admin selection, and the report rendering; keep icons `aria-hidden` and the existing disabled-until-ready pattern from `docs/DESIGN.md`.

**Step 4: verify GREEN** — pass + full suite.

**Step 5: commit** — `feat: add the instance import dialog`

### Task 8 — E2E, screenshots, docs and review

**Files:**

- Create: `e2e/instance-import.spec.ts`
- Modify: `docs/DESIGN.md` only if the dialog adds a new pattern
- Add: screenshots under `docs/feature-development/<branch>/`

**Step 1:** E2E — admin imports a multi-user fixture into an empty instance, both users can log in, one is admin, a pre-existing public stand page is public again, a corrupted archive changes nothing.
**Step 2:** Run the full gate chain (lint, check, unit, build, E2E, audit, release-flow).
**Step 3:** Capture light + dark screenshots of the dialog and the report, verify them visually.
**Step 4:** Independent review, then push to the open PR with the screenshots embedded in the PR description (never as a comment).

---

## Files likely to change

- New: `src/lib/server/exchange-format.ts`, `archive-safety.ts`, `instance-import.ts` (+ tests)
- Modified: `src/lib/server/password.ts`, `src/routes/admin/+page.server.ts`, `src/routes/admin/+page.svelte`, `src/lib/i18n/index.svelte.ts`, `src/lib/server/page-actions.test.ts`
- New: `e2e/instance-import.spec.ts`, screenshots
- Docs: `README.md` (exchange format is a public contract), `CHANGELOG` handled by release-please

## Risks and tradeoffs

- **Maintenance mode** is the largest unknown; it touches request guards globally. Confirm scope first (open question 1).
- **Legacy hash scheme** is unknowable from this repo alone; task 5 must not invent one (open question 2).
- **Staging on the same volume** requires the data volume to hold roughly one extra generation; document the space requirement.
- **Scope control:** the separate converter slice produces the archive that feeds this dialog. This plan delivers the _consumer_ and is testable on its own with a fixture produced by the format writer.

## Verification

`pnpm lint`, `pnpm check`, `pnpm test`, `pnpm build`, `CI=1 pnpm test:e2e`, `pnpm audit`, `python3 .github/scripts/tests/test_release_flow.py` (with `PATH=/opt/data` so `jq` resolves), plus the targeted import tests above.
