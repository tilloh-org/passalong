<!-- Template for feature requirements. Keys stay untranslated: F-<nr>, FA-<n>, NFA-<n>.
     A slice that changes behaviour is described here before it is implemented;
     the document is the contract for that slice and is frozen once its PR is
     merged (it gets the "Implemented" line). If it replaces behaviour of an
     earlier feature, "Replaces" names the affected FAs. -->

# F-003 — Restore in a maintenance window with an automatic smoke test

Replaces: nothing
Implemented: PR #76 (2026-10-17)

## Goal

A restore must not be visible half-done: while the database and the media are swapped the instance
serves nobody but the administration, the sessions of the backup lose their validity, and an
automatic smoke test decides whether the restored instance may go live at all.

## Functional requirements

- FA-1: While a maintenance window is open, every request answers with the maintenance page
  (status 503, `Retry-After`, language from `Accept-Language`). Reachable stay the sign-in page,
  the instance administration and static files.
- FA-2: The maintenance window is a marker next to the database, so it survives the swap of the
  database; an unreadable marker keeps the instance closed rather than open.
- FA-3: The restore action opens the window before the swap and closes it afterwards, in every
  outcome — a failed restore must not leave the instance closed.
- FA-4: Every session the backup still knows is revoked before the instance serves again; the
  administrator signs in again afterwards.
- FA-5: A restored instance passes the smoke test before it goes live: the database is readable and
  intact, the schema complete, at least one account can sign in, no session is active, and every
  media key of the restored database exists in the restored media folder.
- FA-6: A smoke test that fails puts the previous database and media back and removes the rejected
  artifacts; the instance keeps serving the previous data, and the administration sees which check
  failed.
- FA-7: A successful restore replaces the database file the running process had open, so the next
  request already serves the restored data.

## Non-functional requirements

- NFA-1: FA-1 to FA-3 have a repository proof (`maintenance.test.ts`) and are proven through the
  running server by an E2E test that opens and closes a window.
- NFA-2: FA-4 to FA-6 have a repository proof (`backup.test.ts`, including a rejected restore that
  leaves the previous instance untouched) and are proven end to end by a download/restore round
  trip on a dedicated instance.
- NFA-3: The E2E proof of the restore runs on its own instance (`restore-proofs`), because it
  replaces the database while the server runs; its account and paths live in
  `e2e/restore-instance.ts`.

## Technical constraints

- No schema change. The maintenance window and the restore work on the files next to the database.
- The smoke checks are reported as a name and a detail each, so the administration can show which
  check rejected a restore.

## Security level

before: 3 · after: 3

The slice adds no route and no field: the maintenance page is static, the restore stays with the
instance administration, and the revoked sessions close the window the backup would otherwise
reopen.

## Out of scope

- A versioned generation switch that swaps a whole instance directory at once; the slice keeps the
  file-by-file swap and covers it with the smoke test and the rollback.
- Migrating backups that are newer than the running code: the manifest check still rejects what it
  cannot read, and older backups are migrated forward when the restored database is opened.
