<!-- Feature requirements for the neutral QR route of the owner's own articles. -->

# F-007 — The printed label stays usable for its owner

Replaces: nothing
Implemented: PR #TBD

## Goal

The label an owner prints carries the neutral QR route of an article. Scanning it — with the phone
camera or from a photo — brings the owner back to that article while it is for sale, also when the
collection is not published yet: without this, a label printed at the stall leads nowhere until the
stand page is published. Visitors who are not that owner keep seeing either the reduced public view
or nothing at all, and a sold label keeps revealing nothing to anyone.

## Functional requirements

- FA-1: An authenticated owner who opens the neutral QR route of an unsold article of their own
  tenant is redirected to the internal article view, also when their collection is not published.
- FA-2: A sold identifier answers a data-free 404 to everyone, the owner included: a sold label
  reveals no detail, and the owner reaches a sold article through their own portfolio as before.
- FA-3: Every other visitor keeps the documented behaviour: a published and unsold article redirects
  to its reduced public stand view, and an unknown identifier answers a data-free 404.
- FA-4: The owner lookup only searches the session's own tenant, so a neutral route never reveals
  whether an identifier exists for somebody else.

## Non-functional requirements

- NFA-1: The decision stays in the neutral route alone; the public views and the repository
  functions that serve them are unchanged.
- NFA-2: Both sides are proven by E2E: the owner reads the label of an article of an unpublished
  collection back in through the photo fallback on a phone viewport and lands on the article, and the
  public stand proof keeps asserting that a sold or unknown identifier answers 404 to owner and
  buyer alike.

## Technical constraints

- The route resolves the session scope first and asks the repository for the owner's article; only
  when that fails does it ask for the buyer-visible route (published and unsold).
- No new endpoint and no change to the QR payload; the printed labels keep pointing at the same URL.

## Security level

before: 3 · after: 3

The change moves a lookup, it does not widen any scope: the owner lookup is bound to the session's
tenant, and the buyer path keeps requiring a published and unsold article.

## Out of scope

- Publishing an import automatically (F-004).
- A separate label for the owner (for example one that carries the internal route directly).
- Any change to the "no data for sold and unknown identifiers" rule for other visitors.
