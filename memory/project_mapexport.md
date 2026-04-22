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
