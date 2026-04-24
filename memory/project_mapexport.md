---
name: MapExport project overview
description: USE-IT City Map Builder — generates Illustrator-ready SVGs from OSM data, current architecture and state
type: project
---

## What it is
**USE-IT City Map Builder** — a browser-based tool that generates Illustrator/Inkscape-ready SVG city maps from OpenStreetMap data. Designed to automate what USE-IT volunteers currently do manually: tracing Google Maps in Illustrator to produce stylized city guide maps.

**Why:** USE-IT is a network of tourist info offices that makes free city guides. Each guide needs a hand-drawn-style city map. This tool aims to automate 80% of that work for any city in the world.

**How to apply:** Every feature decision should optimize for print-ready vector output that a designer can open in Illustrator and immediately start editing (recoloring, adding icons, annotations).

## Architecture
- **Single-page app**: `index.html` + `script.js` + `style.css` (no framework)
- **Data source**: Overpass API (OpenStreetMap), fetched tile-by-tile with adaptive delay
- **City blocks**: Web Worker + ClipperLib — buffer roads into polygons, union, subtract from bbox = individual block `<path>` elements
- **Output**: SVG with named Inkscape-compatible layers (`inkscape:label`, `inkscape:groupmode="layer"`)
- **Caching**: Server-side PHP cache (`cache.php`) + browser IndexedDB tile cache (prefix `v2_`)
- **Minification**: `minify.sh` (terser for JS, custom node script for CSS), runs via pre-commit hook
- **Deployment**: `deploy.sh` — rsync to coen.at server (see `reference_deploy.md`)

## Key files
- `script.js` — All application logic (~1500 lines)
- `index.html` — Loads `script.min.js`, `style.min.css`, ClipperLib CDN, Leaflet
- `style.css` / `style.min.css` — UI styles
- `minify.sh` — Build script (pre-commit hook)
- `deploy.sh` — rsync deploy (gitignored)
- `cache.php` — Server-side Overpass response cache

## Current color scheme (USE-IT preset)
- Background: `#ffffff` (white)
- Building blocks fill: `#FEF6ED`
- Building blocks / road casing stroke: `#F4AFA7`
- Water (all): `#A4DBF3`
- Parks/green: `#51A886`
- Roads fill: `#ffffff`
- Road casing: `#F4AFA7` (uniform width: 6)

## Layer render order (bottom to top)
`water_bodies → waterways → buildings → parks → roads → rail → tram → metro → transit_stops → labels`

Key rendering decisions:
- Buildings (blocks) render BEFORE roads — so road strokes cover block edges
- Parks render BETWEEN buildings and roads — paths through parks stay visible
- Each named park is a separate selectable `<path>` with its name as `id`
- Tram and metro OFF by default in UI

## City blocks (Web Worker + ClipperLib)
- Roads buffered by half-width using `ClipperOffset` (jtSquare, etOpenSquare)
- All voids (buffered roads + parks + water) unioned, then subtracted from bbox
- `PolyTree` traversal for hole detection (blocks with courtyards)
- Blocks with centroid inside water bodies filtered out
- Aggressive simplification: `dpSimplify` eps=8, `CleanPolygon` distance=4-6, SCALE=1
- `BLOCK_ROADS` set excludes footways/cycleways/paths from block boundaries
- `minArea = 400` filters out tiny fragments
- Progress reporting from worker to UI

## Parks filtering
- Only named parks from OSM (`["name"]` in Overpass query)
- Leisure: park, nature_reserve, recreation_ground (no garden)
- Landuse: forest (no grass, meadow, village_green, allotments, orchard)
- Natural: wood (no scrub, heath, grassland)
- Name blacklist in `tagFilter`: filters out generic names like "Green area", "Groen", "Tuin", "Garden", "Playground", etc.
- Minimum name length: 4 characters

## Print sizes
A4@300dpi (3508px), A3 (4961px), A2 (7016px), A1 (9933px), custom px.
`getScaleFactor(W)` returns `W / 4961` — all widths tuned for A3.

## Scalability concern
ClipperLib boolean operations can be slow for large areas (10x10km city). Previous attempts froze the browser before the Web Worker was added. Current optimizations (aggressive simplify, SCALE=1, square joins, batched offset) work for medium areas. Full-city exports may still need tiling (split into grid, process per tile).

## Reference files
- Tutorial PDF: `Google Drive/.../how to draw a street map.pdf` — manual process we're automating
- Sample map: `Google Drive/.../gent.ai` — Ghent USE-IT map (binary .ai, can't be read by Claude)

## Overpass pipeline optimizations (Apr 2026)

Seven commits on `main` (`035eeb1..2198ea7`) implementing the plan at
`~/.claude/plans/https-wiki-openstreetmap-org-wiki-overpa-logical-dusk.md`.
All verified against the Tilburg fixture baseline (`51.530,5.040,51.590,5.130`).

- **§1.2 `wr[]` shortcut** (`035eeb1`) — collapsed way+relation pairs in `water_bodies`, `parks`, `buildings`, `water_labels` into `wr[...]`.
- **§1.3 global `[bbox:]`** (`343bc73`) — `fetchTileCombined` and `fetchLayer` now emit `[out:json][timeout:N][bbox:s,w,n,e];…` and strip per-statement `(bbox)`.
- **§3.1 query-hash in cache key** (`3006a35`) — new prefix `mapexport_v3_`, key format `mapexport_v3_{layerId}_{qHash}_{s}_{w}`. `qHash` is `fnv1a36(overpassQuery('BBOX'))` memoized per layer. Any edit to a layer's query silently retires its old cache. **Do not weaken this** — bump the hash surface if you change query shape.
- **§2.2 batch cache probe** (`d39f94c`) — `cache.php?exists=k1,k2,…` (max 64 keys) returns `{k:bool}`. `cacheExistsBatch()` chunks and parallelizes. `doExport` now builds the full `layer×tile` key matrix up front, HEAD-checks in one pass, then only `cacheGet`s the hits. Replaces the old N² per-key round-trip pattern.
- **§1.1 layer supersession** (`05cc571`) — `SUPERSESSIONS` table + `supersededQuery(layer, b, inFetchSet)` strip sub-statements from a subordinate layer's query when ALL required superseders are in the same fetch. Current rules: `street_labels ← roads`, and three `water_labels` sub-statements covered by `waterways` / `water_bodies`. tagFilter picks the subordinate's elements out of the superseder's response.
  - Adding a rule: declare `{ strip: b => '...literal...', requires: ['superseder_id'] }`. The `strip` literal must appear verbatim in the subordinate's `overpassQuery('BBOX')` — `tests/supersession.mjs` enforces this.
- **§2.1 endpoint-parallel tile fetches** (`700b399`) — `doExport` tile loop is now a worker pool: one worker pinned per endpoint in `OVERPASS_ENDPOINTS`, `preferredEndpoint` threaded through `fetchTileCombined`. Halves wall-clock on multi-tile exports. Per-endpoint backoff still honored.
- **§4.1 iterative Douglas-Peucker** (`2198ea7`) — `dpSimplify` rewritten with an explicit stack + `Uint8Array` keep-bitset. Identical output to the recursive version (no ordering change); avoids O(n) slice allocations per frame.

### Minify pre-commit hook gotcha
Every commit that touches `script.js` must also include the regenerated `script.min.js`. The pre-commit hook runs `minify.sh` but leaves the updated `.min.js` **unstaged** — after the initial commit, always follow with `git add script.min.js && git commit --amend --no-edit`. Otherwise deploys serve stale minified code.

### Test harness
See `tests/README.md`. Four scripts under `tests/`: `capture-fixtures.mjs`, `query-equivalence.mjs` (live Overpass superset check), `pipeline-equivalence.mjs` (offline tagFilter partition check), `supersession.mjs` (offline SUPERSESSIONS literal + fixture coverage check). Tilburg baseline fixtures committed at `tests/fixtures/tilburg/`.

## Progress overlay + adaptive tiles (Apr 2026)

Replaced the old one-line `#progress-label` + 6px bar with a stage checklist overlay, and reshaped the tile strategy so town-sized exports don't balloon into 2–4 grid tiles. All driven from [script.js](script.js); the old `showProgress/updateProgress/hideProgress` helpers are gone.

### The `progress` module
Module-level IIFE around [script.js:2055](script.js). Public surface:
- `begin(stages)` — render the checklist, start the elapsed timer, show overlay.
- `setStage(id, state, {meta, detail})` — state is `pending | active | done | failed`. Auto-closes any still-active preceding stage when transitioning a later stage to `active`. Mirrors `detail` into `setStatus(..., 'loading')` so the sidebar stays in sync.
- `bar(pct)` — overall bar + percentage readout.
- `log(msg, {warn})` — append to bounded 12-line activity log with elapsed-time prefix. Warn lines render in accent red.
- `addStage(s, beforeId)` / `removeStage(id)` — rarely used; reserved for conditional stages.
- `end()` — clears timer, removes `.show` **immediately** (no fade). Fade was removed because `showPreview`'s blocking `innerHTML = svg` (≈1 MB) starves the fade timeout.

Markup lives at [index.html:116-128](index.html) — `#progress-box` with `#progress-header` (title + `#progress-elapsed`), `#progress-bar-wrap`, `#progress-pct`, `ul#progress-stages`, `#progress-log`. Styles at [style.css:146-186](style.css) — icons come from `::before` on `.stage-icon` keyed off state class (`○ ● ✓ ✕`); active icon pulses via `@keyframes stage-pulse`.

### Export stage list
Declared up front in `doExport` ([script.js:1685](script.js)):
1. `plan_tiles` — result of `bboxToTiles(bbox)`; meta shows tile count + `· adaptive` flag when applicable.
2. `check_cache` — batch probe via `cacheExistsBatch`; meta shows `cached/total`.
3. `fetch_tiles` — drives the 0–70% range. `detail` shows current TTFB/download status for the active tile; `meta` accumulates `fetched · cached · failed`.
4. `compute_blocks` — **conditional**, only inserted when the buildings layer is selected. Drives 70–90%.
5. `render_svg` — per-layer tick, 90–98% (or 70–98% when blocks stage is absent). Requires the split `buildSVG` (see below).
6. `finalize` — 98–100%, `wrapSVG` + history write.

Progress ranges are hard-coded in `doExport` — change them in one place if you add a stage.

### Split `buildSVG`
[script.js:1485](script.js) — the original monolithic forEach was split into:
- `renderLayerSVG({layer,data}, ctx)` — pure per-layer renderer. No globals beyond `PRESETS` / `activePreset`.
- `buildSVGContext(b, W, precomputedBlocks)` — projector + EPS + preset.
- `wrapSVG(layersSVG, ctx, physicalWidthMm)` — header/footer SVG wrapper.
- `sortedResults(results)` — order by `LAYER_ORDER` constant.
- `buildSVG(...)` kept as a thin wrapper for anything still calling the old signature (e.g. live preview).

`doExport` uses the parts directly so it can yield to the event loop (`await new Promise(r => setTimeout(r,0))`) between layers — otherwise the overlay couldn't repaint mid-render.

### Adaptive single-tile path
[script.js:463](script.js) — `bboxToTiles` now takes an adaptive fast-path:

```js
if (latSpan < TILE_SIZE * 0.95 && lonSpan < TILE_SIZE * 0.95) {
  return [{ s, w, n, e, adaptive: true }];  // one Overpass query bounded by the actual bbox
}
```

Rationale: a 10×10 km town that happens to straddle grid lines used to fetch 2–4 full 0.1° cells of mostly-empty countryside. Adaptive mode issues one query with the real export bbox, so the server only returns what you asked for. Threshold is 95% of TILE_SIZE so truly grid-aligned selections still take the grid path (and share cache with neighbors).

Cache key for adaptive entries: `{CACHE_PREFIX}{layer.id}_{qHash}_a_{s}_{w}_{n}_{e}` (note the `_a_` discriminator). Grid-aligned entries keep the old `{s}_{w}` two-coord form, so the two namespaces never collide. Repeated exports of the exact same hand-drawn bbox hit the adaptive cache; shift the bbox by a meter and it re-fetches. That's fine — adaptive mode is for one-off selections anyway.

**Float bug** fixed in the same pass: `Math.floor(52.3 / 0.1) === 522` (not 523) because 0.1 isn't IEEE-representable. Exact-fit grid-aligned bboxes used to emit a bogus empty tile one row south. Added `EPS = 1e-9` nudges on both the floor and the loop termination.

### Streaming Overpass body reader
[script.js:666](script.js) — `fetchTileCombined(layers, tile, preferredEndpoint, onProgress)`. The 4th argument turns on two new progress signals:

- **TTFB heartbeat**: 500ms interval fires `onProgress({phase:'waiting', elapsed, endpoint})` from request-start until the first byte arrives. Overpass does 5–30s of server-side compute before flushing anything, so without this the UI would freeze on "0 MB" with no signal. `doExport` logs a `warn` line after 15s elapsed so the user knows the wait is the server, not a stuck client.
- **Chunked body reader**: once headers arrive, we read `res.body.getReader()` and fire `onProgress({phase:'downloading', received, total, endpoint})` per chunk. `Content-Length` is usually absent (chunked transfer), so `total` is 0 and the UI shows `received MB` only. Falls back to `res.json()` when no reader is available.

The detail line for the `fetch_tiles` stage formats both phases and updates in place. Rate-limit waits at [script.js:618,633,700,718](script.js) now also `progress.log(..., {warn:true})` so the log gets entries like `overpass-api.de rate-limited — waiting 1.2s` without clobbering the detail line.

### Sidebar status bar
`setStatus` is now purely the sidebar one-liner. It used to also mutate `#progress-label` inside the overlay — that block is gone; overlay text is driven exclusively through `progress.setStage`. The sidebar still receives every `active` transition via `setStage`'s internal `setStatus` call, so after the overlay hides the sidebar summary is up-to-date.

### Minify reminder
Edits to `script.js` / `style.css` / `index.html` must be followed by `./minify.sh` (the pre-commit hook already runs it). `index.html` references `script.min.js` and `style.min.css` — stale minified files will ship old behaviour to production.

### Verification shortcuts
- Fully cached rerun of a previous export: expect `fetch_tiles` → `0 fetched · N cached`, total wall-clock ≈ 2s.
- Small town (< ~11 km each axis): expect `1 tile · adaptive` in the `plan_tiles` meta.
- Large area (>15 km): expect multiple grid tiles, no adaptive flag.
- Mid-query progress visible: detail line should cycle through `sent query, awaiting response…` → `running query… Ns` → `downloading… X MB` without the UI freezing.
