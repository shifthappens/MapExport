# Changelog

All notable changes to MapExport are recorded here, **newest at the top**.

> **Maintenance rule (for humans and AI assistants alike):** every commit that
> adds, changes, or removes a feature/behaviour MUST add an entry to the top of
> the "Unreleased" section below in the same commit. Keep entries short and
> user-facing — describe *what changed and why*, not every line touched. Group
> related work under one dated entry. Pure-internal churn (formatting, comment
> typos, regenerating `script.min.js`) does not need its own entry.

## Unreleased

### 2026-07-03 — Test harness can now fail: SVG lint, label unit tests, per-city floors
- New `tests/svg-lint.mjs`: deterministic checks on any exported SVG — NaN/undefined
  in attributes, empty/mirrored/upside-down labels, dangling `textPath` refs,
  label-on-label overlap, labels outside the canvas (warning; known engine
  behaviour). Guarded by its own `tests/svg-lint-selftest.mjs` (11 checks).
- New `tests/label-placement.mjs` (31 checks): unit + integration tests for the
  street-label engine — reading-angle normalisation, straight-vs-textPath choice,
  reversed-geometry orientation, repeat spacing, same-name suppression, squares,
  roundabouts — running the real `buildLabelsLayer` from `script.js`.
- `tests/real-export.mjs` is now a test, not just a demo: it exits non-zero on
  lint errors, zero roads/labels, or a layer under its per-city floor
  (`tests/expectations.json`, captured at ×0.5 with `--record` on an approved
  run; Tilburg + Ghent recorded). It also refuses to run against a stale
  `script.min.js` and properly drains cache-write POSTs instead of sleeping 2s.
- `tests/smoke.sh` now runs all six offline suites (incl. supersession) before
  the Overpass round-trip; `OFFLINE_ONLY=1` skips the network step.
  `tests/query-equivalence.mjs` warns on >1.5× over-fetch (accidentally widened
  query). Scanner/parsing code deduplicated into `tests/lib.mjs`, which now
  hard-fails if extraction stops matching `script.js` instead of silently
  skipping layers.
- `tests/viewer.html` accepts `?crop=x,y,w,h` for 1:1 detail screenshots.

### 2026-07-03 — Multi-city visual test harness
- `tests/real-export.mjs` accepts named test areas (`tilburg`, `ghent`, `paris`,
  `bremerhaven`, `oulu`) besides raw bboxes; the city is now part of the export
  filename. `tests/visual-cities.sh` runs the four extra cities in one go.
- The extra cities are **gated**: they run only after the standard Tilburg
  export passed visual inspection and Coen approved it (`tests/README.md` §7).
  Each area is a Tilburg-sized chunk chosen to surface bugs Tilburg can't
  (medieval core, boulevards, harbour, 65°N projection).
- `tests/IMPROVEMENTS.md` records prioritized findings on harness gaps (no
  assertions in real-export, subjective visual check, Tilburg-only fixtures).

### 2026-06-28 — Tracked build + changelog enforcement
- The build is now version-controlled: `tools/minify.sh` (terser for JS,
  clean-css for CSS) replaces the personal gitignored `minify.sh`.
- A tracked pre-commit hook (`.githooks/pre-commit`, activated via
  `bash tools/setup-hooks.sh`) re-minifies staged source and **rejects commits
  that change app source without a `CHANGELOG.md` entry** (bypass:
  `SKIP_CHANGELOG=1`). Keeps `script.min.js`/`style.min.css` and the changelog
  from drifting.

### 2026-06-28 — Street layers grouped by class, alphabetical within
- **Roads:** the exported SVG now sub-groups road paths by `highway=` class
  inside each rendering pass (`roads_casings_<hw>` / `roads_fills_<hw>`, e.g.
  "Residential streets"), ordered alphabetically within each class. The two-pass
  structure (all casings, then all fills) and `ROAD_DRAW_ORDER` are preserved, so
  junctions stay seamless and minor roads still paint under major ones. Casing
  paths now also carry `inkscape:label`. Designers can grab/hide/restyle a whole
  class at once, or find one named street fast.
- **Street labels:** split into `labels_<hw>` subgroups (importance-ordered,
  alphabetical within). No visual change — labels never overlap, so paint order
  is irrelevant.
- Casing+fill were deliberately *not* paired per street: that would stamp a
  crossing road's casing over the other road's fill at every intersection.

### 2026-06-28 — Illustrator-editable labels + headless export harness
- Straight street labels emit as a single rotated `<text>` (one editable object
  in Illustrator) instead of per-letter `<textPath>`; curved stretches keep
  `<textPath>`. Export filenames use local time.
- Added a headless export + visual-check harness (`tests/real-export.mjs`) that
  runs the shipped `script.min.js` outside a browser.

### 2026-06-25 — Road segment merging + street label engine
- `mergeNamedWays` stitches OSM ways sharing name + highway class into maximal
  polylines, cutting SVG path count and improving label placement.
- Name-centric label engine: collision detection, abbreviation, straightest-run
  placement, no upside-down labels.

### 2026-06-25 — Developer documentation
- Added a comprehensive README and a mobile usability notice.

---

_Earlier history predates this changelog; see `git log` for the full record._
