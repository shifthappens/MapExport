#!/usr/bin/env bash
# tools/minify.sh — regenerate the committed minified assets from source.
#
#   script.js  -> script.min.js   (terser:   global if present, else `npx terser`)
#   style.css  -> style.min.css   (cleancss: global if present, else npx clean-css-cli)
#
# Both *.min.* files are TRACKED in git and are what index.html / tests load, so
# they MUST be regenerated whenever their source changes. The pre-commit hook
# (.githooks/pre-commit) calls this automatically and re-stages the output.
#
# This is the canonical, version-controlled build script. It supersedes any
# personal, gitignored root-level minify.sh.
#
# Usage:
#   tools/minify.sh        # both JS and CSS
#   tools/minify.sh js     # JS only
#   tools/minify.sh css    # CSS only
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo "$(dirname "$0")/..")"

target="${1:-all}"

minify_js() {
  if command -v terser >/dev/null 2>&1; then
    terser script.js -c -m -o script.min.js
  else
    npx --yes terser script.js -c -m -o script.min.js
  fi
  echo "minify: script.min.js ($(wc -c < script.min.js) bytes)"
}

minify_css() {
  if command -v cleancss >/dev/null 2>&1; then
    cleancss -o style.min.css style.css
  else
    npx --yes clean-css-cli -o style.min.css style.css
  fi
  echo "minify: style.min.css ($(wc -c < style.min.css) bytes)"
}

case "$target" in
  js)  minify_js ;;
  css) minify_css ;;
  all) minify_js; minify_css ;;
  *)   echo "usage: tools/minify.sh [js|css|all]" >&2; exit 2 ;;
esac
