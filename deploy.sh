#!/usr/bin/env bash
#
# TKG Hub — one-shot deploy to GitHub Pages.
#
#   ./deploy.sh
#
# Creates the repo if it does not exist, pushes, turns on Pages, and prints
# the live URL. Safe to re-run — after the first time it is just a push.

set -euo pipefail

REPO_NAME="tkg-hub"
GH="${HOME}/.local/bin/gh"
command -v gh >/dev/null 2>&1 && GH="$(command -v gh)"

cd "$(dirname "$0")"

if [ ! -x "$GH" ]; then
  echo "GitHub CLI not found at $GH" >&2
  exit 1
fi

# ---------------------------------------------------------------- auth --
if ! "$GH" auth status >/dev/null 2>&1; then
  echo "Not signed in to GitHub yet — opening the browser login."
  echo "Pick: GitHub.com  →  HTTPS  →  Yes (authenticate git)  →  Login with a web browser"
  echo
  "$GH" auth login
fi

USER="$("$GH" api user --jq .login)"
echo "Signed in as $USER"

# ---------------------------------------------------------------- safety --
# The repo has to be public for Pages on the free tier, so make very sure the
# passcode and the plaintext board export are not about to be published.
for f in .passcode tools/board-dump.json; do
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    echo "STOP: $f is tracked by git and must never be published." >&2
    exit 1
  fi
done
echo "Checked: passcode and plaintext board export are not tracked."

# ---------------------------------------------------------------- repo --
if "$GH" repo view "$USER/$REPO_NAME" >/dev/null 2>&1; then
  echo "Repo $USER/$REPO_NAME already exists."
  git remote get-url origin >/dev/null 2>&1 || \
    git remote add origin "https://github.com/$USER/$REPO_NAME.git"
else
  echo "Creating $USER/$REPO_NAME (public — required for free Pages)…"
  "$GH" repo create "$REPO_NAME" \
    --public \
    --source=. \
    --remote=origin \
    --description "Internal transaction dashboard for The Kincer Group. Deal data is encrypted at rest."
fi

echo "Pushing…"
git push -u origin main

# --------------------------------------------------------------- pages --
echo "Enabling GitHub Pages…"
"$GH" api "repos/$USER/$REPO_NAME/pages" \
  -X POST -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 \
  || "$GH" api "repos/$USER/$REPO_NAME/pages" \
       -X PUT -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 \
  || echo "  (Pages may already be on — check Settings → Pages)"

echo
echo "─────────────────────────────────────────────"
echo "  Live in about a minute at:"
echo "  https://${USER}.github.io/${REPO_NAME}/"
echo
echo "  Passcode: whatever is in .passcode"
echo "  Send the team the URL and the passcode separately."
echo "─────────────────────────────────────────────"
