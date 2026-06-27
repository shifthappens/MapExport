# tests/ — Overpass pipeline regression harness

Plain Node.js (18+) scripts. No framework, no deps.

Reference area: **Tilburg** bbox `51.530,5.040,51.590,5.130` (~6.6 km N/S × 6.3 km E/W, multi-tile). Single fixed area for every test so numbers are comparable across runs.

## Workflow

1. **Capture baseline fixtures** (do this once, on `main` or any known-good commit):
   ```
   node tests/capture-fixtures.mjs
   ```
   Writes `tests/fixtures/tilburg/{layer-id}.json` + `_meta.json`. Commit these alongside baseline query strings.

2. **After modifying queries in `script.js`**, run:
   ```
   node tests/query-equivalence.mjs
   ```
   For each layer, runs the *current* query against Overpass and asserts the result set is a **superset** of the frozen fixture element ids. Fewer elements = regression.

3. **Render equivalence** (for changes that preserve data but should also preserve SVG output shape):
   ```
   node tests/pipeline-equivalence.mjs
   ```
   Loads fixtures, runs them through each layer's `tagFilter`, compares per-layer element counts against `_meta.json`.

4. **Supersession check** (for §1.1 — always run after editing `SUPERSESSIONS` or any overlapping layer's `overpassQuery` / `tagFilter`):
   ```
   node tests/supersession.mjs
   ```
   Parses `SUPERSESSIONS` out of `script.js`, asserts each rule's `strip` literal appears verbatim in the subordinate's `overpassQuery('BBOX')` (catches drift after query edits), and feeds the superseders' fixtures through the subordinate's `tagFilter` to confirm coverage is a superset of the subordinate's own fixture-after-tagFilter. `PARTIAL` is informational (one rule rarely covers every sub-statement); hard-fails only if the pool is empty while `ownMatched` is non-empty.

5. **Smoke script** wraps 2 + 3:
   ```
   bash tests/smoke.sh
   ```

6. **Live real-world export + faithful visual check** (standard demo/verification of actual SVG output):
   ```
   node tests/real-export.mjs [s,w,n,e] [a4_300|a3_300|a2_300|a1_300]
   ```
   Runs the **shipped** `script.min.js` headlessly (vm + browser stubs) against the live `lamp` Apache on **:8080**: fetches every default-on layer through `cache.php` (misses hit Overpass with a descriptive User-Agent and write the tile back), computes city blocks via `BLOCK_WORKER_SRC` + ClipperLib, and writes `exports/map-<preset>-<YYYY-MM-DD-HHMMSS>.svg` (committed as a progress trail). Requires `lamp start`.

   Then **always** verify it in a real browser — never trust `qlmanage`/QuickLook (Apple's SVG rasterizer mishandles `dominant-baseline`, `paint-order` and `fill-rule`). Use the preview MCP on **:8889** (it can't share :8080 with Apache):
   - `preview_start "MapExport (PHP)"`
   - navigate to `http://localhost:8889/mapexport/tests/viewer.html?file=/mapexport/exports/<name>.svg`
   - `preview_resize` **after** the page reports `ready` (e.g. 1500×1380), then `preview_screenshot`
   - inspect for sane cartography: labels centred on roads, no overflow/mirroring/stray labels, rotated `<text>` for straight streets and `textPath` for curved.

   See `memory/reference_lamp_server.md` for the gotchas (resize-after-load, Overpass UA, two-port split).

## Files

- `lib.mjs` — shared helpers: Tilburg bbox, Overpass POST, parse LAYER_REGISTRY out of script.js.
- `capture-fixtures.mjs` — writes baseline fixtures.
- `query-equivalence.mjs` — post-change regression check (hits Overpass, rate-limited).
- `pipeline-equivalence.mjs` — offline check against frozen fixtures.
- `supersession.mjs` — offline check for `SUPERSESSIONS` rules + tagFilter coverage.
- `smoke.sh` — runs query-equivalence + pipeline-equivalence.
- `real-export.mjs` — live headless export against the :8080 stack → `exports/*.svg`.
- `viewer.html` — renders an export inline for the faithful browser visual check (preview MCP on :8889).

## Notes

- Overpass output is **not byte-stable** across time (OSM data churns). Element **id sets** are stable over days/weeks — that's what we assert on.
- Rate limiting: the query-equivalence script sleeps 2s between layer requests and uses the same endpoint pool as the browser.
- Fixtures can get large (MB). Keep only Tilburg; don't accumulate more areas unless justified.
