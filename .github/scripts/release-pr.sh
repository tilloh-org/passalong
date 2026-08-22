#!/usr/bin/env bash
# Open or update the "develop -> main" release candidate PR.
#
# Triggered by the Release candidate PR workflow on every push to develop.
# Uses the GitHub API directly (curl + jq); requires GH_TOKEN with
# pull-requests write permission on the repository.
#
# Env:
#   GH_TOKEN  GitHub token (required)
#   REPO      owner/repo (required)
#   DRY_RUN   set to 1 to only inspect, without creating anything
set -euo pipefail

REPO="${REPO:?REPO (owner/repo) is required}"
GH_TOKEN="${GH_TOKEN:?GH_TOKEN is required}"
API="https://api.github.com"
BASE="main"
HEAD="develop"
TITLE="chore: merge develop into main (release candidate)"
LABEL="release-candidate"
REVIEWER="timlohse1104"
BODY="Automatically opened after a merge into develop.

Merging this PR turns the accumulated state of develop into a release candidate. The Release workflow then creates the next semantic version tag, changelog entry and GitHub Release."

OWNER="${REPO%/*}"

echo "==> Checking for open release candidate PRs ($BASE <- $HEAD) in $REPO"
PRS=$(curl -s -H "Authorization: Bearer ${GH_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "${API}/repos/${REPO}/pulls?state=open&base=${BASE}&head=${OWNER}:${HEAD}")

PR_COUNT=$(printf '%s' "$PRS" | jq 'length' 2>/dev/null || echo 0)
if [ "${PR_COUNT}" -gt "0" ]; then
  echo "==> Release candidate PR already open; nothing to do."
  exit 0
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "==> [dry-run] No open PR; would create:"
  echo "    title: ${TITLE}"
  echo "    base:  ${BASE}"
  echo "    head:  ${HEAD}"
  echo "    label: ${LABEL}"
  exit 0
fi

echo "==> No open PR; creating release candidate PR"

# Ensure the label exists (idempotent; 422 when already present is fine)
curl -s -o /dev/null -w "label create: HTTP %{http_code}\n" \
  -X POST -H "Authorization: Bearer ${GH_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg n "${LABEL}" '{name:$n, color:"7f7fd4"}')" \
  "${API}/repos/${REPO}/labels" 2>/dev/null || true

PAYLOAD=$(jq -n \
  --arg title "${TITLE}" \
  --arg body "${BODY}" \
  --arg head "${HEAD}" \
  --arg base "${BASE}" \
  --arg label "${LABEL}" \
  --arg reviewer "${REVIEWER}" \
  '{title:$title, body:$body, head:$head, base:$base, labels:[$label], reviewers:[$reviewer]}')

RESPONSE=$(curl -s -X POST -H "Authorization: Bearer ${GH_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}" "${API}/repos/${REPO}/pulls")

URL=$(printf '%s' "${RESPONSE}" | jq -r '.html_url // empty')
if [ -n "${URL}" ]; then
  echo "==> Created release candidate PR: ${URL}"
else
  MESSAGE=$(printf '%s' "${RESPONSE}" | jq -r '.message // empty')
  echo "==> Failed to create PR: ${MESSAGE}" >&2
  exit 1
fi
