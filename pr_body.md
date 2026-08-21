# Release Automation

## Summary

Adds an automated release pipeline that turns merges into `develop` into GitHub releases with minimal manual effort:

- **Develop pipeline** (`.github/workflows/release-pr.yml` + `.github/scripts/release-pr.sh`): every push to `develop` opens or reuses a `develop -> main` PR (label `release-candidate`) and builds/pushes the develop image to GHCR.
- **Release workflow** (`.github/workflows/release.yml`): every push to `main` runs `googleapis/release-please-action@v4` (`release-type: node`), which derives the next semantic version from conventional commits, bumps `package.json`, maintains `CHANGELOG.md` and creates the GitHub release + tag. The release image is then built and pushed to GHCR.

## Image tagging (GHCR)

Images are built fresh from the exact merge commit — no re-tagging of older builds:

| Trigger | Tags |
|---------|------|
| push to `develop` | `ghcr.io/tilloh-org/passalong:develop-<sha7>` (immutable) + `:develop` (moving) |
| push to `main` (release) | `ghcr.io/tilloh-org/passalong:<semver>` (immutable) + `:latest` (moving) |

Portainer can pin stacks to `:develop` (staging) or `:<semver>`/`:latest` (production).

## Why this shape

The repository rulesets (`main` + `develop`, PR required, no bypass actors) deliberately forbid direct pushes to `main` — including from CI. So the automation does everything up to the merge:

1. Merge to `develop` → workflow opens/updates the release candidate PR + builds the develop image.
2. Tim approves + merges it (single click, protected branch preserved).
3. Push to `main` → release-please creates the version bump PR / release, then the release image is built from the main commit.

## Files

| File | Purpose |
|------|---------|
| `.github/workflows/release-pr.yml` | Runs on push to `develop`; opens/updates the candidate PR and builds the develop image. |
| `.github/scripts/release-pr.sh` | Opens or updates the `develop -> main` PR via GitHub API. `DRY_RUN=1` supported. |
| `.github/workflows/release.yml` | Runs on push to `main`; release-please (tag + changelog + GitHub release) then builds/pushes the release image. |

## Verification

- `bash -n` syntax check passed for the script.
- YAML validation passed for both workflows.
- Dry run against `tilloh-org/passalong` (real API, `DRY_RUN=1`): correctly detected no open PR and printed the would-be payload.
- Ruleset check: `main` requires status checks `build` + `test` (unchanged, job names preserved).

## Notes

- The `develop-<sha7>` image is built from the develop commit; the release image is built fresh from the main commit — never re-tagged.
