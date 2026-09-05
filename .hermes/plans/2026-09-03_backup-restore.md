# Backup & restore implementation plan

> **For Hermes:** Implement task-by-task with TDD and an independent correctness review before the PR.

**Goal:** Admin-only „Backup & Restore" panel on `/profil` (Phase 6 of the migration plan, Marktbude-style: download a full instance backup, upload one to restore).

**Scope decisions**
- Download: ZIP archive containing the SQLite database snapshot, the whole media root, and a `manifest.json` (SHA-256 per file + entry counts + schema version). Filename `passalong-backup-<UTC timestamp>.zip`.
- Restore: ZIP upload, validated (manifest present, checksums match, schema version compatible) into a **staging** copy, then atomically swapped in; sessions invalidated; maintenance behavior during activation. Invalid archives must not touch the running instance.
- Admin visibility: panel and actions are gated on `isInstanceAdmin`; non-admins get 404 on the action routes.

**Tasks**
1. RED: repository/service test — `createInstanceBackup(mediaRoot, databasePath)` returns a ZIP with `manifest.json` + `database.sqlite` + media entries; every entry's SHA-256 matches.
2. GREEN: `src/lib/server/backup.ts` — snapshot via SQLite backup API (better-sqlite3 `backup()`), media walk, manifest build, ZIP assembly (node built-in `zlib`/manual zip or `archiver` — prefer dependency-light manual store/deflate via `zlib`).
3. RED: restore test — upload a valid archive → DB + media replaced atomically; upload a corrupted/tampered archive → fail with 400 and the running instance unchanged.
4. GREEN: restore service (validate manifest + checksums, unpack to staging dir, `VACUUM INTO`-style swap or file move with backup-of-current, then swap media directory atomically).
5. Profile UI: admin-only panel with „Backup herunterladen" (GET download) and restore upload form; server actions guarded by Same-Origin + session + instance-admin role.
6. E2E: admin sees the panel, downloads a backup, restores it, data intact; non-admin does not see the panel.
7. Full verification + screenshots + independent review + PR.

**Verification gates:** `npm test`, `npm run check`, `npm run build`, `npm run test:e2e`, release-flow suite, compose config, diff check.