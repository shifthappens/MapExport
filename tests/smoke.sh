#!/usr/bin/env bash
# tests/smoke.sh — run the offline checks, then the online equivalence check
# against Tilburg. OFFLINE_ONLY=1 skips the Overpass round-trip.
set -eu
cd "$(dirname "$0")/.."

echo "== road-merge (offline, stitcher unit test) =="
node tests/road-merge.mjs

echo
echo "== abbreviate (offline, name-abbreviation unit test) =="
node tests/abbreviate.mjs

echo
echo "== label-placement (offline, label-engine unit test) =="
node tests/label-placement.mjs

echo
echo "== label-fit (offline, straight-baseline fit unit test) =="
node tests/label-fit.mjs

echo
echo "== svg-lint-selftest (offline, guards the SVG linter) =="
node tests/svg-lint-selftest.mjs

echo
echo "== export-failures (offline, fail-closed export lifecycle) =="
node tests/export-failures.mjs

echo
echo "== preview-state (offline, preview/download separation + races) =="
node tests/preview-state.mjs

echo
echo "== pipeline-equivalence (offline, fixtures only) =="
node tests/pipeline-equivalence.mjs

echo
echo "== supersession (offline, §1.1 rules + tagFilter coverage) =="
node tests/supersession.mjs

echo
echo "== v2-cutterless-coverage (offline, roadless frame still gets a face) =="
node tests/v2-cutterless-coverage.mjs

echo
echo "== cache-php (offline, cache.php bounds/validation/atomic writes; php -S on localhost) =="
node tests/cache-php.mjs

if [ "${OFFLINE_ONLY:-0}" = "1" ]; then
  echo
  echo "(OFFLINE_ONLY=1 — skipping query-equivalence)"
  exit 0
fi

echo
echo "== query-equivalence (hits Overpass, ~30s) =="
node tests/query-equivalence.mjs
