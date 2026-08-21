# Release Automation

## Summary

Adds an automated release pipeline that turns merges into `develop` into GitHub releases with minimal manual effort:

- **Release candidate PR** (`.github/workflows/release-pr.yml` + `.github/scripts/release-pr.sh`): every push to `develop` opens or reuses a `develop -> main` PR (label `release-candidate`). Merging it is the single manual step.
- **Release workflow** (`.github/workflows/release.yml`): every push to `main` runs `googleapis/release-please-action@v4` (`release-type: node`), which derives the next semantic version from conventional commits, bumps `package.json`, maintains `CHANGELOG.md` and creates the GitHub release + tag.

## Why this shape

The repository rulesets (`main` + `develop`, PR required, no bypass actors) deliberately forbid direct pushes to `main` — including from CI. So the automation does everything up to the merge:

1. Merge to `develop` → workflow opens/updates the release candidate PR.
2. Tim approves + merges it (single click, protected branch preserved).
3. Push to `main` → release-please creates the version bump PR / release.

## Files

| File | Purpose |
|------|---------|
| `.github/workflows/release-pr.yml` | Runs on push to `develop`; calls the script. |
| `.github/scripts/release-pr.sh` | Opens or updates the `develop -> main` PR via GitHub API. `DRY_RUN=1` supported. |
| `.github/workflows/release.yml` | Runs on push to `main`; release-please (tag + changelog + GitHub release). |

## Verification

- `bash -n` syntax check passed for the script.
- YAML validation passed for both workflows.
- Dry run against `tilloh-org/passalong` (real API, `DRY_RUN=1`): correctly detected no open PR and printed the would-be payload.

## Not in scope

- GHCR image publishing is intentionally left for the Docker Compose step (later work item).
