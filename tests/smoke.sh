#!/usr/bin/env bash
# tests/smoke.sh — run the offline + online equivalence checks against Tilburg.
set -eu
cd "$(dirname "$0")/.."

echo "== road-merge (offline, stitcher unit test) =="
node tests/road-merge.mjs

echo
echo "== pipeline-equivalence (offline, fixtures only) =="
node tests/pipeline-equivalence.mjs

echo
echo "== query-equivalence (hits Overpass, ~30s) =="
node tests/query-equivalence.mjs
