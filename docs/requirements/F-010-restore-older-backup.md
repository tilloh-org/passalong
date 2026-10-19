<!-- Feature requirements for restoring a backup that was written by an older release. -->

# F-010 — An older backup becomes a current instance

Replaces: nothing
Implemented: PR #83 (2026-10-19)

## Goal

Until now a restore only worked when the backup already carried the current schema: the smoke test
queries columns that older releases did not have, so a valid backup of the previous release was
rejected after it had already been swapped in. This slice migrates the restored database with the
same migration path the application uses at startup, and refuses a backup that comes from a newer
release instead of silently downgrading it.

## Functional requirements

- FA-1: A complete backup written by an older supported release is restored successfully; the
  restored database carries the current schema before the session revocation and the smoke test read
  it.
- FA-2: The records of the backup survive the migration unchanged: accounts keep their password
  hashes (and can sign in), collections, items and images stay assigned to their owner, and the
  media of the backup is in place.
- FA-3: Columns that the older release did not have come back with their documented defaults, and
  the `schema_migrations` table lists every version up to the current one.
- FA-4: Sessions the backup carried are revoked after the migration, as in every restore.
- FA-5: A backup whose manifest names a schema version newer than this build is refused before the
  swap, with a plain reason, and the running instance stays unchanged.
- FA-6: A database that cannot be migrated is rejected and the previous instance is put back.

## Non-functional requirements

- NFA-1: The proof runs against a committed fixture (`fixtures/backup/legacy-schema-backup.zip`)
  that carries the schema of the release before the publication status and the market-day location.
- NFA-2: The fixture is regenerated only on an explicit command, never as a side effect of a test
  run.
- NFA-3: The gate is proven at repository level, where the migration happens; the user-facing restore
  path is proven by F-009 with a current backup and uses the same function.

## Technical constraints

- The restore reuses the application's migration path (`migrateDatabaseFile`), so a restored backup
  is brought forward exactly like a database that an older build left behind.
- The support floor is documented as "every schema version since the tenant foundation"; older
  archives without a `schemaVersion` are treated as older and migrated.
- No schema change, no new route, no new dependency.

## Security level

before: 3 · after: 3

The slice runs existing migrations on the restored copy before anyone serves from it, refuses newer
archives instead of dropping columns, and keeps the rollback for a failed migration.

## Out of scope

- Backups from before the tenant foundation; they are not a supported source.
- A generation switch that swaps a whole instance directory.
- Automatic upgrades of the running instance outside a restore.
