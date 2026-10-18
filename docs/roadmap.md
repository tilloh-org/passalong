# Roadmap to v1.0.0

passalong is built toward v1.0.0 with full feature parity to the original app
this project replaces. This file is the **working plan**: the phases, their exit
gates and the verified status.

It is derived from the private AFFiNE plan `passalong – v1.0.0-Umsetzungsplan`
(docId `7H6PKxQ2dH`, architecture discussion with Nico, August 2026). AFFiNE keeps
the architecture, data model, security and release decisions and the history of
the plan; this file is the plan of record for implementation work in the
repository. Every status line names the date it was last verified.

## How this plan is used

- A phase ends when its exit gates are **proven in this repository**: a test, an
  E2E spec or a documented check. A gate without a proof stays open, even when
  the code for it exists.
- Work proceeds slice by slice, with **one open feature PR at a time**
  (`AGENTS.md`). Release candidates (`develop -> main`) count as integration
  context, not as a second feature PR.
- A slice that changes behaviour is described in an **F-document** under
  `docs/requirements/` before it is implemented (template:
  `F-000-template.md`). The document is the contract for that slice, is frozen
  once its PR is merged and carries the `Implemented: PR #<nr>` line. The next
  free number is used when the slice starts — this roadmap does not reserve
  numbers.
- Exit gates of a phase are the completion criteria of that phase; gates of a
  slice are the `FA-<n>` of its F-document, and the E2E suite grows from them.
- Open product questions are listed at the end. They are Tim's decision and
  block the slices they belong to.

## Status

Verified 2026-09-28 against the code (`develop` at `b05eba9f`): 340 unit tests,
14 E2E specs, lint, typecheck 0/0, build, `pnpm audit` and the release-flow tests
green. Phases 0 to 2 are complete, phase 3 and 4 carry open gates, phases 5 to 7
are partly implemented but not proven.

## Phase 0 — Contracts and security invariants

### Scope

- fix the target data model
- separate tenant roles from instance roles
- define repository boundaries
- specify the generic exchange format
- specify the backup manifest
- define public DTOs
- fix money, time and id conventions
- document the supported password hash formats
- fix the migration and rollback mechanism

### Exit gates

- [x] data model and relationships are documented
- [x] every domain entity has a fixed tenant assignment
- [x] instance admin rights are listed explicitly
- [x] the exchange format has a schema and a sample archive
- [x] public DTOs contain no private fields
- [x] architecture tests for tenant isolation exist
- [x] no open decision would force a later data migration

### Status

- data model (`tenants`, `users`, `instance_roles`, `sessions`, `collections`,
  `items`, `item_images`, `schema_migrations`) is implemented; every table
  carries `tenant_id`.
- exchange format with `manifest.json` (`format`/`version`) and checksums is
  implemented in `account-transfer.ts`.

## Phase 1 — Multi-tenancy, user management, authentication

### Scope

- remove the global first-admin logic
- allow several isolated tenant accounts
- model the instance role separately
- **dropped:** atomic environment provisioning — there is no environment
  bootstrap any more
- user management by the instance admin on the admin page — implemented in
  PR #70 (merge `b05eba9f`): the instance admin creates accounts with username
  and display name; an account starts without a password; the server issues a
  one-time code (24 h) that is shown exactly once and redeemed on the existing
  login form (no second auth path). Every new user gets their own tenant — own
  data boundary, never a member of the admin's tenant. The account list shows
  username, display name, created, last sign-in and role; last sign-in comes
  from the newest session, there are no content counts — the admin sees no
  foreign data. Deletion runs through one service method for both paths and
  removes items, market days, expenses, collections and images. The instance
  admin cannot delete themselves. Self-deletion is two-step: step 1 warns and
  offers the user's own ZIP, step 2 carries the confirmation and deletes.
  Blocking/deactivating was dropped — deletion is the only path.
- first sign-in with zero accounts
- transaction-safe protection against parallel first registration
- login, sessions, password change and reset
- legacy hash verification with rehash-on-login
- brute-force and CSRF protection

### Exit gates

- [x] several accounts can sign in independently
- [x] each account sees only its own tenant
- [x] the instance admin sees no foreign data in normal views
- dropped: environment provisioning is atomic and create-only — no longer valid
  after the env bootstrap was removed (PR #69, merge `d24d358`)
- [x] the instance admin creates new users on the admin page (PR #70, merge
      `b05eba9f`)
- [x] new users get their own tenant and see no foreign data
- [x] the instance admin cannot delete themselves
- [x] the invitation uses the existing login/reset path (no second auth path)
- [x] two parallel first registrations produce exactly one first account
- [x] with zero accounts the first sign-in opens again
- [x] foreign ids return 404 throughout
- [x] compatible legacy hashes are replaced after login
- [x] incompatible hashes force a safe reset
- [x] sessions and CSRF protection are covered by integration tests

### Status

- environment bootstrap removed (verified 2026-09-28): `bootstrap.ts`,
  `bootstrap.test.ts` and `startup.ts` deleted, the repository methods
  `provisionBootstrapAccounts`/`getBootstrapAccount` including interfaces and
  helpers and `verifyPasswordSync` dropped, the references in `README.md`,
  `.env.example` and `docker-compose.yml` too; `PASSALONG_BOOTSTRAP` is gone
  (875 lines removed in 12 files, the 9 bootstrap tests and further tests
  dropped: 336 → 325 unit tests; PR #69, merge `d24d358`). Setup is now: empty
  instance → the first browser registration becomes the instance admin and the
  registration closes afterwards; further users are created by the instance
  admin. Migration still runs before the first request, because the repository
  applies it while instantiating.
- password policy with legacy scrypt support and rehash-on-login (`password.ts`,
  `password.test.ts`).
- brute-force protection via `login_attempts` (username + IP), CSRF protection
  via a same-origin check (`csrf.ts`).
- shared dialog component: dialogs run through `dialog-shell.svelte` with two
  variants (`modal`, `fullscreen`), three spacing tokens
  (`--gap-dialog-head`, `--gap-dialog-block`, `--gap-dialog-field`); three
  defects fixed on the way (three hard-coded backdrops, the wrong scrim on a
  normal dialog, a close button that rendered as a browser default). New rules
  in `docs/DESIGN.md`: action controls never span the full width, consecutive
  controls build one row. PR #70, merge `b05eba9f`.

## Phase 2 — Complete domain model and media

### Scope

- complete item fields
- edit, archive and delete
- portfolio, search and filters
- reservations
- several images, cover image, gallery and lightbox
- avatar and profile management
- media validation, EXIF normalisation and thumbnails
- tenant-bound assets
- categories and i18n message ids

### Exit gates

- [x] all item fields can be stored losslessly
- [x] all item operations are tenant-bound
- [x] media cannot be loaded or deleted across tenants
- [x] invalid, oversized and disguised files are rejected
- [x] EXIF orientation is correct after upload and import
- [x] originals and thumbnails survive a restart
- [x] delete operations leave no orphaned media
- [x] mobile gallery and lightbox are covered by an E2E test

### Status

- items with complete fields (category, condition, price in cents, sale status,
  reservation, internal notes, external description) implemented.
- several images per item (`item_images` with cover flag) and avatar
  upload/removal implemented.
- media validation in `media-storage.ts` (`media-storage.test.ts`); deletion
  also clears orphaned media (`profile/+page.server.ts`).
- search/filter in the portfolio and on the public stand page via
  `item-filter-form.svelte` (PR #51).
- EXIF normalisation on delivery is implemented after upload and import
  (PR #64; one call site `readImageForDelivery` in
  `src/routes/media/[key]/+server.ts`).
- originals and thumbnails survive a restart (PR #65; thumbnails under
  `<media>/.thumbs/`, recursive backup walk).
- gallery/lightbox implemented; the mobile gallery/lightbox is covered by E2E at
  390 px (PR #66, `e2e/public-stand.spec.ts`).

## Phase 3 — Public stand page and privacy

### Scope

- publication status
- non-guessable public identifiers
- public item list
- filters and favourites
- reserved and available items
- released location and map
- dedicated public repository and DTO layer

### Exit gates

- [x] private stand pages are not reachable
- [x] published stand pages show only released fields
- [x] internal ids and notes appear in no public response
- [x] public media is reachable only through published relations
- [x] tenant enumeration is not possible
- [x] imported public stand pages are published automatically (F-004, PR #77)
- [x] privacy E2E tests cover at least two tenants and the instance admin

### Status

- public stand page (`stand/[collectionId]`) reachable anonymously, unknown ids
  return 404 (`e2e/public-stand.spec.ts`).
- favourites (localStorage, per stand page, bottom bar with counter, dialog with
  stand branding) implemented (PR #51).
- public buyer detail page `/stand/<collectionId>/<itemId>` via
  `item-info-block.svelte` (PR #51).
- public media route: anonymous capability fallbacks for unsold item images and
  owner avatars, sold → 404 (PR #51).
- public search/filter (only title/external description, status open/reserved)
  (PR #51).
- open: location release and map (own slice, product decision taken 2026-10-18).
- publication status implemented (F-004, PR #77): a collection is published by its
  owner, imported collections carry the status of the archive, and every public
  surface resolves published collections only.
- open: the app's server-rendered pages carry an `ETag` but no `cache-control`, so a
  browser may serve a stale page without revalidating — found while capturing evidence
  (a registration fetch followed by a navigation to the same URL). A candidate for its
  own slice.

## Phase 4 — Flea-market, sales and statistics parity

### Scope

- market days
- times, place, notes and geolocation
- closing a market day
- QR codes
- camera and photo scanner
- capturing and correcting sales
- sales history
- expenses and stand fees
- daily reconciliation
- statistics by category, day and period
- CSV export
- price labels with 16 entries per A4

### Exit gates

- [ ] the complete flea-market flow works on mobile
- [x] a sale updates stock and evaluation consistently
- [x] duplicate scan or sale requests do not produce a double sale (two parallel
      requests for one item, E2E, verified 2026-10-17)
- [x] corrections restore the previous state traceably (the undo clears the four sale fields and
      leaves every other item field as it was; the sale leaves the history, the statistics, the
      market-day detail and the label sheet — unit and E2E proof, verified 2026-10-17; no separate
      correction log, see the open product questions)
- [x] money values stay exact without floating-point errors
- [x] statistics match the underlying sales and expenses (totals move by exactly the recorded sale
      and expense, every breakdown moves with them — repository invariants plus E2E deltas,
      verified 2026-10-17)
- [x] CSV export is tenant-bound and guarded against formula injection (owner-scoped
      endpoint plus unit and E2E proof, verified 2026-10-17)
- [x] the print layout is verified with 16 labels on A4 (real A4 PDF: sixteen labels
      are one page, the next label opens a second page, verified 2026-10-17)
- [ ] the camera and file fallback are covered by an E2E test

### Status

- QR code panel on the item detail page (printable) implemented.
- camera/QR scanner and link/id input via `/scannen` implemented (PR #46).
- sale capture (`saleStatus` action with channel, proceeds, timestamp) and sales
  statistics by channel/month implemented; money values in cents (`INTEGER`)
  throughout.
- market days implemented (`/market-days`, `/market-days/[id]`).
- closing a market day runs through `closeMarketDay`; undoing a sale runs
  through `undoSale` on the item detail page.
- expenses/stand fees implemented; the statistics page `/statistics` exists.
- price labels implemented under `/price-labels` with a 4×4 grid; the A4 print proof
  runs as E2E against its own instance and asserts the generated PDF (16 labels =
  one page, 17 = two pages) and the 194mm × 281mm print area (verified 2026-10-17).
- the market-day reconciliation is downloadable as CSV (`docs/requirements/F-001-market-day-reconciliation-csv.md`):
  the detail page links it for days with sales, the endpoint reads the day through the owner scope and
  neutralises titles that a spreadsheet would read as a formula (verified 2026-10-17).
- location release and the map are not implemented (no `latitude`/`longitude` fields).
- for duplicate scan/sale requests the repository serialises the write and rejects
  the second one (`item is already sold`); two parallel requests for one item are
  proven by E2E, so the exit gate is closed (verified 2026-10-17).
- the statistics are proven to match the underlying rows
  (`docs/requirements/F-002-statistics-consistency-and-corrections.md`): repository invariants show
  that the channel, month, category and day buckets sum to the totals, and the E2E proof shows that
  the totals and every breakdown move by exactly the recorded sale and expense and shrink again by
  exactly the corrected one (verified 2026-10-17). The period filters by sale date and expense date
  with both bounds included and shows the empty state for a period without activity.
- corrections are proven to restore the previous state: the undo puts the item back to what it was
  before the sale (including its reservation) and takes the sale out of the sale history, the
  statistics and the market-day detail, so the item is for sale and printed again
  (unit and E2E proof, verified 2026-10-17).
- two defects the proofs surfaced are fixed: the shared column list of the item queries missed
  `items.reserved_at`, so listed items reported `reservedAt: undefined` instead of `null` or a
  timestamp, and the day breakdown of the statistics dropped every sale without a market day even
  though the page carries a label for them ("Ohne Markttag").

## Phase 5 — Generic import and export

### Scope

- format parser
- version migrations
- staging database
- id mapping
- complete user and tenant assignment
- media takeover
- password hash classification
- selection of the instance admin
- automatic takeover of public stand pages
- validation and error report
- atomic activation

### Exit gates

- [ ] an archive with several users creates exactly one isolated tenant per user
- [ ] all items, images, market days, sales, expenses, profiles and stand pages
      are assigned
- [ ] record counts before and after the import match
- [ ] all media checksums match
- [ ] no cross-tenant relation exists
- [ ] exactly one imported user is selected as instance admin
- [ ] this user can sign in after the import
- [ ] compatible hashes work and are rehashed afterwards
- [ ] incompatible hashes are usable through reset only
- [x] public stand pages carry the imported publication status after activation
      (F-004, PR #77: import unit proof, the rest of the phase-5 gates stay open)
- [ ] an invalid archive does not change the live instance
- [ ] product strings and product code contain no source-product identifiers

### Status

- logical export/import as a ZIP with `manifest.json` (`format`/`version`,
  checksums) implemented (`account-transfer.ts`, `account-transfer.test.ts`);
  import is additive into the current account.
- user-to-tenant assignment implemented: in `src/lib/server/instance-import.ts`
  every imported user gets their own tenant inside the import loop
  (`const tenantId = randomUUID()`).
- admin selection implemented (`adminUsername`, `adminPasswordHash`).
- hash classification on import implemented (`classifyImportedPasswordHash`);
  only native scrypt hashes are taken over, other formats set a reset flag.
- id mapping implemented: items and images get new UUIDs, relations are resolved
  through `sourceId`.
- staging exists in `src/lib/server/import-staging.ts` but is deliberately
  in-process in memory; a restart discards the staging step.
- atomic activation implemented: one transaction can roll back on errors.
- media takeover implemented through `storeMedia` with new storage keys.
- the import writes the publication status of the archive onto the imported
  collection (F-004, PR #77): a published stand page is reachable through its
  newly generated handle right after activation, and it is still reported as
  `report.publicStandPages`.
- the phase-5 exit gates stay open as proof gates: record counts before/after
  import, media checksums, freedom from cross-tenant relations, sign-in/hash
  evidence, activation behaviour and a reference archive still have to be
  proven.

## Phase 6 — Backup and restore

### Scope

- consistent SQLite snapshot
- complete media capture
- manifest and checksums
- renewed admin authentication
- restore in maintenance mode
- pre-restore backup
- migration of older backups
- atomic generation switch
- session invalidation
- automatic smoke test

### Exit gates

- [ ] a complete backup can be restored on an empty test instance (the round trip runs on the
      instance the backup came from; a fresh instance is not part of the proof)
- [x] database, media and public stand pages are complete after restore (the round trip proves the
      database and the public stand end to end, the media check of the smoke test proves the media;
      verified 2026-10-17)
- [ ] a backup of an older supported version can be restored into the current one
- [x] a manipulated or incomplete backup is rejected before activation (a tampered archive is
      refused, and an archive without the media its database needs fails the smoke test and is
      rolled back — unit proof, verified 2026-10-17)
- [x] a simulated failure during restore leaves the previous instance usable (the failing smoke
      test puts the previous database and media back; unit proof, verified 2026-10-17)
- [x] all old sessions are invalid after restore (every session of the backup is revoked before the
      instance serves again — unit and end-to-end proof, verified 2026-10-17)
- [x] the instance admin can sign in after restore (end-to-end proof: the administrator is signed
      out by the restore and signs in again, verified 2026-10-17)
- [x] backup and restore are not reachable for normal users (the restore stays with the instance
      administration, and during a restore the instance answers everyone else with the maintenance
      page — end-to-end proof, verified 2026-10-17)

### Status

- backup download (SQLite snapshot + media + manifest) and restore UI for
  instance admins implemented (`backup.ts`, `backup.test.ts`); E2E covers the
  backup download.
- pre-restore backup implemented: `${livePath}.pre-restore` is created before
  the restore (`src/lib/server/backup.ts`).
- restore in a maintenance window, session invalidation after restore and the automatic smoke test
  after restore are implemented (`docs/requirements/F-003-restore-maintenance-and-smoke-test.md`):
  the restore action opens a marker next to the database, every request but sign-in, administration
  and static files answers with the maintenance page (503), the sessions of the backup are revoked,
  and the restored instance has to pass a smoke test (database intact, schema complete, an account
  for sign-in, no active session, every media key present) before it goes live — otherwise the
  previous database and media come back (verified 2026-10-17).
- a successful restore replaces the database the running process had open: the repository is closed
  and re-created, so the next request already serves the restored data (verified 2026-10-17).
- open: restoring a backup into a fresh instance, migrating a backup of an older schema, and a
  versioned generation switch that swaps a whole instance directory at once.

## Phase 7 — Release hardening and 1.0.0

### Scope

- complete regression
- security and privacy review
- performance check
- migration and restore chaos tests
- operations documentation
- format documentation
- release notes
- Docker and upgrade check

### Exit gates

- [ ] full product parity is proven with a feature matrix
- [x] audit is green
- [x] typecheck is green
- [x] unit tests are green
- [ ] integration tests are green
- [x] Playwright E2E is green
- [x] production build is green
- [x] Docker build is green
- [x] container scan is green
- [x] tenant isolation tests are green
- [x] public privacy tests are green
- [ ] import, backup and restore tests are green
- [ ] a complete generic reference archive was processed successfully
- [ ] a restore onto a newer schema version was executed successfully
- [x] all visible UI changes are documented with screenshots
- [ ] operator and upgrade documentation is complete
- [ ] release notes describe contracts, limits and known risks
- [ ] `develop` is fully reviewed and ready to release
- [ ] the release PR from `develop` to `main` is green
- [ ] Tim performs the merge himself
- [ ] after the release `main` is merged back into `develop`

### Status

- CI chain (`audit → test`/`e2e` in parallel `→ build → docker-scan`) is
  established; release automation (Release Please, backmerge `main` →
  `develop`) is set up.
- PR #61 (`chore: release develop to main`, `develop` → `main`) is open as the
  only release candidate and waits for the deliberate release moment.

## Order of work

Work happens in small, checkable slices; only one pull request is open at a
time. The list below is the order from the plan, with what is done marked.

- schema and repository groundwork — done
- unify the tenant context — done
- separate instance roles from tenant rights — done
- composite tenant relations and indices — done
- remove global first-admin uniqueness — done
- [x] remove `PASSALONG_BOOTSTRAP` (PR #69, merge `d24d358`)
- [x] user management by the instance admin (PR #70, merge `b05eba9f`)
- [x] shared dialog component (PR #70, merge `b05eba9f`)
- dropped: "bootstrap and provisioning", "structured environment configuration"
  and "atomic create-only provisioning" — replaced by the two items above
- first sign-in with zero accounts — done
- race-condition tests — done
- auth hardening — done
- session and CSRF protection — done
- brute-force protection — done
- hash format allowlist — done
- rehash-on-login — done
- reset path — done
- complete item schema — done
- missing fields — done
- status, reservation, editing and archiving — done
- money values in cents — done
- search and filters — done
- media pipeline — done
- asset schema — done
- safe image validation — done
- EXIF normalisation — done
- thumbnails — done
- multiple images, cover image and gallery — done
- avatar — done
- public layer — done
- public identifiers — done
- public DTOs — done
- stand page — done
- favourites — done
- **location release — open (next slice)**
- privacy tests — done
- flea-market domain — done
- market days — done
- sales — done
- expenses — done
- reconciliation and statistics — implemented, proofs closed (2026-10-17)
- QR, scan and print features — done
- QR tokens — done
- camera and photo fallback — done
- [x] idempotent sale capture — guard in the repository, two parallel requests for
      one item proven by E2E (2026-10-17)
- [x] price labels — implemented, printed to a real A4 PDF by the E2E proof (2026-10-17)
- exchange format first with fixtures — done
- schema — done
- manifest — done
- sample archives — open
- format migrations — open
- import validation — done
- complete import — implemented, proof gates open
- staging — implemented in memory only
- id mapping — done
- user-to-tenant assignment — done
- admin selection — done
- hash handling — done
- media and public stand pages — implemented, activation not verified
- atomic activation — done
- export, backup and restore — partly open
- logical export — done
- SQLite snapshot — done
- media manifest — done
- pre-restore backup — done
- generation switch — open
- restore of older versions — open
- release hardening — open
- complete feature matrix — open
- security review — open
- load and chaos tests — open
- documentation — open
- 1.0.0 release — open

## UI alignment with the original app

Verified 2026-09-17: the public stand pages' gaps against the original app are
closed with PR #51 (photos, avatar in the hero, search/filter, flag pills,
reserved badges, favourites with entry point, public buyer detail page).

Open follow-up work:

- [ ] navigation icons — once further pages become their own views (for example
      statistics as its own page, price labels), the navigation entries get icon
      SVGs in the original app's style (Tabler paths, `svg.icon` 16 px,
      `stroke currentColor`).
- [ ] standalone "new item" page (optional) — if passalong grows more form logic
      (for example photo upload while creating), the "+ New" CTA should become its
      own route.
- [x] lightbox/gallery view on the public detail page implemented (PR #66;
      thumbnails and click-to-zoom, mobile E2E check).

## Open product questions

- ~~Publication status of collections.~~ Decided 2026-10-18: imported stand pages are
  published directly. Implemented as F-004 (PR #77) — every collection owns a publication
  status that the owner switches, an imported collection carries the status of the archive,
  and a collection that existed before the status was introduced stays reachable.
- ~~Location release.~~ Decided 2026-10-18: the location release belongs in this release.
  `latitude`/`longitude` and the map on the stand page follow as their own slice (F-005).
- **A correction log.** Correcting a sale restores the previous state and is followable in every
  view, but nothing records who corrected what and when. Should later releases keep a log of
  corrections (which would need its own table), or is the restored state enough? F-002 leaves this
  out.
