<!-- Feature requirements for restoring a complete backup into an instance that has no accounts yet. -->

# F-009 — A backup comes back on a fresh instance

Replaces: nothing
Implemented: PR #82 (2026-10-18)

## Goal

A restore today starts on an instance that still has its administrator. The case that matters after a
lost volume or a broken deployment is the other one: a freshly deployed instance with no account at
all, and a backup in hand. This slice opens the restore on the first-run surface, so an operator can
bring a complete backup back without shell access, and proves the whole round trip on two fresh
instances.

## Functional requirements

- FA-1: As long as the instance has no account, the first-run surface offers "Backup einspielen"
  next to registration and the exchange takeover.
- FA-2: It accepts a complete instance backup written by this product; the archive is validated
  before anything is written, and the restore runs with the same maintenance window, session
  revocation, smoke test and rollback as the restore in the instance administration.
- FA-3: A successful restore leaves the instance serving the restored data: the restored accounts
  sign in with their own passwords, and their records are there.
- FA-4: A file that is not a valid backup is refused, the instance keeps its previous state, and the
  first-run surface stays reachable.
- FA-5: Once any account exists the first-run restore disappears; the restore then belongs to the
  instance administration only.
- FA-6: The upload is bounded by the same limit as the exchange takeover and is staged next to the
  database, so a refused or interrupted restore leaves no file behind.

## Non-functional requirements

- NFA-1: The round trip is proven end to end on two fresh instances: one registers an account and
  creates an article, downloads its complete backup, and a second instance with no account restores
  that backup and signs the account in.
- NFA-2: The proof runs in its own Playwright project with two servers of its own, so it never sees
  data of another proof.

## Technical constraints

- No schema change and no new route: the restore runs as an action of the first-run page and reuses
  the existing backup restore, the maintenance marker and the repository reload.
- The maintenance window opens before the swap and closes in every outcome, exactly as in the
  administration path.

## Security level

before: 3 · after: 3

The surface exists only while the instance has no account, it accepts nothing but a checksum-verified
backup of this product's own format, and it grants no account that is not part of that backup. That
is the same trust model the exchange takeover already uses on the first-run surface.

## Out of scope

- Restoring a backup of an older schema version (separate gate).
- A generation switch that swaps a whole instance directory.
- Any restore path while the instance already has accounts beyond the existing administration one.
