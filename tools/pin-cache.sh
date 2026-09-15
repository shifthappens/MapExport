#!/usr/bin/env bash
# Own the never-expiring Overpass cache for the seven validation cities
# (cache/pinned/), covering both v1 and v2's fetchable layers.
#
# cache.php expires normal entries after 7 days. Entries in cache/pinned/ are
# never expired and never swept, and cache.php falls back to them whenever the
# live copy is missing or stale — so the validation exports keep working
# offline forever and only touch Overpass when someone runs `refresh` here.
#
#   tools/pin-cache.sh status    what is pinned, what is live, what is missing
#   tools/pin-cache.sh pin       copy the current live entries into pinned/
#   tools/pin-cache.sh refresh   re-fetch every current key from Overpass, then pin
#
# The key list is derived from the app sources by
# tools/prefetch-validation-cache.mjs --list-keys, so it follows layer/query
# changes instead of being a second hardcoded copy.
#
# Every command also accepts the prefetcher's --cities=<file> and --grid=fine
# to work on an ad-hoc corpus (e.g. the fine-grid workshop cities) instead of
# the seven validation cities; such pins are gitignored (cache/pinned/*_f_*).
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

# Corpus selectors (--cities=, --grid=) apply to every command; anything else
# after the command name is handed to the prefetcher by `refresh` only.
KEY_ARGS=()
REST_ARGS=()
select_args() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --cities=*|--grid=*) KEY_ARGS+=("$arg") ;;
      *) REST_ARGS+=("$arg") ;;
    esac
  done
}

keys() {
  node tools/prefetch-validation-cache.mjs --list-keys ${KEY_ARGS[@]+"${KEY_ARGS[@]}"}
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
    # Both cp's and mv's exit status are checked explicitly, not left to
    # `set -e`: a caller that invokes cmd_pin as part of an && / || list
    # (cmd_refresh does, to capture its status without aborting) suspends
    # errexit for this whole function per bash's own rule, so a failed cp OR
    # mv must not be allowed to silently count as success (independent review
    # finding, 2026-09-16: the first pass only checked cp, leaving a failed
    # rename free to still increment `copied` and report success).
    tmp="$PINNED_DIR/.$key.$$.tmp"
    if ! cp "$live" "$tmp"; then
      rm -f "$tmp"
      skipped=$((skipped + 1)); echo "ERROR copy to pinned/ failed, existing pin left untouched: $key" >&2
      continue
    fi
    if ! mv -f "$tmp" "$PINNED_DIR/$key.json.gz"; then
      rm -f "$tmp"
      skipped=$((skipped + 1)); echo "ERROR rename into pinned/ failed, existing pin left untouched: $key" >&2
      continue
    fi
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

# Explicit refresh: really go back to Overpass for every current key.
#
# The prefetcher only fetches what the cache cannot already answer, so two
# things must be out of the way: pinned serving (the .disabled marker) and the
# live entries, which would otherwise be reported as HITs and leave the refresh
# fetching nothing. Live entries are moved, not deleted, so a failed refresh
# puts the cache back as it found it. The trap covers Ctrl-C too — a leftover
# .disabled would silently un-pin the whole validation corpus.
cmd_refresh() {
  local key prefetch_status=0 pin_status=0 cleanup_done=0 fetch_started=0
  mkdir -p "$PINNED_DIR"
  # A stash left behind by a run that was killed outright (SIGKILL, power cut)
  # holds the only copy of those entries. Put it back before parking anything
  # new, or this run would restore last week's data over today's at the end.
  if [ -d "$STASH" ]; then
    echo "recovering a stash left by an earlier interrupted refresh"
    restore_stash
  fi
  mkdir -p "$STASH"
  # One idempotent cleanup, covering the whole function (not just the fetch),
  # so a leftover .disabled marker can never survive an interrupted run — the
  # original reason this trap exists at all. It guards cmd_pin behind
  # $fetch_started, though: a signal caught before the fetch actually starts
  # (still setting up, or partway through parking live entries into $STASH)
  # must only restore_stash and clear .disabled, not pin anything. Calling
  # cmd_pin at that point would re-pin whatever is already live — including
  # entries this run hasn't even parked yet, exactly the
  # stale-live-overwrites-pin bug this function exists to prevent (independent
  # review finding, 2026-09-16: an earlier version installed this trap with no
  # such guard, so any signal during setup silently turned the rest of the run
  # into a no-op).
  #
  # INT/TERM are bound separately from EXIT, and each explicitly `exit`s right
  # after cleanup (independent review finding, round 4, 2026-09-16): a bash
  # trap that only runs a handler and returns does not itself terminate the
  # script — once the handler returns, bash resumes executing right after
  # wherever the signal landed. A signal caught while a foreground child (the
  # fetch) is running looked fine even without an explicit exit, because a
  # real Ctrl-C reaches the whole foreground process group and kills the
  # child directly — the interrupted `node ...` line then simply exits on its
  # own, and the script's normal flow happens to pick up correctly from
  # there. But a signal caught anywhere else in this function (e.g. mid-way
  # through the parking loop, or in the gap between parking and the fetch
  # starting) would, without the explicit exit, clean up once and then keep
  # running the rest of cmd_refresh as if nothing had happened — re-creating
  # $DISABLED, parking again, and starting a fetch that was supposed to have
  # been cancelled. The explicit `exit` makes every caught signal actually
  # terminate the run, not just the ones that happen to kill the fetch.
  do_cleanup() {
    # Mask INT/TERM as the very first thing this function does, before even
    # the latch check (independent review, round 6, 2026-09-16 — a round-5 fix
    # that set the mask right after `cleanup_done=1` left a one-line window
    # between the latch and the mask: a signal landing in exactly that gap
    # still hit an active INT/TERM trap, reentered this now-latched function,
    # returned immediately, and let the trap's `exit` abandon cleanup partway,
    # the same failure round 5 already fixed for the rest of cleanup's body).
    # Masking first closes the window completely — every entry to do_cleanup,
    # including a reentrant one, masks before anything else can happen.
    # Ignoring INT/TERM means a signal here is simply dropped, not deferred;
    # `trap - EXIT INT TERM` right after the normal-path call below restores
    # default handling once cleanup has actually finished.
    trap '' INT TERM
    [ "$cleanup_done" -eq 1 ] && return 0
    cleanup_done=1
    if [ "$fetch_started" -eq 1 ]; then
      echo "pinning what this run fetched"
      cmd_pin || pin_status=$?
    fi
    restore_stash
    rm -f "$DISABLED"
  }
  trap do_cleanup EXIT
  trap 'do_cleanup; exit 130' INT
  trap 'do_cleanup; exit 143' TERM
  : > "$DISABLED"
  while read -r key; do
    if [ -f "cache/$key.json.gz" ]; then mv "cache/$key.json.gz" "$STASH/$key.json.gz"; fi
  done < <(keys)
  echo "pinned serving disabled, live entries parked in $STASH"
  echo "fetching all keys from Overpass (this is slow)"
  fetch_started=1
  # `|| prefetch_status=$?` keeps set -e from aborting the function here: a
  # deadline hit or interrupt exits the prefetcher non-zero even though it
  # left real, valid entries live in cache/ — those must still get pinned
  # below, or a run that ran out of time silently loses its progress (found
  # 2026-09-15, fixed by hand with a manual `pin` afterwards both times).
  node tools/prefetch-validation-cache.mjs ${KEY_ARGS[@]+"${KEY_ARGS[@]}"} "$@" || prefetch_status=$?
  do_cleanup
  trap - EXIT INT TERM
  echo "pinned serving re-enabled"
  if [ "$prefetch_status" -ne 0 ]; then
    echo "refresh did not finish (prefetcher exited $prefetch_status) — pinned whatever was fetched; rerun refresh to fill the rest" >&2
  fi
  [ "$prefetch_status" -eq 0 ] && [ "$pin_status" -eq 0 ]
}

command="${1:-}"
[ $# -gt 0 ] && shift
select_args "$@"
case "$command" in
  status)  cmd_status ;;
  pin)     cmd_pin ;;
  refresh) cmd_refresh ${REST_ARGS[@]+"${REST_ARGS[@]}"} ;;
  -h|--help|help) usage 0 ;;
  *) echo "unknown command: ${command:-（none）}" >&2; usage 2 ;;
esac
