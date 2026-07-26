#!/usr/bin/env bash
# Own the never-expiring Overpass cache for the seven engine-v2 validation
# cities (cache/pinned/).
#
# cache.php expires normal entries after 7 days. Entries in cache/pinned/ are
# never expired and never swept, and cache.php falls back to them whenever the
# live copy is missing or stale — so the validation exports keep working
# offline forever and only touch Overpass when someone runs `refresh` here.
#
#   tools/pin-cache.sh status    what is pinned, what is live, what is missing
#   tools/pin-cache.sh pin       copy the current live entries into pinned/
#   tools/pin-cache.sh refresh   re-fetch all 70 keys from Overpass, then pin
#
# The key list is derived from the app sources by
# tools/prefetch-validation-cache.mjs --list-keys, so it follows layer/query
# changes instead of being a second hardcoded copy.
#
# Written for bash 3.2 (macOS default): no associative arrays.
set -eu
cd "$(dirname "$0")/.."

PINNED_DIR="cache/pinned"
DISABLED="$PINNED_DIR/.disabled"

usage() {
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

keys() {
  node tools/prefetch-validation-cache.mjs --list-keys
}

# A pinned file must be a readable gzip stream holding an "elements" array;
# pinning a truncated or error-page entry would freeze that damage in forever.
valid_entry() {
  gzip -dc "$1" 2>/dev/null | head -c 4096 | grep -q '"elements"'
}

cmd_status() {
  local pinned=0 live=0 gap=0 total=0 key
  while read -r key; do
    total=$((total + 1))
    if [ -f "$PINNED_DIR/$key.json.gz" ]; then pinned=$((pinned + 1)); else
      gap=$((gap + 1)); echo "not pinned: $key"
    fi
    if [ -f "cache/$key.json.gz" ]; then live=$((live + 1)); fi
  done < <(keys)
  echo "keys: $total   pinned: $pinned   live (unexpired or not): $live   unpinned: $gap"
  if [ -f "$DISABLED" ]; then
    echo "WARNING: $DISABLED exists, so cache.php is ignoring pinned entries."
    echo "Remove it to re-enable the never-expiring cache."
  fi
  [ "$gap" -eq 0 ]
}

cmd_pin() {
  local copied=0 kept=0 skipped=0 key live
  mkdir -p "$PINNED_DIR"
  while read -r key; do
    live="cache/$key.json.gz"
    if [ ! -f "$live" ]; then
      if [ -f "$PINNED_DIR/$key.json.gz" ]; then kept=$((kept + 1)); else
        skipped=$((skipped + 1)); echo "MISSING no live entry and no pin: $key"
      fi
      continue
    fi
    if ! valid_entry "$live"; then
      skipped=$((skipped + 1)); echo "INVALID live entry is not Overpass JSON, not pinned: $key"
      continue
    fi
    cp "$live" "$PINNED_DIR/$key.json.gz"
    copied=$((copied + 1))
  done < <(keys)
  echo "pinned $copied fresh, kept $kept existing, skipped $skipped"
  [ "$skipped" -eq 0 ]
}

# Explicit refresh: block pinned serving so the prefetch really goes to
# Overpass, refill, then re-pin. The trap makes sure the block is lifted even
# on Ctrl-C, otherwise the cache would stay unpinned without anyone noticing.
cmd_refresh() {
  mkdir -p "$PINNED_DIR"
  trap 'rm -f "$DISABLED"' EXIT INT TERM
  : > "$DISABLED"
  echo "pinned serving disabled; fetching all keys from Overpass (this is slow)"
  node tools/prefetch-validation-cache.mjs "$@"
  rm -f "$DISABLED"
  trap - EXIT INT TERM
  echo "pinned serving re-enabled; pinning the refreshed entries"
  cmd_pin
}

case "${1:-}" in
  status)  shift; cmd_status "$@" ;;
  pin)     shift; cmd_pin "$@" ;;
  refresh) shift; cmd_refresh "$@" ;;
  -h|--help|help) usage 0 ;;
  *) echo "unknown command: ${1:-（none）}" >&2; usage 2 ;;
esac
