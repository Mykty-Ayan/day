#!/usr/bin/env bash
# Включает защиту веток main и develop под GitFlow.
# Требует прав admin на репозитории — запускает владелец (Mykty-Ayan).
#
#   ./scripts/setup-branch-protection.sh
#
set -euo pipefail

REPO="${REPO:-Mykty-Ayan/day}"
CHECKS='"backend-lint","backend-test","frontend-lint","frontend-build","docker-build"'

protect() {
  local branch="$1" reviews="$2"
  echo "==> ${branch}"
  gh api -X PUT "repos/${REPO}/branches/${branch}/protection" \
    -H "Accept: application/vnd.github+json" \
    --input - <<JSON
{
  "required_status_checks": { "strict": true, "contexts": [${CHECKS}] },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": ${reviews},
    "dismiss_stale_reviews": true,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "required_conversation_resolution": true
}
JSON
}

# main строже: прод. develop мягче, чтобы не блокировать работу вдвоём.
protect main 1
protect develop 1

echo "==> авто-удаление веток после merge"
gh api -X PATCH "repos/${REPO}" -f delete_branch_on_merge=true >/dev/null

echo "готово"
