# Contributing to passalong

First off, thank you for considering contributing! passalong is an open-source
project for families and self-hosters, and every contribution — a bug report,
a typo fix, a feature, a PR — helps make it better.

This document explains how to get started. It is intentionally short: the
project values simplicity, so the contribution process is simple too.

## Project values

- **Simple and lightweight** — passalong stays free of heavy dependencies.
  When you add code, keep the dependency footprint small and justify it.
- **Close to web standards** — plain HTML, CSS and JavaScript where possible.
- **German UI, English everywhere else** — the visitor-facing UI copy is
  German and served by the i18n layer (`src/lib/i18n/`), switchable to
  English at runtime. Everything else in the repo is English: code,
  comments, tests, CSS classes, test IDs, **commit messages, PR titles,
  PR descriptions, issue texts and any other repo communication**.
- **Accessible** — keyboard-navigable, readable contrast, sensible labels.

## Code of conduct

By participating in this project you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Getting started

Prerequisites:

- Node.js 22 (CI and Docker use Node 22; the lockfile requires
  `^20.19.0 || >=22.12.0`)
- pnpm 11 (CI uses `pnpm/action-setup` with version 11)

```bash
# clone and install
git clone git@github.com:tilloh-org/passalong.git
cd passalong
pnpm install

# run the dev server
pnpm dev
```

## Making changes

1. Create a feature branch from `develop`:
   ```bash
   git switch -c feat/your-change develop
   ```
2. Make your changes. Keep them focused — one logical change per PR.
3. Run the required gates locally before pushing (see below).
4. If the change affects the UI, refresh the committed screenshots before
   opening or updating the PR.
5. Update the PR description so it always points at the latest screenshots
   for the current commit.
6. Push the branch and open a pull request **against `develop`**.
   - `main` is release-only. PRs against `main` will be closed.

### Branch and merge rules

- **Only one open feature PR at a time.** Continue on the existing feature
  branch instead of opening a second PR.
- **Tim merges PRs himself.** Agents never merge to `main` or `develop`,
  never auto-merge, and never close PRs as merged.
- Feature branches: `feat/…`, `fix/…`, `docs/…`, `chore/…`.

### Required gates

Run these locally before every commit and PR; all must pass:

```bash
pnpm check        # svelte-check: 0 errors, 0 warnings
pnpm test         # vitest unit tests
pnpm build        # production build (vite + tsc)
```

E2E and the Python release-flow tests run in CI:

```bash
CI=1 pnpm test:e2e
python3 .github/scripts/tests/test_release_flow.py
```

CI additionally runs `pnpm audit` and Trivy container/filesystem scans. A
green `build` does not imply a green security scan — the scan is a separate
job. Do not claim "all gates green" unless every CI job passed.

### Test convention

Every test uses the phase markers, exactly lowercase:

- `// arrange` — fixtures, DB state, mocks, sessions (before the operation)
- `// act` — the operation under test
- `// assume` — the expectations, including expected errors

Python tests use `# arrange`, `# act`, `# assume`. Multi-step tests repeat
meaningful Act → Assume sections. Expected errors are captured during Act
and checked in Assume.

### Screenshots for UI changes

- Every visible UI change gets a current screenshot committed under
  `docs/feature-development/<branch-slug>/`.
- When the UI changes again, regenerate the screenshot and replace the old
  one in the PR description.
- Use the latest screenshots only; do not leave stale image links in the PR
  body.
- Use **commit-pinned raw GitHub image URLs** in the PR description
  (`https://github.com/tilloh-org/passalong/raw/<sha>/<path>`) so the linked
  image stays stable after squashes and merges.

### Conventional commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add channel status to item overview
fix: resolve price formatting for non-EUR currencies
docs: explain the market-day mode in the README
```

This feeds the automatic versioning and changelog on `main`.

## Branch model

- `develop` — integration branch. All PRs land here.
- `main` — release branch. Protected: only tagged releases are created from
  merges to `main` (see `docs/release-process.md`).

## Releasing

Merging to `main` triggers a release. Versions follow [semver](https://semver.org).
The changelog is maintained via Conventional Commits — no manual changelog
edits needed. See `docs/release-process.md` for the full sequence.

## Reporting issues

- **Bugs:** use the bug report template. Include the version, browser, and
  reproduction steps.
- **Security issues:** do **not** open a public issue. See [SECURITY.md](SECURITY.md).
- **Feature requests:** use the feature request template.

## Questions

Ask in a GitHub Discussion. Please don't open issues for questions.
