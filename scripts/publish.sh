#!/usr/bin/env bash
# Publish Fallow to GitHub as a public repo named "fallow".
# Needs the GitHub CLI signed in once: gh auth login
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v gh >/dev/null 2>&1; then
  echo "Install the GitHub CLI first: https://cli.github.com" >&2
  exit 1
fi
NAME="${1:-fallow}"
if git remote get-url origin >/dev/null 2>&1; then
  echo "origin already set to $(git remote get-url origin); pushing."
  git push -u origin main
else
  gh repo create "$NAME" --public --source=. --remote=origin --push \
    --description "A field book for the thinking you hand to AI. Tracks what you offload, models how each skill decays, pushes back before you delegate what keeps you sharp."
fi
echo "Published. Add the topics: gh repo edit --add-topic cognitive-science,spaced-repetition,nextjs,ai-tools,digital-wellbeing"
