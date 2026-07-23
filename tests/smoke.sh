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
echo "== layer-selection (offline, v1/v2 layer-toggle fetch + render contract) =="
node tests/layer-selection.mjs

echo
echo "== overpass-fetch (offline, shared timeout/failover/abort fetch contract) =="
node tests/overpass-fetch.mjs

echo
echo "== svg-id-uniqueness (offline, document-wide unique + deterministic ids) =="
node tests/svg-id-uniqueness.mjs

echo
echo "== feature-label-dedup (offline, water/park name dedup unit test) =="
node tests/feature-label-dedup.mjs

echo
echo "== square-labels (offline, engine v2 'Squares & plazas' label group) =="
node tests/square-labels.mjs

echo
echo "== place-labels (offline, engine v2 'Place names' label group) =="
node tests/place-labels.mjs

echo
echo "== area-binding (offline, engine v2 AREA_FEATURES classify/bucket/render) =="
node tests/area-binding.mjs

echo
echo "== park-paths (offline, AF-06 park/cemetery trail generalisation) =="
node tests/park-paths.mjs

echo
echo "== rail-service (offline, engine v2 two-class rail rule) =="
node tests/rail-service.mjs

echo
echo "== metro-dedup (offline, engine v2 public-line grouping + service filter) =="
node tests/metro-dedup.mjs

echo
echo "== metro-tunnel (offline, engine v2 AF-05d tunnel treatment) =="
node tests/metro-tunnel.mjs

echo
echo "== editor-structure (offline, AF-07a tram labels + city-blocks sub-groups) =="
node tests/editor-structure.mjs

echo
echo "== technical-names (offline, AF-07b ⚠ editor warning on technical names) =="
node tests/technical-names.mjs

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
echo "== v2-cutterless-worker (real ClipperLib worker; SKIPs if no clipper cache/network) =="
node tests/v2-cutterless-worker.mjs

echo
echo "== v2-face-runtime-benchmark (real worker parity + opt-in phase timings) =="
node tests/v2-face-runtime-benchmark.mjs

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
