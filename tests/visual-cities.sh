#!/bin/bash
# tests/visual-cities.sh — extended visual-check exports: Ghent, Paris,
# Bremerhaven, Oulu. GATED: run this only after the Tilburg export
# (node tests/real-export.mjs) has passed visual inspection AND Coen has
# approved it. Each export then still needs its own browser visual check
# via tests/viewer.html (see tests/README.md §6).
set -e
cd "$(dirname "$0")/.."
for city in ghent paris bremerhaven oulu; do
  echo "════ $city ════"
  node tests/real-export.mjs "$city" "${1:-a3_300}"
  echo
done
