#!/usr/bin/env bash
# tests/smoke.sh — deterministic offline suite only. Live utilities have their
# own explicit commands and are classified in offline-runner.mjs.
set -eu
cd "$(dirname "$0")/.."

node tests/offline-runner.mjs
