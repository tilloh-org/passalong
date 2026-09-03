# Design conventions

Binding visual/UX conventions for passalong UI work. Follow these in every PR that touches the
UI; deviations need an explicit decision (e.g. in the PR description).

## Buttons

- **Primary/confirm actions of a modal or form** (e.g. „Änderungen speichern", „Als verkauft
  erfassen", „Foto speichern") are rendered at the **bottom right** of their container/modal —
  never top-left or centered. This applies to every existing and future modal and panel.
- The app-wide primary button style is a dark-teal gradient fill with white bold label.
- Destructive actions use the red danger tint (e.g. „🗑 Artikel löschen").
- Secondary/tinted action buttons in the item action row follow the Marktbude scheme:
  red = destructive, blue = edit/media, amber = reservation.

## Modals

- Native `<dialog>` elements with a dimmed backdrop.
- Every modal has a header row with a bold title on the left and a light „Schließen" button on
  the right; Escape and the close button dismiss it.
- Form fields inside modals share the page-wide field styling: rounded corners, light border,
  sans-serif inherited font, visible focus ring.

## Form fields

- All inputs, selects, and textareas share the same treatment (rounded, light border, inherited
  font); never ship browser-default styling.
- Monetary amounts are entered in **euro with decimal comma** (e.g. `12,50`); the database stores
  euro cents. Sale dates are captured automatically at submit time, never asked from the user.
- Checkbox groups pair the control inline with its label; semantic colors must match the
  corresponding pills elsewhere in the app (green = „Vollständig", blue = „Funktionsfähig").

## Marktbude reference

The visual language mirrors the old Marktbude UI (flohmarkt.tilloh.dev), analyzed read-only.
Item cards: category pill overlaid top-left on the image, status pill and quick-sale button in
the tile footer. Detail page: action row (delete/images/edit/reserve) right-aligned below the
sale panel.

## Code language

All code, comments, test titles, CSS class names, `data-testid` values, and identifiers are
written in **English**. German appears only in user-facing UI copy (labels, messages) — the
UI language for visitors is German by product decision.