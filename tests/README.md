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

4. **Smoke script** wraps the three:
   ```
   bash tests/smoke.sh
   ```

## Files

- `lib.mjs` — shared helpers: Tilburg bbox, Overpass POST, parse LAYER_REGISTRY out of script.js.
- `capture-fixtures.mjs` — writes baseline fixtures.
- `query-equivalence.mjs` — post-change regression check (hits Overpass, rate-limited).
- `pipeline-equivalence.mjs` — offline check against frozen fixtures.
- `smoke.sh` — runs 2 + 3.

## Notes

- Overpass output is **not byte-stable** across time (OSM data churns). Element **id sets** are stable over days/weeks — that's what we assert on.
- Rate limiting: the query-equivalence script sleeps 2s between layer requests and uses the same endpoint pool as the browser.
- Fixtures can get large (MB). Keep only Tilburg; don't accumulate more areas unless justified.
