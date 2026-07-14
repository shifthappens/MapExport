#!/usr/bin/env bash
# Keep exports/ as a thin trail: the newest SVG per city, and nothing older
# than 7 days. Exports are megabytes each and git keeps every blob forever, so
# the working tree is deliberately capped at one snapshot per city rather than
# every intermediate dev run. Removals are staged with `git rm`; new keepers
# are staged with `git add`, so the caller just has to commit.
#
# Run by .github/workflows/prune-exports.yml (daily) and safe to run by hand.
# Written for bash 3.2 (macOS default) and both BSD/GNU coreutils: no
# associative arrays, and date/sed calls fall back across the two toolchains.
set -eu
cd "$(dirname "$0")/.."

# Keep snapshots dated on/after the cutoff (7 days ago). GNU date on CI, BSD
# date on macOS.
cutoff=$(date -u -d '7 days ago' +%Y-%m-%d 2>/dev/null || date -u -v-7d +%Y-%m-%d)

shopt -s nullglob
files=(exports/map-useit-*.svg)
if [ ${#files[@]} -eq 0 ]; then
  echo "no exports to prune"
  exit 0
fi

# Map every file to a city key: strip the trailing -YYYY-MM-DD-HHMMSS (and any
# suffix like -illustrator after it), the map-useit- prefix, and an engine -v2
# marker, so v1 and v2 of one city collapse to the same key and only the newest
# survives. A cityless legacy file yields an empty key and is dropped below.
map=$(mktemp)
for f in "${files[@]}"; do
  base=${f##*/}
  key=$(printf '%s' "$base" \
    | sed -E -e 's/-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}.*$//' \
             -e 's/^map-useit-?//' \
             -e 's/-v2$//')
  printf '%s\t%s\n' "$key" "$f" >> "$map"
done

# For each city key, keep its newest snapshot if that snapshot is within the
# window. Lexical sort equals chronological within a key (identical prefix, then
# a zero-padded timestamp). Empty keys word-split away, dropping cityless files.
keep=$(mktemp)
for key in $(cut -f1 "$map" | sort -u); do
  newest=$(awk -F'\t' -v k="$key" '$1==k{print $2}' "$map" | sort | tail -1)
  d=$(printf '%s' "$newest" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
  [ -n "$d" ] || continue
  if [ "$d" \< "$cutoff" ]; then
    continue
  fi
  printf '%s\n' "$newest" >> "$keep"
done

removed=0
for f in "${files[@]}"; do
  if grep -qxF "$f" "$keep"; then
    continue
  fi
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    git rm -q -- "$f"
  else
    rm -f -- "$f"
  fi
  removed=$((removed + 1))
done

# Stage keepers so a fresh snapshot becomes tracked; already-tracked keepers are
# a no-op here.
while IFS= read -r f; do
  [ -n "$f" ] && git add -- "$f"
done < "$keep"

echo "kept $(grep -c . "$keep") export(s), removed $removed"
rm -f "$map" "$keep"
