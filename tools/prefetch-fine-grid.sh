#!/usr/bin/env bash
# Warm the shareable 0.025° cache grid for either one named bbox or the
# seven bboxes used by tests/real-export.mjs. It delegates key generation to
# prefetch-validation-cache.mjs, so app query changes cannot warm stale keys.
set -eu
cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
Usage:
  bash tools/prefetch-fine-grid.sh area <name> <south,west,north,east> [options]
  bash tools/prefetch-fine-grid.sh validation [options]

Warms the app's shareable 0.025° fine-grid cache. `area` accepts one named
bbox; `validation` reads the seven current test bboxes from tests/real-export.mjs.
It keeps retrying missing tiles until every one is cached. All remaining
options are passed to tools/prefetch-validation-cache.mjs, for example
--cache-base=http://localhost:8080/mapexport/, --attempt-timeout=60,
--v2-only, or --dry-run. Pass --max-runtime=<minutes> only when a bounded run
is explicitly wanted.

Add --pin to copy valid results into cache/pinned/ when the warmer stops. This
also preserves completed work after a timeout or interruption; rerunning the
same command skips existing entries. Pinned fine-grid files are local-only.
EOF
}

[ "$#" -gt 0 ] || { usage >&2; exit 2; }
case "$1" in
  --help|-h) usage; exit 0 ;;
esac

mode="$1"
shift
pin=0
has_runtime_limit=0
args=()
for arg in "$@"; do
  if [ "$arg" = '--pin' ]; then
    pin=1
  else
    case "$arg" in --max-runtime=*) has_runtime_limit=1 ;; esac
    args+=("$arg")
  fi
done

case "$mode" in
  validation)
    cities_args=()
    ;;
  area)
    [ "${#args[@]}" -ge 2 ] || { echo 'area needs <name> and <south,west,north,east>' >&2; usage >&2; exit 2; }
    name="${args[0]}"
    bbox="${args[1]}"
    args=("${args[@]:2}")
    case "$name" in
      *[!A-Za-z0-9_-]*|'') echo 'area name may contain only letters, digits, _ and -' >&2; exit 2 ;;
    esac
    # The X run must be at the end for macOS' mktemp; the JSON reader does not
    # require a filename extension.
    cities_file="$(mktemp "${TMPDIR:-/tmp}/mapexport-fine-grid.XXXXXX")"
    trap 'rm -f "$cities_file"' EXIT HUP INT TERM
    printf '{\n  "%s": "%s"\n}\n' "$name" "$bbox" > "$cities_file"
    cities_args=("--cities=$cities_file")
    ;;
  *)
    echo "unknown target: $mode (use area or validation)" >&2
    usage >&2
    exit 2
    ;;
esac

# The general prefetcher defaults to a one-hour budget for maintenance work.
# This user-facing fine-grid warmer is deliberately resumable and persistent:
# unless its caller explicitly asks for a limit, it waits through Overpass
# outages and retries until every planned key is a confirmed cache hit.
if [ "$has_runtime_limit" -eq 0 ]; then args+=("--max-runtime=0"); fi

set +e
node tools/prefetch-validation-cache.mjs --grid=fine ${cities_args[@]+"${cities_args[@]}"} "${args[@]}"
warm_status=$?
set -e

if [ "$pin" -eq 1 ]; then
  # Keep valid progress even when a bounded run stops before every key arrives.
  bash tools/pin-cache.sh pin --grid=fine ${cities_args[@]+"${cities_args[@]}"}
fi

exit "$warm_status"
