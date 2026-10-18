<!-- Feature requirements for the released stand location of a market day. -->

# F-005 — Released stand location of a market day

Replaces: nothing
Implemented: PR #78 (2026-10-18)

## Goal

A market day can carry the position of the stand. The owner takes it on site with one tap or
types it in, sees a map preview while editing, and decides per day whether buyers may see the
position. The public stand page then shows where the next released market day happens and lets
the visitor load a map — only on an explicit click, so no third-party request happens on page
load.

## Functional requirements

- FA-1: Every market day stores an optional position (`market_days.latitude`,
  `market_days.longitude`). A market day without a position behaves exactly as before.
- FA-2: The owner sets the position in the edit dialog without dealing with numbers: the button
  "Aktuelle Position" takes it from the device's location service, and the dialog shows the map of
  the position — or, while none is set, a short line saying so. The coordinates stay in the data;
  the two numeric fields are only a fallback behind "Position von Hand eintragen", so a position
  can still be entered away from the stand.
- FA-3: A release flag per market day (`market_days.location_released`) decides whether the
  position may appear publicly; it is off by default and only the owner of the day changes it.
- FA-4: A released position requires both coordinates inside the valid ranges (-90…90,
  -180…180). A release without usable coordinates is refused with the market-day input error and
  changes nothing.
- FA-5: The public stand page of a published collection shows the released position of the next
  released market day on or after today: place, day name, date, times. A day without a date never
  counts — the position of "someday" would invite buyers to a place nobody is at.
- FA-6: The buyer sees the map only after clicking "Karte laden". The section also links to
  OpenStreetMap; the link carries the position.
- FA-7: Market days belong to the owner, not to one collection: every published stand page of
  that owner shows the same next released position.
- FA-8: An unpublished collection shows no position (F-004 applies), and a released position is
  not shown once the day is in the past.

## Non-functional requirements

- NFA-1: No third-party request while a buyer only looks at the stand page: the map embed loads
  on the click, and the section states where the map comes from.
- NFA-2: The position is stored rounded to six decimals (about 11 cm) and never as free text.
- NFA-3: The "Aktuelle Position" button is the only thing that asks the browser for a position;
  every outcome (taken over, unsupported, failed) is reported next to the fields.
- NFA-4: Coordinates typed on a German keyboard (comma as decimal separator) are accepted in
  both the dialog and the server validation.

## Technical constraints

- The columns are additive via the existing migration mechanism
  (`2026101901_market_day_location`) plus the same columns in the fresh-install schema;
  `schema_migrations` records the version.
- Parsing, range checks and OpenStreetMap URLs live in `$lib/utils/market-day-geo.ts` so the
  browser preview and the server validation cannot drift apart.
- One shared column list (`MARKET_DAY_SELECT_COLUMNS`) serves every market-day read.
- The i18n copy is maintained in German and English only.

## Security level

before: 2 · after: 2

The position of the owner is personal data: it leaves the instance only as a marker URL the
buyer requests, and only for days the owner released. Unreleased days and unpublished
collections expose no coordinates at all.

## Out of scope

- Live tracking of the stand while a market day runs, or a moving position per sale.
- Route planning, opening hours, or a map of several stands at once.
- Storing a position without a market day (e.g. a fixed home address of the owner).
- Geocoding a typed address into coordinates.
