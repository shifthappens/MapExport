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
- **Buildings/landuse**: Direct OSM `landuse` polygons (residential, commercial, retail, industrial) — fetched and rendered as individual named `<path>` elements, grouped into per-category Inkscape sublayers. Web Worker block computation was removed (Apr 2026).
- **Output**: SVG with named Inkscape-compatible layers (`inkscape:label`, `inkscape:groupmode="layer"`)
- **Caching**: Server-side PHP cache (`cache.php`) with 7-day TTL; cache key = `mapexport_v3_{layerId}_{qHash}_{s}_{w}`. Query hash auto-retires stale entries on any query change.
- **Minification**: `minify.sh` (terser for JS, custom node script for CSS), runs via pre-commit hook on the user's local machine
- **Deployment**: `deploy.sh` — rsync to coen.at server (see `reference_deploy.md`)

## Key files
- `script.js` — All application logic (~1944 lines). **This is the source of truth** — `script.min.js` is generated from it.
- `index.html` — Loads `script.min.js`, `style.min.css`, ClipperLib CDN, Leaflet
- `style.css` / `style.min.css` — UI styles
- `minify.sh` — Build script (pre-commit hook, local only — not in repo)
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

## Buildings / City blocks (landuse, Apr 2026)
The old approach (Web Worker + ClipperLib computing blocks from road geometry) was removed. The `buildings` layer now:
- Queries `wr["landuse"~"residential|commercial|retail|industrial"]` — neighbourhood-scale polygons, far fewer elements than individual building footprints
- Renders directly as filled paths (same geometry pipeline as parks)
- Groups by category into **per-category Inkscape sublayers**: `buildings_residential`, `buildings_commercial`, `buildings_retail`, `buildings_industrial`
- Names each polygon individually: `residential_block_1`, `commercial_block_1`, etc. — so every zone is selectable in Inkscape
- Layer label in UI: "City blocks" (id stays `buildings` for downstream compatibility)

Web Worker code (`BLOCK_WORKER_SRC`, `getBlockWorkerUrl`, `prepareBlockData`, `computeBlocksAsync`) remains in `script.js` as dead code — clean it up in a separate pass.

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

### Roads query (Apr 2026)
`service` and `track` highway types were dropped from the roads query and all downstream lookups (preset colors, `ROAD_WIDTHS`, `ROAD_DRAW_ORDER`, `TYPE_LABELS`). For Tilburg this cut elements from 13,702 → 11,305 (-17.5%) and wire size from 8.7 MB → 5.5 MB (-37%). The `street_labels` supersession is unaffected (it never included service/track).

If users report missing driveways or farm tracks, restore `service` and/or `track` as a deliberate decision.

### Minify pre-commit hook gotcha
Every commit that touches `script.js` must also include the regenerated `script.min.js`. The pre-commit hook runs `minify.sh` but leaves the updated `.min.js` **unstaged** — after the initial commit, always follow with `git add script.min.js && git commit --amend --no-edit`. Otherwise deploys serve stale minified code.

### Test harness
See `tests/README.md`. Five scripts under `tests/`:
- `capture-fixtures.mjs` / `capture-one.mjs` — fetch/refresh Tilburg fixtures from live Overpass
- `query-equivalence.mjs` — live Overpass superset check
- `pipeline-equivalence.mjs` — offline tagFilter partition check
- `supersession.mjs` — offline SUPERSESSIONS literal + fixture coverage check
- `time-queries.mjs` — per-layer and combined Overpass timing; accepts optional endpoint arg: `node tests/time-queries.mjs http://localhost/api/interpreter`

Tilburg baseline fixtures committed at `tests/fixtures/tilburg/`. Run `capture-one.mjs <layer-id>` after any query change to refresh just that layer.

## Progress overlay + adaptive tiles (Apr 2026)

Replaced the old one-line `#progress-label` + 6px bar with a stage checklist overlay, and reshaped the tile strategy so town-sized exports don't balloon into 2–4 grid tiles. All driven from [script.js](script.js); the old `showProgress/updateProgress/hideProgress` helpers are gone.

### The `progress` module
Module-level IIFE around [script.js:2055](script.js). Public surface:
- `begin(stages)` — render the checklist, start the elapsed timer, show overlay.
- `setStage(id, state, {meta, detail})` — state is `pending | active | done | failed`. Auto-closes any still-active preceding stage when transitioning a later stage to `active`. Mirrors `detail` into `setStatus(..., 'loading')` so the sidebar stays in sync.
- `bar(pct)` — overall bar + percentage readout.
- `log(msg, {warn})` — append to bounded 12-line activity log with elapsed-time prefix. Warn lines render in accent red.
- `end()` — clears timer, removes `.show` immediately.

Markup lives at [index.html:116-128](index.html). Styles at [style.css:146-186](style.css).

### Export stage list
Declared up front in `doExport`:
1. `plan_tiles` — result of `bboxToTiles(bbox)`; meta shows tile count + `· adaptive` flag when applicable.
2. `check_cache` — batch probe via `cacheExistsBatch`; meta shows `cached/total`.
3. `fetch_tiles` — drives the 0–70% range. `detail` shows current TTFB/download status.
4. `render_svg` — per-layer tick, 70–98%. (The `compute_blocks` stage was removed when buildings switched to landuse polygons.)
5. `finalize` — 98–100%, `wrapSVG` + history write.

### Split `buildSVG`
- `renderLayerSVG({layer,data}, ctx)` — pure per-layer renderer.
- `buildSVGContext(b, W)` — projector + EPS + preset.
- `wrapSVG(layersSVG, ctx, physicalWidthMm)` — header/footer SVG wrapper.
- `sortedResults(results)` — order by `LAYER_ORDER` constant.
- `buildSVG(...)` kept as a thin wrapper for live preview.

### Adaptive single-tile path
`bboxToTiles` takes an adaptive fast-path for bboxes smaller than 95% of `TILE_SIZE`: one query with the real export bbox. Cache key uses `_a_` discriminator to avoid colliding with grid-aligned entries.

### Streaming Overpass body reader
`fetchTileCombined` accepts an `onProgress` callback: TTFB heartbeat (500ms intervals while waiting) + chunked body reader once headers arrive. Rate-limit waits log warn lines to the overlay.
