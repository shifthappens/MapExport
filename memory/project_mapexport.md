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
- **City blocks**: stylised USE-IT blocks = the **negative space between streets**. A Web Worker fills the whole canvas, then subtracts the buffered road/rail/water/park network; each road-bounded face becomes one solid cream shape, curb-to-curb. Derived from the existing Overpass roads/water/parks layers, not separately fetched. See "City blocks" section below.
- **Output**: SVG with named Inkscape-compatible layers (`inkscape:label`, `inkscape:groupmode="layer"`)
- **Caching**: Server-side PHP cache (`cache.php`) with 7-day TTL; cache key = `mapexport_v3_{layerId}_{qHash}_{s}_{w}`. Query hash auto-retires stale entries on any query change.
- **Minification**: `tools/minify.sh` (terser for JS, clean-css for CSS) — runs **only** in the GitHub Actions deploy workflow, never locally, never in tests. `script.min.js`/`style.min.css` are gitignored and should only ever exist on the production server.
- **Deployment**: GitHub Actions workflow (`.github/workflows/deploy.yml`), manual-only — rsyncs to the coen.at server (see `reference_deploy.md`)

## Key files
- `script.js` — v1 engine + shared UI/fetch/label/render logic (~3900 lines). **This is the source of truth**, loaded directly by `index.html` in dev AND tested directly by `tests/real-export.mjs` — no build step anywhere except deploy.
- `engine-v2.js` — experimental v2 map-construction engine (~2000 lines) behind a UI toggle; shares v1's fetch/labels/renderers. Binding design contract in `ENGINE-V2.md` — read it before touching this file. v1 stays production until cutover.
- `index.html` — Loads `script.js`, `style.css`, `engine-v2.js`, Leaflet directly (ClipperLib loads inside the workers via CDN `importScripts`). The deploy workflow rewrites a separate, deployed copy to point at the minified files and strips the `engine-v2:start/end` marker blocks (v2 is dev/test only); the repo's own `index.html` never changes.
- `style.css` — UI styles
- `cache.php` — Server-side Overpass response cache

## Current color scheme (USE-IT preset)
- Background: `#ffffff` (white)
- Building blocks fill: `#FEF6ED`
- Building blocks / road casing stroke: `#F4AFA7`
- Water (all): `#A4DBF3`
- Parks/green: `#51A886`
- Roads fill: `#ffffff`
- Road casing: `#F4AFA7` (uniform width: 12 — bumped from 6 Jun 2026 so streets "pop" like the USE-IT Ghent reference)

## Layer render order (bottom to top)
v1 (`LAYER_ORDER` in script.js):
`landcover → water_bodies → waterways → city_blocks → parks → roads → rail → tram → metro → transit_stops → water_labels → street_labels`
(the old `poi_*` and `landuse_residential/industrial` layers were removed from the registry). v2 has its own paint order — see `ENGINE-V2.md` §4.

Key rendering decisions:
- Buildings (blocks) render BEFORE roads — so road strokes cover block edges
- Parks render BETWEEN buildings and roads — paths through parks stay visible
- Each named park is a separate selectable `<path>` with its name as `id`
- Tram and metro OFF by default in UI

## City blocks (road-bounded faces / negative space, Jun 2026)
Layer id `city_blocks` (type `derived`). Renders the **stylised USE-IT look**: the
space between streets filled solid curb-to-curb as one cream shape per block — no
building detail, no gaps. Matches the USE-IT Ghent reference map exactly.

**Why this and not buildings:** earlier in the session we built a "merge real building
footprints" version (OpenFreeMap vector tiles + morphological close). It was
technically faithful but the user rejected it — too realistic/cluttered, not the
stylised flat-block look. The USE-IT maps fill each road-enclosed face solid. All the
vector-tile/MVT code was removed.

**Algorithm (Web Worker `BLOCK_WORKER_SRC`):**
- `prepareBlockData` collects the cutter network from the normal Overpass layers:
  roads (buffered by `(fillW+casingW)·sf/2` per type), rail/tram/metro, waterways
  (buffered lines), parks + water bodies (closed areas).
- Worker buffers/unions those into `voidClean`, then `blocks = bboxCanvas − voidClean`
  via a `ctDifference` PolyTree. Each top-level face = one block (holes for interior
  parks/water). `minArea` culls slivers; light `dpS(2.0)` simplify on output.
- Each block → its own `<path id="block_N" inkscape:label="Block N">` (selectable).

**Colours (USE-IT preset, match Ghent):** block fill `#FEF6ED`, street fill `#ffffff`,
road casing `#F4AFA7`, water `#A4DBF3`, parks `#51A886`, bg white. Render order puts
`city_blocks` before parks/roads so the white road fill + coral casing sit on top
(flush curb-to-curb). Road casing looks faint in small previews but scales with export
width (A3 = 4961px ≈ 3.5× a 1400px preview).

**Wiring gotchas:**
- `city_blocks` has NO `overpassQuery`/`tagFilter` → excluded from the Overpass fetch
  loop via `overpassLayers = selected.filter(l => l.overpassQuery)` in `doExport`. It's
  computed from the roads/water/parks results, so those must be selected (all `defaultOn`).
- `renderLayerSVG` checks the `city_blocks` branch **before** the empty-elements guard
  (no fetched elements; renders from `ctx.precomputedBlocks`).
- Live preview skips `city_blocks` (too heavy to recompute on debounce).
- Verified against the Ghent bbox `51.06024,3.71797,51.06589,3.73428`: 65 blocks,
  cream curb-to-curb, matches the reference.

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
- **Endpoint racing for single-tile (Jun 2026)** — small/single-tile exports used only ONE endpoint (whichever worker grabbed the lone tile first), so a slow/overloaded server stalled the whole export for minutes. Fix: `OVERPASS_ENDPOINTS` reordered to put `overpass-api.de` first (+ added `overpass.kumi.systems`), and `fetchTileCombinedRace` fires the combined query at ALL available endpoints via `Promise.any`, returns the first success, aborts the losers. `doExport` uses the race when `tiles.length === 1`, the pinned pool otherwise. Brought a 1.5 km export from minutes to ~10–15 s (Overpass server compute now dominates; cached tiles are instant on re-export).
- **§4.1 iterative Douglas-Peucker** (`2198ea7`) — `dpSimplify` rewritten with an explicit stack + `Uint8Array` keep-bitset. Identical output to the recursive version (no ordering change); avoids O(n) slice allocations per frame.

### Roads query (Apr 2026)
`service` and `track` highway types were dropped from the roads query and all downstream lookups (preset colors, `ROAD_WIDTHS`, `ROAD_DRAW_ORDER`, `TYPE_LABELS`). For Tilburg this cut elements from 13,702 → 11,305 (-17.5%) and wire size from 8.7 MB → 5.5 MB (-37%). The `street_labels` supersession is unaffected (it never included service/track).

If users report missing driveways or farm tracks, restore `service` and/or `track` as a deliberate decision.

### Pre-commit hook (updated 2026-07-08 — no longer minifies)
`.githooks/pre-commit` only enforces the CHANGELOG rule now (a commit touching
app source must also stage a `CHANGELOG.md` entry). It does not run
`tools/minify.sh` or touch `script.min.js`/`style.min.css` — those are built
**only** by the GitHub Actions deploy workflow, right before rsyncing to
production, and should never exist in a local checkout.

### Test harness
See `tests/README.md` — the authoritative, current list (the harness has grown well past the original five scripts: label-engine unit tests, svg-lint, the end-to-end `real-export.mjs` with seven named areas and `--engine=v2`, and the v2 coverage/geometry checks `coverage-lint.mjs`, `render-coverage.mjs`, `sea-sign.mjs`, `hamlet-grounding.mjs`).

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
4. `compute_blocks` — Web Worker computes city blocks (conditional, only when layer selected).
5. `render_svg` — per-layer tick, 70–98%.
6. `finalize` — 98–100%, `wrapSVG` + history write.

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
