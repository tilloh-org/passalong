<!-- Feature requirements for the publication status of a collection. -->

# F-004 — Publication status of a collection

Replaces: nothing
Implemented: <!-- PR #<nr> (<date>), filled in before review -->

## Goal

A collection owns a publication status. Buyers reach the public stand page only while the
owner has published it; the owner decides that state in one click and sees it in plain
language. An imported stand page starts in the state the archive carried, so a published
market stand is reachable right after the import without a second manual step.

## Functional requirements

- FA-1: Every collection has a publication status (`collections.is_published`). A collection
  created in this instance starts unpublished.
- FA-2: The public stand page, its items, the item route behind the neutral QR route and the
  public search resolve only for a published collection. For an unpublished collection they
  answer exactly like for an unknown handle: no view, no item, no route, no search hit.
- FA-3: The owner switches the publication status of the active collection from the profile
  ("Standseite veröffentlichen" / "Standseite offline nehmen"). The panel names the current
  state and what it means for buyers.
- FA-4: The header link to the public stand page exists only while the collection is
  published.
- FA-5: An imported collection carries the publication status of the archive
  (`collection.isPublished`); a published archive entry is reachable through the newly
  generated public handle immediately after the import.
- FA-6: Collections that existed before this status was introduced stay reachable under their
  public handle (the migration does not take a live stand page offline).

## Non-functional requirements

- NFA-1: The switch is one form post without JavaScript; the state change is visible on the
  page after the redirect.
- NFA-2: The publication status never leaks through an unauthenticated response: an
  unpublished collection is indistinguishable from a non-existent one.
- NFA-3: Only the owning user of the owning tenant changes the status; anonymous callers and
  foreign collections are refused (401 / 404) without touching the row.

## Technical constraints

- The status is an additive column via the existing migration mechanism
  (`2026101801_collection_publication_status`) plus the same column in the fresh-install
  schema; `schema_migrations` records it.
- The public queries of `CollectionRepository` enforce the status, not the route layer, so
  every public surface uses the same rule.
- The i18n copy is maintained in German and English only.

## Security level

before: 2 · after: 2

Turns "reachable by handle alone" into an explicit owner decision; unpublished collections
are hidden from every public surface, including the neutral QR route and item images.

## Out of scope

- A date, an actor or a history for the publication status (no publication log).
- Publication of single items; the status is per collection.
- The location release and the map on the stand page (own slice).
