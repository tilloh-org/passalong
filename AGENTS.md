# AGENTS.md — passalong

Project instructions for AI agents (Hermes, Codex, Claude Code, OpenCode, …).
Read this file first when working in this repository. It is the single entry
point; details live in the linked documents.

## Project

passalong is a self-hosted, open-source second-hand collection manager
(SvelteKit + TypeScript + SQLite, adapter-node, Docker Compose). German
visitor UI, English code. Target: v1.0.0 with full feature parity.

## Source of truth and priority

When instructions conflict, this order wins:

1. **AFFiNE "Hermes Gehirn"** — architecture, data model, security and
   release decisions (private knowledge base, read-only for agents).
2. **This repository's docs** — `docs/DESIGN.md` (UI rules), `docs/release-process.md`,
   `CONTRIBUTING.md`, `SECURITY.md`.
3. **Hermes skills** — project skills (`sveltekit-app-development`,
   `passalong-ui-patterns`, `test-code-conventions`, `ui-screenshot-pr-hygiene`).
4. **Memory / session history** — context only, never proof of current state.

`docs/DESIGN.md` wins over the Marktbude reference UI. Historical plans under
`.hermes/plans/` are **not normative** — they record decisions at a point in
time; current rules in the docs above win.

## Non-negotiable rules

- **No agent merges anything.** Tim merges PRs himself. Never merge to
  `main` or `develop`, never auto-merge, never close a PR as merged.
- **One open feature PR at a time.** Continue on the existing feature branch
  instead of opening a second PR. Release-candidate PRs are integration
  context, not parallel feature PRs.
- **Feature branches only, PRs against `develop`.** `main` is release-only.
- **Code, comments, tests, CSS classes, test IDs: English.** German only in
  user-facing UI copy.
- **No secrets in code, docs, PRs, or logs.** Never commit `.env` files.
- **A question from Tim is a discussion, not an order to change anything.**
  Only act after an explicit decision or implementation instruction.
- **Never weaken, skip, or delete tests to get a green run.** A missing or
  failing gate is a blocker, not a passed check.

## Development gates (before every commit and PR)

Run these locally; all must pass:

```bash
pnpm check        # svelte-check: 0 errors, 0 warnings
pnpm test         # vitest unit tests
pnpm build        # production build (vite + tsc)
```

E2E (Playwright) and the Python release-flow tests run in CI:

```bash
CI=1 pnpm test:e2e                       # Playwright smoke suite
python3 .github/scripts/tests/test_release_flow.py
```

CI also runs `pnpm audit` and Trivy container/filesystem scans. A green
`build` does **not** imply a green security scan — the scan is a separate
job. Do not claim "all gates green" unless every job passed.

## Test convention

Every test uses the phase markers, exactly lowercase:

- `// arrange` — fixtures, DB state, mocks, sessions (before the operation)
- `// act` — the operation under test
- `// assume` — the expectations, including expected errors

Python tests use `# arrange`, `# act`, `# assume`. Multi-step tests repeat
meaningful Act → Assume sections. Expected errors are captured during Act and
checked in Assume.

## UI changes

- Every visible UI change gets a committed screenshot under
  `docs/feature-development/<branch-slug>/`.
- Regenerate screenshots whenever the UI changes; the PR description must
  point at the **latest** screenshots for the **current** commit.
- Use **commit-pinned raw GitHub URLs**
  (`https://github.com/tilloh-org/passalong/raw/<sha>/<path>`) so images stay
  stable after squashes and merges. Remove stale image links.
- Primary/confirm actions sit at the bottom right of their container
  (see `docs/DESIGN.md`).

## When stuck or unsure

- Missing product decision → ask Tim, do not invent one.
- Conflicting instructions → apply the priority order above; if the conflict
  is real, report it instead of silently picking a side.
- Repeated failures → stop and report with evidence (commands, outputs,
  exit codes) instead of retrying blindly.
