#!/usr/bin/env bash
# Open or update the "develop -> main" release candidate PR.
#
# Triggered on every push to develop. The script fails closed when the GitHub
# compare API is unavailable, refuses to promote a stale develop branch, and
# keeps the PR title aligned with all conventional commits in main..develop.
#
# Env:
#   GH_TOKEN  GitHub token (required)
#   REPO      owner/repo (required)
#   DRY_RUN   set to 1 to inspect without creating or updating anything
set -euo pipefail

REPO="${REPO:?REPO (owner/repo) is required}"
GH_TOKEN="${GH_TOKEN:?GH_TOKEN is required}"
API="${API:-https://api.github.com}"
BASE="main"
HEAD="develop"
LABEL="release-candidate"
REVIEWER="timlohse1104"
BODY="Automatically opened after a merge into develop.

Merging this PR promotes the accumulated state of develop to main. Release Please then prepares the semantic version, changelog and GitHub Release."
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
      "$(jq -n --arg name "${LABEL}" '{name:$name, color:"7f7fd4"}')" >/dev/null
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

echo "==> Comparing ${BASE}...${HEAD} in ${REPO}"
COMPARE=$(api_request GET "/repos/${REPO}/compare/${BASE}...${HEAD}")
if ! printf '%s' "${COMPARE}" | jq -e '
  type == "object" and
  (.ahead_by | type == "number") and
  (.behind_by | type == "number") and
  (.commits | type == "array") and
  (.files | type == "array")
' >/dev/null; then
  echo "==> ERROR: GitHub returned an invalid compare response; refusing to continue." >&2
  exit 1
fi

AHEAD_BY=$(printf '%s' "${COMPARE}" | jq -r '.ahead_by')
BEHIND_BY=$(printf '%s' "${COMPARE}" | jq -r '.behind_by')
CHANGED_FILES=$(printf '%s' "${COMPARE}" | jq -r '.files | length')

# A true merge-commit backmerge leaves develop ahead by one merge commit but
# with no content difference. Do not create an empty release candidate for it.
if [ "${AHEAD_BY}" -eq 0 ] || [ "${CHANGED_FILES}" -eq 0 ]; then
  echo "==> No content changes to promote from develop; nothing to do."
  exit 0
fi

# The backmerge must be a real merge commit. A squash backmerge copies content
# but does not make main an ancestor of develop, so behind_by would stay > 0.
if [ "${BEHIND_BY}" -gt 0 ]; then
  echo "==> ERROR: develop is ${BEHIND_BY} commit(s) behind main." >&2
  echo "    Merge the pending main -> develop backmerge PR with a merge commit first." >&2
  exit 1
fi

BREAKING=$(printf '%s' "${COMPARE}" | jq '[
  .commits[].commit.message |
  select(test("^[a-zA-Z]+(\\([^)]*\\))?!:"; "m") or test("^BREAKING[ -]CHANGE:"; "m"))
] | length')
FEATURES=$(printf '%s' "${COMPARE}" | jq '[
  .commits[].commit.message | select(test("^(feat|feature)(\\([^)]*\\))?!?:"))
] | length')
FIXES=$(printf '%s' "${COMPARE}" | jq '[
  .commits[].commit.message | select(test("^(fix|bugfix|perf|revert)(\\([^)]*\\))?!?:"))
] | length')

if [ "${BREAKING}" -gt 0 ]; then
  CHANGE_LABEL="breaking change"; [ "${BREAKING}" -ne 1 ] && CHANGE_LABEL="breaking changes"
  TITLE="feat!: merge develop into main (${BREAKING} ${CHANGE_LABEL})"
elif [ "${FEATURES}" -gt 0 ] && [ "${FIXES}" -gt 0 ]; then
  FEAT_LABEL="feature"; [ "${FEATURES}" -ne 1 ] && FEAT_LABEL="features"
  FIX_LABEL="fix"; [ "${FIXES}" -ne 1 ] && FIX_LABEL="fixes"
  TITLE="feat: merge develop into main (${FEATURES} ${FEAT_LABEL}, ${FIXES} ${FIX_LABEL})"
elif [ "${FEATURES}" -gt 0 ]; then
  FEAT_LABEL="feature"; [ "${FEATURES}" -ne 1 ] && FEAT_LABEL="features"
  TITLE="feat: merge develop into main (${FEATURES} ${FEAT_LABEL})"
elif [ "${FIXES}" -gt 0 ]; then
  FIX_LABEL="fix"; [ "${FIXES}" -ne 1 ] && FIX_LABEL="fixes"
  TITLE="fix: merge develop into main (${FIXES} ${FIX_LABEL})"
else
  TITLE="chore: merge develop into main (release candidate)"
fi

echo "==> Diff: ${AHEAD_BY} commit(s), ${CHANGED_FILES} changed file(s), ${BEHIND_BY} behind"
echo "==> Derived title: ${TITLE}"

PRS=$(api_request GET "/repos/${REPO}/pulls?state=open&base=${BASE}&head=${OWNER}:${HEAD}")
if ! printf '%s' "${PRS}" | jq -e 'type == "array"' >/dev/null; then
  echo "==> ERROR: GitHub returned an invalid pull request response." >&2
  exit 1
fi

PR_COUNT=$(printf '%s' "${PRS}" | jq 'length')
if [ "${PR_COUNT}" -gt 0 ]; then
  PR_NUMBER=$(printf '%s' "${PRS}" | jq -r '.[0].number')
  PR_URL=$(printf '%s' "${PRS}" | jq -r '.[0].html_url')

  if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "==> [dry-run] Would update release candidate PR #${PR_NUMBER}: ${TITLE}"
    exit 0
  fi

  api_request PATCH "/repos/${REPO}/pulls/${PR_NUMBER}" \
    "$(jq -n --arg title "${TITLE}" --arg body "${BODY}" '{title:$title, body:$body}')" >/dev/null
  apply_metadata "${PR_NUMBER}"
  echo "==> Updated release candidate PR: ${PR_URL}"
  exit 0
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "==> [dry-run] Would create release candidate PR: ${TITLE}"
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
echo "==> Created release candidate PR: ${PR_URL}"
