# Design conventions

Binding visual/UX conventions for passalong UI work. Follow these in every PR that touches the
UI; deviations need an explicit decision (e.g. in the PR description).

## Buttons

- **Primary/confirm actions of a modal or form** (e.g. „Änderungen speichern", „Als verkauft
  erfassen", „Foto speichern") are rendered at the **bottom right** of their container/modal —
  never top-left or centered. This applies to every existing and future modal, panel, and card
  (e.g. the profile page cards). Within a shared action row, secondary controls sit to the left
  of the primary confirm button.
- **Design rules take precedence over the Marktbude reference.** The Marktbude UI is a migration
  source, not a style authority: where a Marktbude pattern conflicts with a passalong design rule,
  the rule wins and the migrated feature adapts to it.
- **Action-button spacing is token-driven.** Gaps between action buttons (and between the action
  row and adjacent content) use the shared spacing variables (`--gap-action-row`,
  `--gap-action-block`) instead of ad-hoc values, so spacing stays consistent everywhere.
- **Actions that depend on prior input render a disabled state** until the prerequisite is met
  (e.g. „Avatar speichern" until a file is chosen, „Einleitung speichern" until the text differs,
  „Restore ausführen" until a backup file is selected). Disabled buttons use reduced contrast,
  keep their position, and carry `disabled` + `aria-disabled`.
- The app-wide primary button style is a dark-teal gradient fill with white bold label.
- Destructive actions use the red danger tint (e.g. „🗑 Artikel löschen").
- Secondary/tinted action buttons in the item action row follow the Marktbude scheme:
  red = destructive, blue = edit/media, amber = reservation.

## Header

- The global header row is a single flex line: the brand sits on the left, the navigation and
  the action buttons (theme toggle, profile avatar) form **one group at the right edge**.
  A vertical divider (`--color-border`) separates the navigation from the action buttons,
  with balanced spacing on both sides of the divider.
- The navigation is only rendered inline when it fits; when it overflows it collapses into the
  right-side drawer behind the burger button, which then appears left of the theme toggle. The
  action buttons stay pinned to the right edge in both states.
- The drawer is an overlay: it slides in above the page, dims the background with the
  theme-aware scrim token (`--scrim`), and carries a soft shadow toward the content side
  (`--shadow-drawer`) so it reads as an elevated layer. The scrim, drawer, and shadow colors
  are theme tokens — never hard-coded — because a dark scrim on a dark page is invisible.
  The header action buttons (burger/close, theme toggle, profile) stay above the drawer
  (higher z-index) and remain clickable; the burger icon morphs into a close icon.
  Tapping the scrim or pressing Escape closes the drawer; keyboard focus moves into the
  drawer on open and back to the burger on close.
- Navigation buttons never run off the right edge of the viewport.

## Modals

- Native `<dialog>` elements with a dimmed backdrop.
- Every modal is built from the shared `$lib/components/dialog-shell.svelte`, which owns the
  chrome so no screen re-declares it. It offers two variants:
  - `variant="modal"` — the standard dialog: card surface, `--radius-card`, `--shadow-card`,
    `1.25rem` padding, and a top-right close button labelled „Schließen". This is the default.
  - `variant="fullscreen"` — the immersive viewer: no card surface, no padding, own scrim
    (`--scrim-viewer`) and its own bar. For a viewer that should **hide** the page rather than
    dim it (see the photo viewer).
- Every modal has a header row with a bold title on the left and a light „Schließen" button on
  the right; Escape and the close button dismiss it.
- **Internal spacing is token-driven.** The gaps inside a dialog use the shared variables
  (`--gap-dialog-head` between the header and the first block, `--gap-dialog-block` between
  blocks, `--gap-dialog-field` between a field label and its control) instead of per-screen
  values, so every dialog keeps the same rhythm.
- **Actions never span the full width.** A button or link keeps its natural width; only long-form
  content (inputs, selects, tables) spans the dialog. A full-width bar reads as a block, not as a
  control, and it competes with the dialog's real primary action.
- **Adjacent controls form one action row.** When a control is followed by another control, they
  render side by side in a single row — never stacked as separate full-width bars. The row wraps on
  a narrow dialog, and within it the primary control keeps the rightmost slot while secondary
  controls sit to its left (a leading control such as an export link sits first).
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

## Icons

- Icons come from the **vendored Tabler sprite**, mirroring the Marktbude approach: symbols are
  inlined once in `src/app.html` and referenced as `#i-<name>`. Never load an icon from a CDN,
  and never paste raw SVG paths into a component.
- The typed registry in `src/lib/icons.ts` is the contract; `scripts/build-icon-sprite.mjs`
  regenerates `src/app.html` from it. Adding an icon means adding it to the registry and
  re-running the script (`node scripts/build-icon-sprite.mjs`).
- Components render icons through `$lib/components/icon.svelte`, which is always `aria-hidden`.
  The surrounding control carries the accessible name, so an icon never becomes a second name
  for a button or link.
- Icons sit left of their label and inherit the label colour; semantic tone comes from the
  `.icon-ok` / `.icon-danger` / `.icon-warn` / `.icon-muted` modifiers.
- Navigation pills carry one leading icon each. The label must not repeat the icon's glyph as
  text (the “Neu” label carries no `+`, because the plus icon renders it).

## Code language

All code, comments, test titles, CSS class names, `data-testid` values, and identifiers are
written in **English**. German appears only in user-facing UI copy (labels, messages) — the
UI language for visitors is German by product decision.
