<!-- Template for feature requirements. Keys stay untranslated: F-<nr>, FA-<n>, NFA-<n>.
     A slice that changes behaviour is described here before it is implemented;
     the document is the contract for that slice and is frozen once its PR is
     merged (it gets the "Implemented" line). If it replaces behaviour of an
     earlier feature, "Replaces" names the affected FAs. -->

# F-002 — Statistics consistency and corrected sales

Replaces: nothing
Implemented: <!-- PR #<nr> (2026-10-17), filled in before review -->

## Goal

Close the phase-4 exit gates "statistics match the underlying sales and expenses" and "corrections
restore the previous state traceably" with evidence that holds at repository level and through the
UI, and fix the two defects the proofs surfaced.

## Functional requirements

- FA-1: The statistics totals equal the underlying rows: gross proceeds are the sum of the proceeds
  of all sold items, the sold count is their number, expenses are the sum of the expense amounts and
  the net is proceeds minus expenses — over the whole history and over a chosen period.
- FA-2: Every breakdown adds up to those same totals: the channel, month and category buckets sum to
  the totals, and each bucket holds exactly the sales of its channel, month or category.
- FA-3: The market-day breakdown covers every sale; sales without a market day form their own
  bucket, which the statistics page labels "Ohne Markttag".
- FA-4: A period counts sales by their sale date and expenses by their expense date, both bounds
  included, and shows the empty state when it holds neither.
- FA-5: Correcting a sale restores the item's state before the sale: the four sale fields
  (`saleChannel`, `soldAt`, `saleProceedsCents`, `marketDayId`) are cleared, every other field —
  including the reservation — stays as it was.
- FA-6: After a correction the sale is gone from every view that carried it: sale history,
  statistics (totals, breakdowns, day breakdown), market-day detail and settlement; the item is for
  sale again and back on the label sheet.
- FA-7: Items a list query returns report their reservation state — `reservedAt` is `null` or a
  timestamp, never `undefined`.

## Non-functional requirements

- NFA-1: FA-1 to FA-4 are proven at repository level as invariants over the seeded rows and at UI
  level as deltas, so rows the instance already held cannot make a proof pass.
- NFA-2: FA-5 to FA-7 are proven by repository tests plus an E2E walk through item detail, sale
  history and market-day detail.
- NFA-3: The proofs run on the dedicated sales instance (`sales-proofs`), whose account both sales
  proofs share, so their market days and expenses stay out of the shared instance.

## Technical constraints

- No schema change; the statistics stay derived from the item and expense rows.
- The statistics page keeps its test ids (`statistics-totals`, `statistics-card-<n>`,
  `statistics-channels`, `statistics-categories`, `statistics-market-days`, `statistics-empty`).

## Security level

before: 3 · after: 3

The slice adds no route and no field. Corrections stay owner-scoped and the proofs only read what
the owner may read.

## Out of scope

- A persisted correction log (who corrected what, when). The gate "corrections restore the previous
  state traceably" is read as "the previous state is restored and the change is followable in every
  view"; a log of its own would add a table and needs a product decision (see the roadmap's open
  product questions).
- The mobile proof of the flea-market flow and the scanner/fallback E2E gate stay with the slices
  that own them.
