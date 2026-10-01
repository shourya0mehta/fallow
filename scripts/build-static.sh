#!/usr/bin/env bash
# Build the hosted, server-less version of Fallow into ./out
# The API routes are set aside during the build: a static site has nothing to run them,
# and the pages read the ledger from the visitor's browser instead.
set -euo pipefail
cd "$(dirname "$0")/.."
API_DIR="src/app/api"
ASIDE=".api-aside"
restore() { [ -d "$ASIDE" ] && mv "$ASIDE" "$API_DIR" || true; }
trap restore EXIT
rm -rf "$ASIDE"
mv "$API_DIR" "$ASIDE"
rm -rf out .next
STATIC_EXPORT=1 NEXT_PUBLIC_FALLOW_MODE=browser npx next build
touch out/.nojekyll
echo "Static site written to ./out (base path: '${NEXT_PUBLIC_BASE_PATH:-}')."
