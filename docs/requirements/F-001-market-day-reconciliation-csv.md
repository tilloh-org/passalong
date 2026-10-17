# F-001 — Market-day reconciliation as CSV

Replaces: nothing
Implemented: <!-- PR #<nr>, filled in before review -->

## Goal

A seller downloads the reconciliation of one market day as a CSV file, so the
day's numbers can be checked or handed on outside the app. The original app
offers this download on its market-day page; this slice brings the same
capability to passalong.

## Functional requirements

- FA-1: The market-day detail page offers a download for a day that has at least
  one sale; a day without sales shows no download.
- FA-2: `GET /market-days/<id>/reconciliation.csv` answers with
  `text/csv; charset=utf-8` as an attachment named
  `abrechnung-<market-day-name>.csv`.
- FA-3: The file starts with the header `Zeit,Artikel,Preis (€)` followed by one
  row per sale of the day: the sale time as `DD.MM.YYYY HH:MM`, the item title and
  the proceeds with a decimal comma.
- FA-4: The sale rows are followed by `Summe` and, when the day carries expenses,
  by `Ausgaben` (negative) and `Netto`, taken from the day's settlement.
- FA-5: An unauthenticated request is redirected to the start page without any
  data; an unknown or foreign market-day id answers 404.

## Non-functional requirements

- NFA-1: An item title that starts with a formula character (`=`, `+`, `-`, `@`,
  tab, carriage return) is prefixed with `'` in the file, so a spreadsheet does
  not execute it. Amounts the app generates keep their numeric form.
- NFA-2: The totals equal the settlement the page shows — page and file never
  disagree, because both read the same settlement.
- NFA-3: The file follows the spreadsheet conventions of the original app: comma
  as decimal separator and RFC 4180 quoting.
- NFA-4: The file name is built from an ASCII-only slug of the day's name, so a
  day name cannot inject anything into the response header.

## Technical constraints

- SvelteKit GET endpoint at `src/routes/market-days/[id]/reconciliation.csv/+server.ts`;
  the CSV text is assembled by the pure module `src/lib/utils/market-day-csv.ts`
  and unit-tested next to it.
- The download reads the day through the owner-scoped repository
  (`getMarketDay`, `getMarketDaySettlement`, `listSoldItemsForMarketDay`).
- UI copy German, English available; identifiers, comments and tests English.

## Security level

Adds a read path for data the owner already sees — no new data class, no public
reachability, no change to login or user data.

before: 3 · after: 3

## Out of scope

- Exporting the whole collection, the statistics or the sales history.
- A byte-order mark for Excel, thousands separators, and date formats other than
  `DD.MM.YYYY HH:MM`.
- Deliberate deviation from the original app: the original writes its stand fee as
  a separate summary row. passalong records market-day expenses in general, so the
  file carries `Ausgaben` and `Netto` from the day's settlement instead of a
  fee-only line.
