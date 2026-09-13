## Summary

What does this PR change and why? Target: `develop` — `main` is release-only.

## Testing

List the gates you ran locally and their results (all must pass):

- [ ] `pnpm check` — 0 errors, 0 warnings
- [ ] `pnpm test` — all unit tests pass
- [ ] `pnpm build` — production build succeeds
- [ ] `CI=1 pnpm test:e2e` — Playwright smoke suite passes (if UI/flow changed)
- [ ] `python3 .github/scripts/tests/test_release_flow.py` — release-flow tests pass (if release scripts changed)
- [ ] Manual test (describe what you did)

## Screenshots

For UI changes: show the current screenshots for **this commit**, commit-pinned
raw URLs, e.g.:

```
https://github.com/tilloh-org/passalong/raw/<sha>/docs/feature-development/<branch-slug>/<file>.png
```

Replace `<sha>` with the current commit SHA. Remove stale image links.

## Checklist

- [ ] I read the CONTRIBUTING guide
- [ ] My commits follow Conventional Commits
- [ ] Code, comments, tests, CSS classes and test IDs are English; German only in user-facing UI copy
- [ ] No secrets, tokens, or `.env` files committed
- [ ] UI change: screenshots are committed, refreshed for this commit, and the description above shows the latest ones
