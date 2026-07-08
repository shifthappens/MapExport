#!/usr/bin/env bash
# tools/setup-hooks.sh — point git at the tracked .githooks/ directory.
# Run once after cloning. Idempotent.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
chmod +x .githooks/* tools/*.sh 2>/dev/null || true
echo "✓ git hooks installed: core.hooksPath -> .githooks"
echo "  pre-commit will now enforce the CHANGELOG.md rule (it does not minify)."
