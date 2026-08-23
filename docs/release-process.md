# Release process

Passalong uses `develop` for integration and `main` for released source. The two
long-lived branches require different merge methods to keep Git ancestry intact.

## Required repository settings

### `main`

- Require a pull request and one approval.
- Allow squash merges only.
- Require the `build` and `test` status checks.
- Require linear history.

### `develop`

- Require a pull request and one approval.
- Require the `build` status check. `build` depends on audit, unit tests and E2E
  tests, so those gates must pass first.
- Allow both squash and merge commits.
- Use squash for normal feature and fix pull requests.
- Use a merge commit only for `main -> develop` backmerge pull requests.

A squash backmerge is invalid: it copies the files but does not make `main` an
ancestor of `develop`, causing repeated conflicts in later release candidates.

## Required Actions secret

Create `RELEASE_PLEASE_TOKEN` with the dedicated release bot token. Release
Please must not use the built-in `GITHUB_TOKEN`, because pull requests created by
that token do not trigger the CI workflow.

The token needs repository contents and pull request write access. Store it only
as a GitHub Actions repository secret.

## Release sequence

1. Merge feature and fix pull requests into `develop` using squash.
2. The Develop pipeline validates the resulting commit, publishes
   `develop-<sha7>` and `develop`, and opens or updates the release candidate.
3. Merge the `develop -> main` release candidate using squash after CI and review.
4. Release Please opens or updates its version and changelog pull request.
5. Merge the Release Please pull request using squash after CI and review.
6. Release Please creates the tag, GitHub Release and release container image.
7. The Backmerge workflow opens `main -> develop` after the Release workflow.
8. Merge the backmerge pull request using a **merge commit**, never squash.
9. Confirm that `develop` is no longer behind `main` before promoting more work.

## Recovery check

After a backmerge, this command must succeed:

```bash
git fetch origin
git merge-base --is-ancestor origin/main origin/develop
```

The GitHub compare API for `main...develop` must also report `behind_by: 0`.
If either check fails, do not merge another release candidate.
