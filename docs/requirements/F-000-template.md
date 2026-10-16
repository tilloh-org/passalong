<!-- Template for feature requirements. Keys stay untranslated: F-<nr>, FA-<n>, NFA-<n>.
     A slice that changes behaviour is described here before it is implemented;
     the document is the contract for that slice and is frozen once its PR is
     merged (it gets the "Implemented" line). If it replaces behaviour of an
     earlier feature, "Replaces" names the affected FAs. -->

# F-<nr> — <feature name>

Replaces: <!-- F-<nr> FA-<n>, or: nothing -->
Implemented: <!-- PR #<nr> (<date>), filled in before review -->

## Goal
<!-- one or two sentences: what and why -->

## Functional requirements
<!-- numbered, each individually testable; the basis for E2E tests -->
- FA-1: …
- FA-2: …

## Non-functional requirements
<!-- properties: performance, accessibility, security, … -->
- NFA-1: …

## Technical constraints
<!-- fixed constraints: APIs, packages, techniques. Constraints, not properties. -->

## Security level
<!-- Does the slice change login, user data or public reachability? -->
before: <n> · after: <n>

## Out of scope
<!-- deliberately not part of this slice -->
