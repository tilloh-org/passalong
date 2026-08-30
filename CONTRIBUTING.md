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
- **i18n first** — the app is German- and English-native. User-facing strings
  are never hardcoded; they go through the message catalogs (paraglide).
- **Accessible** — keyboard-navigable, readable contrast, sensible labels.

## Code of conduct

By participating in this project you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Getting started

Prerequisites:

- Node.js 20+ (or Deno — see the README for the deployment matrix)
- pnpm or npm

```bash
# clone and install
git clone git@github.com:tilloh-org/passalong.git
cd passalong
pnpm install

# run the dev server
pnpm dev

# run tests and lint
pnpm test
pnpm lint
```

## Making changes

1. Create a feature branch from `develop`:
   ```bash
   git switch -c feat/your-change develop
   ```
2. Make your changes. Keep them focused — one logical change per PR.
3. Run the test suite and the linter locally before pushing.
4. Push the branch and open a pull request **against `develop`**.
   - `main` is release-only. PRs against `main` will be closed.

### Conventional commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add channel status to item overview
fix: resolve price formatting for non-EUR currencies
docs: explain the market-day mode in the README
```

This feeds the automatic versioning and changelog on `main`.

### Tests, linting, formatting

- Tests: `pnpm test`
- Lint: `pnpm lint`
- Formatting: `pnpm format`

All three must pass in CI before a merge.

## Branch model

- `develop` — integration branch. All PRs land here.
- `main` — release branch. Protected: only tagged releases are created from
  merges to `main` (see the release workflow).
- Feature branches: `feat/…`, `fix/…`, `docs/…`, `chore/…`.

## Releasing

Merging to `main` triggers a release. Versions follow [semver](https://semver.org).
The changelog is maintained via Conventional Commits — no manual changelog
edits needed.

## Reporting issues

- **Bugs:** use the bug report template. Include the version, browser, and
  reproduction steps.
- **Security issues:** do **not** open a public issue. See [SECURITY.md](SECURITY.md).
- **Feature requests:** use the feature request template.

## Questions

Ask in a GitHub Discussion. Please don't open issues for questions.
