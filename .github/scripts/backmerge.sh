#!/usr/bin/env bash
# Open a "main -> develop" backmerge PR after a release.
#
# Triggered by the Backmerge workflow on every push to main. Merging it keeps
# develop in sync with main so the merge base moves forward and future
# "develop -> main" release candidate PRs stay conflict-free.
#
# Env:
#   GH_TOKEN  GitHub token (required)
#   REPO      owner/repo (required)
#   DRY_RUN   set to 1 to only inspect, without creating anything
set -euo pipefail

REPO="${REPO:?REPO (owner/repo) is required}"
GH_TOKEN="${GH_TOKEN:?GH_TOKEN is required}"
API="https://api.github.com"
BASE="develop"
HEAD="main"
TITLE="chore: merge main into develop (backmerge)"
LABEL="backmerge"
REVIEWER="timlohse1104"
BODY="Automatically opened after a push to main.

Merging this PR keeps develop in sync with main (release content, version bump,
changelog) so the merge base moves forward. This prevents conflicts in later
release candidate PRs (develop -> main)."

OWNER="${REPO%/*}"

echo "==> Checking for open backmerge PRs ($BASE <- $HEAD) in $REPO"
PRS=$(curl -s -H "Authorization: Bearer ${GH_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "${API}/repos/${REPO}/pulls?state=open&base=${BASE}&head=${OWNER}:${HEAD}")

PR_COUNT=$(printf '%s' "$PRS" | jq 'length' 2>/dev/null || echo 0)
if [ "${PR_COUNT}" -gt "0" ]; then
  echo "==> Backmerge PR already open; nothing to do."
  exit 0
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "==> [dry-run] No open PR; would create:"
  echo "    title: ${TITLE}"
  echo "    base:  ${BASE}"
  echo "    head:  ${HEAD}"
  echo "    label: ${LABEL}"
  echo "    reviewer: ${REVIEWER}"
  exit 0
fi

echo "==> No open PR; creating backmerge PR"

# Ensure the label exists (idempotent; 422 when already present is fine)
curl -s -o /dev/null -w "label create: HTTP %{http_code}\n" \
  -X POST -H "Authorization: Bearer ${GH_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg n "${LABEL}" '{name:$n, color:"c5def5"}')" \
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
  echo "==> Created backmerge PR: ${URL}"
else
  MESSAGE=$(printf '%s' "${RESPONSE}" | jq -r '.message // empty')
  echo "==> Failed to create PR: ${MESSAGE}" >&2
  exit 1
fi
