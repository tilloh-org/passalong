#!/usr/bin/env bash
# Open or update a "main -> develop" backmerge PR after the Release workflow.
#
# The PR must be merged with a real merge commit. Squashing the backmerge would
# copy content but would not make main an ancestor of develop, leaving future
# release candidate PRs vulnerable to repeated conflicts.
#
# Env:
#   GH_TOKEN  GitHub token (required)
#   REPO      owner/repo (required)
#   DRY_RUN   set to 1 to inspect without creating or updating anything
set -euo pipefail

REPO="${REPO:?REPO (owner/repo) is required}"
GH_TOKEN="${GH_TOKEN:?GH_TOKEN is required}"
API="${API:-https://api.github.com}"
BASE="develop"
HEAD="main"
TITLE="chore: merge main into develop (backmerge)"
LABEL="backmerge"
REVIEWER="timlohse1104"
BODY="Automatically opened after the Release workflow completed.

IMPORTANT: Merge this PR using a merge commit, not squash. The merge commit makes main an ancestor of develop and prevents repeated conflicts in later develop -> main release candidate PRs."
OWNER="${REPO%/*}"

api_request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local args=(
    --silent --show-error --fail-with-body
    --retry 3 --retry-all-errors
    -X "${method}"
    -H "Authorization: Bearer ${GH_TOKEN}"
    -H "Accept: application/vnd.github+json"
    -H "X-GitHub-Api-Version: 2022-11-28"
  )

  if [ -n "${data}" ]; then
    args+=(-H "Content-Type: application/json" -d "${data}")
  fi

  curl "${args[@]}" "${API}${path}"
}

ensure_label() {
  if ! api_request GET "/repos/${REPO}/labels/${LABEL}" >/dev/null 2>&1; then
    api_request POST "/repos/${REPO}/labels" \
      "$(jq -n --arg name "${LABEL}" '{name:$name, color:"c5def5"}')" >/dev/null
  fi
}

apply_metadata() {
  local pr_number="$1"
  ensure_label
  api_request POST "/repos/${REPO}/issues/${pr_number}/labels" \
    "$(jq -n --arg label "${LABEL}" '{labels:[$label]}')" >/dev/null
  api_request POST "/repos/${REPO}/pulls/${pr_number}/requested_reviewers" \
    "$(jq -n --arg reviewer "${REVIEWER}" '{reviewers:[$reviewer]}')" >/dev/null
}

# Release Please first opens its version/changelog PR. Wait for that PR to be
# merged so the backmerge includes the final package version and changelog.
MAIN_PRS=$(api_request GET "/repos/${REPO}/pulls?state=open&base=main")
if ! printf '%s' "${MAIN_PRS}" | jq -e 'type == "array"' >/dev/null; then
  echo "==> ERROR: GitHub returned an invalid pull request response." >&2
  exit 1
fi

RELEASE_PR_COUNT=$(printf '%s' "${MAIN_PRS}" | jq '[
  .[] | select(
    (.head.ref | startswith("release-please--")) or
    any(.labels[]?; .name == "autorelease: pending")
  )
] | length')
if [ "${RELEASE_PR_COUNT}" -gt 0 ]; then
  echo "==> Release Please PR is still open; deferring the backmerge."
  exit 0
fi

echo "==> Comparing ${BASE}...${HEAD} in ${REPO}"
COMPARE=$(api_request GET "/repos/${REPO}/compare/${BASE}...${HEAD}")
if ! printf '%s' "${COMPARE}" | jq -e '
  type == "object" and
  (.ahead_by | type == "number") and
  (.behind_by | type == "number")
' >/dev/null; then
  echo "==> ERROR: GitHub returned an invalid compare response; refusing to continue." >&2
  exit 1
fi

AHEAD_BY=$(printf '%s' "${COMPARE}" | jq -r '.ahead_by')
if [ "${AHEAD_BY}" -eq 0 ]; then
  echo "==> main has no commits to backmerge; nothing to do."
  exit 0
fi

PRS=$(api_request GET "/repos/${REPO}/pulls?state=open&base=${BASE}&head=${OWNER}:${HEAD}")
if ! printf '%s' "${PRS}" | jq -e 'type == "array"' >/dev/null; then
  echo "==> ERROR: GitHub returned an invalid backmerge PR response." >&2
  exit 1
fi

PR_COUNT=$(printf '%s' "${PRS}" | jq 'length')
if [ "${PR_COUNT}" -gt 0 ]; then
  PR_NUMBER=$(printf '%s' "${PRS}" | jq -r '.[0].number')
  PR_URL=$(printf '%s' "${PRS}" | jq -r '.[0].html_url')

  if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "==> [dry-run] Would refresh backmerge PR #${PR_NUMBER}."
    exit 0
  fi

  api_request PATCH "/repos/${REPO}/pulls/${PR_NUMBER}" \
    "$(jq -n --arg title "${TITLE}" --arg body "${BODY}" '{title:$title, body:$body}')" >/dev/null
  apply_metadata "${PR_NUMBER}"
  echo "==> Updated backmerge PR: ${PR_URL}"
  exit 0
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "==> [dry-run] Would create backmerge PR: ${TITLE}"
  exit 0
fi

PAYLOAD=$(jq -n \
  --arg title "${TITLE}" \
  --arg body "${BODY}" \
  --arg head "${HEAD}" \
  --arg base "${BASE}" \
  '{title:$title, body:$body, head:$head, base:$base}')
RESPONSE=$(api_request POST "/repos/${REPO}/pulls" "${PAYLOAD}")
PR_NUMBER=$(printf '%s' "${RESPONSE}" | jq -er '.number')
PR_URL=$(printf '%s' "${RESPONSE}" | jq -er '.html_url')
apply_metadata "${PR_NUMBER}"
echo "==> Created backmerge PR: ${PR_URL}"
