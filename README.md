# MapExport — USE-IT City Map Builder

Browser-based tool that generates publication-ready SVG city maps from [OpenStreetMap](https://www.openstreetmap.org/) data. Draw a rectangle on any city in the world, pick your layers, and get an Illustrator/Inkscape-compatible SVG with named layers — ready for print design work.

Built for [USE-IT](https://use-it.travel), a European network of tourist info offices that produces free city guides. Each guide needs a hand-drawn-style city map; this tool automates ~80% of that cartography work.

## How it works

1. User draws a bounding box on a Leaflet map
2. The app queries the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) for OSM features (roads, water, parks, etc.)
3. Road-bounded city blocks are computed via boolean geometry (ClipperLib)
4. Street labels are placed with collision detection and abbreviation
5. Everything is rendered into a layered SVG with Inkscape-compatible metadata

The output SVG has individually named and grouped layers (`inkscape:groupmode="layer"`), so designers can immediately recolor, rearrange, and annotate in Illustrator or Inkscape.

## Project structure

```
.
├── index.html             # Single HTML entry point (loads script.js/style.css directly, always)
├── script.js              # All application logic (v1 engine + shared UI/fetch/labels, source of truth)
├── engine-v2.js           # Experimental v2 map-construction engine (behind a UI toggle)
├── ENGINE-V2.md           # v2 design contract — binding invariants, read before changing engine-v2.js
├── style.css              # UI styles
├── cache.php              # Server-side Overpass response cache (PHP)
├── fonts/                 # Mayonnaise Black + Apfel Grotezk (WOFF2)
├── tests/                 # Node.js regression harness (no deps) — see tests/README.md
│   ├── lib.mjs            # Shared helpers (bbox, Overpass POST, registry parser)
│   ├── smoke.sh           # Runs the offline suites + query-equivalence
│   ├── real-export.mjs    # End-to-end headless export (v1 and --engine=v2), pass/fail checks
│   ├── coverage-lint.mjs / render-coverage.mjs   # v2 coverage promise (model + rendered ink)
│   ├── svg-lint.mjs / label-placement.mjs / label-fit.mjs
│   ├── export-failures.mjs                       # v1/v2 fail-closed export lifecycle
│   ├── sea-sign.mjs / hamlet-grounding.mjs       # v2 offline geometry checks
│   ├── query-equivalence.mjs / pipeline-equivalence.mjs / supersession.mjs
│   ├── road-merge.mjs / abbreviate.mjs
│   ├── expectations.json  # Recorded per-area floors/allowances (--record, human-approved)
│   └── fixtures/tilburg/  # Baseline Overpass responses for regression
├── references/            # Design reference files (tutorial PDF, Ghent .ai sample)
├── memory/                # Architecture docs and session notes
├── plans/                 # Implementation plans (dated; Status line at top of each)
└── LICENSE                # GPL-3.0
```

### Source of truth

`script.js` is the canonical source, and `index.html` loads `script.js` / `style.css` directly, always — dev, tests, and this repo have **no build step**. `script.min.js` and `style.min.css` are generated on demand by the tracked build script `tools/minify.sh` (terser for JS, clean-css for CSS), are **gitignored, never committed, never needed to run or test the app**, and only ever get built by the GitHub Actions deploy workflow, right before rsyncing them to production. They should exist there and nowhere else. Never edit the minified files directly. See [Build](#build).

## Tech stack

| Component | Technology |
|-----------|-----------|
| Frontend | Vanilla JavaScript — no framework, no bundler |
| Map UI | [Leaflet.js](https://leafletjs.com/) with OpenStreetMap tiles |
| Geometry | [ClipperLib](https://sourceforge.net/projects/jsclipper/) (polygon boolean ops via CDN) |
| Async compute | Web Workers (city block computation) |
| Data source | [Overpass API](https://overpass-api.de/) (OpenStreetMap query engine) |
| Cache backend | PHP 7.2+ (`cache.php`) — stateless, gzip-compressed, 7-day TTL |
| Tests | Plain Node.js 18+ scripts, zero external dependencies |

## Local development

### Requirements

- A web server with PHP support (Apache + mod_php, or PHP's built-in server)
- Node.js 18+ (for tests only)
- A modern browser

### Quick start

No build step — `index.html` loads `script.js` / `style.css` straight from source, so editing and reloading is all you need.

Using PHP's built-in server:

```bash
php -S localhost:8889
```

Then open `http://localhost:8889` in your browser.

For a full Apache + PHP setup (enables persistent caching):

```bash
# Ensure the cache directory exists and is writable
mkdir -p cache
chmod 775 cache
```

Serve the project root through Apache with PHP enabled. The `cache/` directory must be writable by the web server user (e.g. `www-data`).

### Cache

`cache.php` stores Overpass API responses as gzip-compressed JSON files in `cache/`. Cache keys follow the format `mapexport_v3_{layerId}_{queryHash}_{tileCoords}` where the query hash (FNV-1a → base36) automatically retires stale entries when layer definitions change.

Endpoints:

- `GET cache.php?key=...` — retrieve a cached response
- `POST cache.php?key=...` — store a response (accepts plain JSON or gzip)
- `GET cache.php?exists=k1,k2,...` — batch probe up to 64 keys (returns `{k:bool}`)

Writes are guarded (the endpoint is public by design — browsers fetch Overpass
from their own IPs and share results back, which keeps Overpass load off any
single server IP): uploads must be JSON shaped like an Overpass response
(an `elements` array), at most 8 MiB compressed / 80 MiB decompressed, are
staged to a temp file and renamed into place atomically, and each IP gets at
most 300 writes per 10 minutes (429 beyond that — the app just treats it as a
cache miss). A sweep during writes proactively drops entries past the 7-day
TTL and prunes oldest-first whenever `cache/` exceeds 2 GiB. All knobs have
`MAPEXPORT_CACHE_*` env overrides (see the top of `cache.php`), used by
`tests/cache-php.mjs`.

## Architecture

### Layer registry

All map features are defined in `LAYER_REGISTRY` — an array of layer objects with:

- `id` — unique identifier (used in SVG layer names and cache keys)
- `overpassQuery(bbox)` — Overpass QL template for fetching data
- `tagFilter(element)` — filters elements from a superseder's response
- `type` — `'area'`, `'line'`, `'roads'`, `'rail'`, `'labels'`, `'point'`, `'derived'`
- Rendering hints: `fillOpacity`, `strokeWidth`, `strokeColor`, `color`

Current layers: `water_bodies`, `waterways`, `parks`, `landcover`, `city_blocks` (derived), `roads`, `street_labels`, `rail`, `metro`, `tram`, `transit_stops`, `water_labels`. (`block_buildings` is fetched on demand for hamlet detection, outside the registry; engine v2 adds its own fetch-only and derived layers in `engine-v2.js`.)

### Render pipeline (`doExport`)

| Stage | Progress | Description |
|-------|----------|-------------|
| Plan tiles | — | `bboxToTiles(bbox)` — adaptive single-tile or grid (0.1deg cells) |
| Cache probe | — | `cacheExistsBatch` — one round-trip for up to 64 keys |
| Fetch tiles | 0–70% | Combine uncached layers into one Overpass query per tile. Worker pool with endpoint affinity, 429 backoff, streaming progress |
| Compute blocks | 70–90% | Web Worker: ClipperLib boolean ops (canvas minus road/water/park network) |
| Render SVG | 70–98% | Per-layer rendering via `renderLayerSVG` |
| Finalize | 98–100% | `wrapSVG` — XML header, metadata, background, layer groups |

The browser keeps the last successful full export and the live preview as
separate state snapshots. A reduced preview can therefore update after an
option change without changing the bytes or filename behind “Download last
export”; preview requests also carry engine and generation identity so stale
v1/v2 renders cannot replace a newer result.

### City blocks (derived layer)

The `city_blocks` layer produces the signature USE-IT look: solid cream shapes filling the space between streets, curb-to-curb. It has no Overpass query — blocks are computed from existing road/water/park geometry:

1. Collect the cutter network: roads (buffered by width), rail/tram/metro lines, waterways, park and water body polygons
2. Union all cutters via ClipperLib → `voidClean`
3. `blocks = canvas - voidClean` (difference operation)
4. Douglas-Peucker simplify each block
5. Each block → `<path id="block_N" inkscape:label="Block N">`

Engine v2 (`engine-v2.js`, behind a UI toggle, experimental) replaces this whole construction stage — faces, countryside/hamlet classification, the synthetic sea, and a full-coverage guarantee — while sharing v1's fetch, label and road/area rendering code. Its invariants live in `ENGINE-V2.md`; v1 stays the production engine until cutover.

### Street label engine

Name-centric label placement with cartographic quality:

- **Grouping**: all OSM way segments of the same street are stitched into runs (`mergeNamedWays`), then grouped by name. Label goes on the main (longest, highest-class) run.
- **Placement**: scans ~30 positions per run, sorted by straightness. Shrinks font progressively (x0.8) if collisions block all positions.
- **Collision**: ribbon-of-circles footprint along actual baseline, backed by a spatial hash grid (cell size 80px). Handles curved and diagonal labels correctly.
- **Orientation**: each `<textPath>` gets its own sub-path oriented left-to-right. No mirrored/upside-down labels.
- **Bend cap**: rejects placements where label would wrap >80deg (120deg hard cap at smallest sizes).
- **Abbreviation**: ~60 multilingual regex rules (Dutch, German, French, Spanish, Italian, Polish, Hungarian, Finnish, Turkish, Cyrillic). Applied only when full name won't fit.

### Road segment merging

`mergeNamedWays(elements)` stitches OSM ways sharing the same name + highway class into maximal polylines. Matches on shared OSM node IDs with coordinate fallback. This reduces SVG path count dramatically (Ringbaan-Zuid: 105 fragments → ~15 runs) and improves label placement.

### Overpass optimizations

- **Layer supersession**: when both a layer and its superseder are selected (e.g. `street_labels` + `roads`), the subordinate reuses the superseder's response via `tagFilter`, halving API calls
- **Global bbox hoisting**: per-statement `(bbox)` filters are hoisted to the Overpass global header
- **Endpoint-parallel workers**: multi-tile exports use one worker per Overpass endpoint
- **Single-tile endpoint racing**: `Promise.any` across all endpoints; fastest wins, losers are aborted
- **Batch cache probe**: one round-trip checks up to 64 cache keys
- **Query hash in cache key**: FNV-1a hash of the query string auto-retires stale cache entries
- **Adaptive tile delay**: starts at 350ms, increases on 429 responses, caps at 1500ms

## USE-IT color preset

| Element | Color |
|---------|-------|
| Background | `#ffffff` (white) |
| City blocks | `#FEF6ED` (cream) |
| Road fill | `#ffffff` (white) |
| Road casing | `#F4AFA7` (coral) |
| Water | `#A4DBF3` (blue) |
| Parks | `#51A886` (green) |
| Labels | `#2a2a20` (near-black) |

## Export options

| Option | Values |
|--------|--------|
| Print size | A4 (3508px), A3 (4961px, default), A2 (7016px), A1 (9933px), custom px |
| Simplify | Douglas-Peucker epsilon: 0.3 / 0.6 / 1.0 / 1.6 / 2.4 (slider 1–5) |
| Label visibility | Per road class toggles (motorway, primary, secondary, tertiary, residential, cycleway) |

All widths and sizes are tuned for A3 @ 300dpi. `getScaleFactor(W)` returns `W / 4961` to scale proportionally at other sizes.

## Testing

The test harness is plain Node.js with zero dependencies. Fixture-based tests use **Tilburg** (`51.530,5.040,51.590,5.130`) as the reference area; the end-to-end export test has seven named validation areas (Tilburg, Ghent, Paris, Bremerhaven, Oulu, Nièvre, Erfurt). See `tests/README.md` for the full workflow.

```bash
# Run the full smoke suite
bash tests/smoke.sh

# Individual tests
node tests/query-equivalence.mjs    # Live Overpass superset check (hits API)
node tests/pipeline-equivalence.mjs # Offline tagFilter partition check
node tests/supersession.mjs         # SUPERSESSIONS rule + coverage check
node tests/road-merge.mjs           # Road segment stitching (10 cases)
node tests/abbreviate.mjs           # Multilingual abbreviation (26 cases)
node tests/export-failures.mjs      # v1/v2 network + worker failure lifecycle
node tests/sea-sign.mjs             # Engine v2 coastline→sea geometry (offline)
node tests/hamlet-grounding.mjs     # Engine v2 hamlet place-node grounding (offline)

# End-to-end: real headless export against a local webserver on :8080
node tests/real-export.mjs <city> [--engine=v2]
```

### Fixture workflow

1. Capture baselines (once, on a known-good commit):
   ```bash
   node tests/capture-fixtures.mjs
   ```
2. After modifying any layer's `overpassQuery` in `script.js`, re-capture that layer:
   ```bash
   node tests/capture-one.mjs <layer-id>
   ```
3. Run regression checks:
   ```bash
   node tests/query-equivalence.mjs   # verifies new query is a superset of fixture
   node tests/pipeline-equivalence.mjs # verifies tagFilter partitions match
   ```

## Deployment

Deployment is a **GitHub Actions workflow**: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
manual-only (`workflow_dispatch`). Trigger it from the Actions tab, or
`gh workflow run deploy.yml` — the latter only needs `gh` auth, not a local
SSH key, so it also works from a Claude Code mobile session. It:

1. Runs `tools/minify.sh` fresh, so the minified assets it ships always come from the current source, never a stale copy.
2. Rewrites `index.html` on the way out (via `sed`) so the *deployed* copy loads `script.min.js` / `style.min.css` instead of the source files the repo's `index.html` uses for dev — pushes that rewritten copy separately, without touching the repo's `index.html`.
3. Rsyncs to the server as a **restricted, non-root deploy user** (not the admin's own SSH key) that only owns the handful of files/dirs it needs to update — see `memory/reference_deploy.md` for the full setup (dedicated unix user, sticky bit on the parent dir to protect `cache/`, credentials as encrypted GitHub Secrets, never committed).

`deploy.sh` at the repo root (gitignored) is a thin convenience wrapper around `gh workflow run` for deploying from a local checkout.

### Build

The build is tracked in the repo under `tools/` and `.githooks/` — no personal
scripts required. **`script.min.js` and `style.min.css` are gitignored build
artifacts, never committed, and never needed for local dev or tests** —
`index.html` loads `script.js` / `style.css` directly, and
`tests/real-export.mjs` tests `script.js` itself, so there's no build step to
run day-to-day. The **only** thing that ever invokes the minifier is the
GitHub Actions deploy workflow, right before syncing to production — these
files should exist there and nowhere else.

```bash
bash tools/setup-hooks.sh   # once per clone: points core.hooksPath at .githooks/
```

The tracked **pre-commit hook** (`.githooks/pre-commit`) only **enforces the
changelog**: a commit touching app source (`script.js`, `style.css`,
`index.html`, `cache.php`) must also stage a `CHANGELOG.md` entry, or the
commit is rejected. Bypass pure-internal churn with
`SKIP_CHANGELOG=1 git commit ...`. It does not minify anything.

You can also run the minifier directly to sanity-check it: `tools/minify.sh
[js|css|all]`. It prefers globally installed `terser` / `cleancss` and falls
back to `npx` (`npm install -g terser clean-css-cli` to avoid the npx fetch).
Delete the generated `script.min.js`/`style.min.css` afterwards — they're not
meant to linger in a local checkout. Any personal root-level `minify.sh` /
`deploy.sh` remains gitignored and is superseded by the tracked tooling.

## Key design decisions

- **No framework**: the entire app is vanilla JS (~3900 lines in `script.js` plus ~2000 in `engine-v2.js`). This keeps the dependency footprint at zero and avoids build complexity.
- **City blocks over building footprints**: earlier versions fetched individual building polygons from OSM. This was rejected — too realistic/cluttered for the USE-IT style. The current approach computes road-bounded faces as solid blocks, matching the hand-drawn look of existing USE-IT maps.
- **Server-side cache**: Overpass API has rate limits and can be slow. The PHP cache with 7-day TTL and query-hash invalidation makes re-exports near-instant and avoids hammering public endpoints.
- **Web Worker for blocks**: ClipperLib boolean operations on large areas can take seconds. Running in a Web Worker keeps the UI responsive.
- **Endpoint diversity**: three Overpass endpoints with failover, racing (single-tile), and parallel workers (multi-tile) provide resilience against any single endpoint being slow or down.

## Known limitations

- **Large area exports**: ClipperLib boolean operations can be slow for areas >10km x 10km. May need internal tiling for full-city exports.
- **Overpass rate limits**: public endpoints may return 429 during heavy OSM community usage. The app backs off adaptively but can't eliminate waits.
- **OSM data completeness**: output quality depends on how well the target city is mapped in OpenStreetMap. Well-mapped European cities produce excellent results; less-mapped areas may have gaps.

## License

[GPL-3.0](LICENSE)
