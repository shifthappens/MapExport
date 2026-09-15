# Active checkpoint

- **Updated:** 2026-09-15
- **Roadmap:** `plans/2026-07-14_codebase-maintenance-priorities.md` (Sprint 4, ME-08a).
- **Unit:** ME-08a — generate v1/v2 export pairs for the seven validation cities.
- **Status:** COMPLETE. All 7 cities have a v1 and v2 export pair, offline suite
  green. ME-08a's comparison/classification step and ME-08b (Coen's visual
  sign-off) have not started.

## Completed checkpoint

- `tools/prefetch-validation-cache.mjs` now derives all v1+v2 fetchable
  layers (108 cache keys for the seven-city export grid, up from 80 — v2
  folds v1's separate water_bodies/waterways/parks/landcover into one
  combined `area_features` query, so those 4 keys per city were never
  covered before). `tools/pin-cache.sh` docs updated to match.
- `cache/pinned/` for the seven validation cities is **108/108 pinned**, all
  fetched live and verified (`bash tools/pin-cache.sh status` — 0 gaps).
  Took three rounds (`tools/pin-cache.sh refresh` twice, hit its 60-min
  deadline both times under heavy Overpass instability across all 3
  mirrors; then `node tools/prefetch-validation-cache.mjs --max-runtime=0`
  run directly — skips already-cached keys, so it only chased the last 7 —
  finished in under 4 minutes).
- **Found a `pin-cache.sh` bug, not yet fixed:** when `refresh` hits its
  deadline, the prefetcher exits non-zero and `set -e` skips the trailing
  `cmd_pin` call — everything fetched during that run stays live but never
  gets pinned. Had to run `tools/pin-cache.sh pin` by hand after both
  deadline hits to actually pin the progress. Worth a real fix (e.g. run
  `cmd_pin` in the EXIT trap, or `|| true` the prefetch call) — ask Coen.
- Stale v1 `roads` floors (all predating the roads/paths split, same root
  cause `ae6ffe4` fixed for the `*-v2` entries but not these) re-recorded in
  `tests/expectations.json` for **tilburg, ghent, oulu, erfurt, bremerhaven**.
  Paris and nièvre never had v1 floors recorded at all — their exports pass
  on the generic checks only; not recorded (wasn't asked).
- Generated v1 exports (`node tests/real-export.mjs <city>`, no `--engine=v2`)
  for all 7 cities: tilburg, ghent, oulu, erfurt, bremerhaven, paris, nièvre.
  All pass. v2 exports for all 7 were already done earlier in the sprint.
- **Diagnosed (not fixed) a second v1/v2 cache-key mismatch**, distinct from
  the water_bodies/parks one above: v1's on-demand countryside-building fetch
  (`BLOCK_BUILDINGS_LAYER`, `script.js:4607`) uses the raw export bbox and the
  layer's default `overpassQuery`, while v2's `buildingsLayer`
  (`engine-v2.js:48`) overrides `overpassOut: 'body geom'` *and* pads the bbox
  via `padBboxMeters()` (`engine-v2.js:4005`) — two independent differences,
  so the cache keys never match. Confirmed live on oulu, bremerhaven and
  nièvre (all have countryside faces); erfurt/tilburg/ghent/paris have none
  and never trigger it. Each affected city's v1 export costs exactly one
  unplanned live Overpass call for `block_buildings` the first time — now
  cached, so it won't repeat for the same city/bbox. Ask Coen if/when to fix.
- Checked the separate **workshop** fine-grid cache (`tools/workshop-cities.json`,
  `--grid=fine`) locally: 833/833 of the layers the workshop actually needs
  (v2-only) are pinned. The extended key list now also expects the 4
  v1-only layers there (252 keys), which the workshop never needs since it's
  v2-only — not a real gap, just a side effect of the key-list extension
  above being generic across corpora. Whether the **live server's**
  `cache/pinned/` (placed manually by Coen over root SSH, not part of the
  deploy pipeline — `cache/` is deliberately excluded from `deploy.yml`'s
  rsync whitelist) is equally complete is **unverified** — admin SSH to the
  production host was blocked by this session's own safety policy
  (sensitive remote exec). Coen needs to check this himself before the
  workshop (in 2 days) or grant this session permission to do it.

## Latest checks

- `bash tests/smoke.sh` — PASS.
- `node tests/real-export.mjs <city>` for all 7 cities (v1) — PASS.
- `bash tools/pin-cache.sh status` — 108/108 pinned, 0 gaps.

## Next action

Ask Coen:
1. Fix the `pin-cache.sh` deadline/`cmd_pin` bug?
2. Fix the `block_buildings` v1/v2 cache-key mismatch (query params + bbox
   padding), or leave it (low cost: one extra live call per affected city)?
3. Record v1 floors for paris/nièvre too, or leave them floor-less?
4. Verify/refresh the **live server's** workshop fine-grid pinned cache
   himself before the workshop in 2 days — this session could not SSH in.

Once resolved: start ME-08a's comparison/classification of the 7 v1/v2
export pairs now sitting in `exports/`, then ME-08b (Coen's visual sign-off).

## Constraints

No commit, push or deploy was performed. Two `tools/pin-cache.sh refresh`
runs and one direct `prefetch-validation-cache.mjs` run were done with
Coen's explicit go-ahead; no further Overpass refresh without asking.
Preserve the unrelated local `cache/.ratelimit/rl_363baea9cba210af` change.
