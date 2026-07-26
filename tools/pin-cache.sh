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
# Beside the cache, so parking a live entry there is a rename, not a copy.
STASH="cache/.refresh-stash"

usage() {
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

keys() {
  node tools/prefetch-validation-cache.mjs --list-keys
}

# A pinned file must be a complete gzip stream holding complete JSON with an
# "elements" array; pinning a truncated or error-page entry would freeze that
# damage in forever, and cache.php would keep serving it with a Content-Length
# that promises a whole body. gzip -t checks the stream to its trailer, the
# parse checks the document to its last brace — a prefix grep would pass both.
valid_entry() {
  gzip -t "$1" 2>/dev/null || return 1
  gzip -dc "$1" 2>/dev/null | node -e '
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { text += chunk; });
    process.stdin.on("end", () => {
      try { process.exit(Array.isArray(JSON.parse(text).elements) ? 0 : 1); }
      catch { process.exit(1); }
    });'
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
  if [ -d "$STASH" ]; then
    echo "WARNING: $STASH exists — a refresh was interrupted and live entries"
    echo "are still parked there. The next 'refresh' puts them back."
  fi
  [ "$gap" -eq 0 ]
}

cmd_pin() {
  local copied=0 kept=0 skipped=0 key live tmp
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
    # Write beside the pin and rename: a copy interrupted halfway would
    # otherwise leave a valid pin replaced by half a file, and nothing expires
    # a pin afterwards. The "." prefix keeps the temp file out of the key
    # namespace, exactly as cache.php's own temp files do, and the pid keeps two
    # runs from writing the same staging file and renaming each other's half.
    tmp="$PINNED_DIR/.$key.$$.tmp"
    cp "$live" "$tmp"
    mv -f "$tmp" "$PINNED_DIR/$key.json.gz"
    copied=$((copied + 1))
  done < <(keys)
  echo "pinned $copied fresh, kept $kept existing, skipped $skipped"
  [ "$skipped" -eq 0 ]
}

# Anything the refresh moved aside and did not replace goes back where it was.
#
# link(2), not mv: a live entry written while this runs — by the refresh itself,
# or by an export in another terminal — has to win, and `ln` fails outright with
# EEXIST instead of clobbering. `mv -n` only looks first and renames after, so a
# writer landing in between still loses its entry. The stashed copy is dropped
# once it is either linked back or superseded; anything else stays put and is
# reported, because the stash may hold the only copy.
restore_stash() {
  local f dest
  [ -d "$STASH" ] || return 0
  for f in "$STASH"/*.json.gz; do
    [ -f "$f" ] || continue
    dest="cache/$(basename "$f")"
    if ln "$f" "$dest" 2>/dev/null || [ -f "$dest" ]; then rm -f "$f"; fi
  done
  rmdir "$STASH" 2>/dev/null ||
    echo "WARNING: $STASH still holds entries that could not be restored" >&2
}

# Explicit refresh: really go back to Overpass for all 70 keys.
#
# Two things have to be out of the way for that, because the prefetcher fetches
# only what the cache does not already answer. Pinned serving is switched off
# with the .disabled marker, and the live entries are moved aside — an unexpired
# live entry would otherwise be reported as a HIT and the "refresh" would fetch
# nothing at all. They are moved, not deleted, so an interrupted or failed
# refresh puts the cache back as it found it. The trap covers Ctrl-C too:
# leaving .disabled behind would silently un-pin the whole validation corpus.
cmd_refresh() {
  local key
  mkdir -p "$PINNED_DIR"
  # A stash left behind by a run that was killed outright (SIGKILL, power cut)
  # holds the only copy of those entries. Put it back before parking anything
  # new, or this run would restore last week's data over today's at the end.
  if [ -d "$STASH" ]; then
    echo "recovering a stash left by an earlier interrupted refresh"
    restore_stash
  fi
  mkdir -p "$STASH"
  trap 'restore_stash; rm -f "$DISABLED"' EXIT INT TERM
  : > "$DISABLED"
  while read -r key; do
    if [ -f "cache/$key.json.gz" ]; then mv "cache/$key.json.gz" "$STASH/$key.json.gz"; fi
  done < <(keys)
  echo "pinned serving disabled, live entries parked in $STASH"
  echo "fetching all keys from Overpass (this is slow)"
  node tools/prefetch-validation-cache.mjs "$@"
  restore_stash
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
