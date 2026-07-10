# Plan: export engine v2 — paint-order blocks, declarative area features

**Status: READY TO IMPLEMENT (2026-07-10)** — full re-architecture of the map
*construction* stage as a second engine next to v1, behind a UI toggle. v1
(`script.js` pipeline) stays untouched and remains the production engine until
v2 is validated city-by-city. Decisions below were agreed with Coen on
2026-07-10 after a gap analysis of the v1 pipeline.

## Why

v1 guarantees land coverage by construction (blocks = bbox minus buffered
roads/water/parks) but pays for it with a growing pile of exceptions to avoid
painting cream over water: waterway buffer winding, island checks,
hole-aware interior points, per-tag water/green recognition fixes. Every one
of those was a reactive bugfix (see CHANGELOG 2026-07-05 .. 2026-07-10). v2
keeps the coverage guarantee but replaces the heuristics with three
deterministic mechanisms: a trivial building-presence test per face, paint
order (blocks under water/green), and a final coverage pass that turns any
leftover unpainted land into a generic cream block.

## Core model

### Blocks

1. **Faces** = bbox minus buffered block-cutting roads (same `BLOCK_ROADS`
   set, same widths, same `ROAD_TUCK` under the casing as v1 — "van stoep tot
   stoep" is unchanged). Footway/cycleway/path/steps still never cut.
   Tunnels (`tunnel=yes|culvert`) are excluded from the cutter input.
   Railways stay in the cutter set exactly as in v1 (amended 2026-07-11):
   they cut mechanically like roads, and without them rail corridors would
   repaint cream instead of staying open — a visual-parity break, and rail
   is a hard block boundary in the USE-IT style anyway.
2. **Buildings are always fetched** for the export bbox as bounding boxes
   (`out tags bb`; measured 2026-07-10: 23,662 buildings / 281 KB gzipped
   for central Ghent). They serve two purposes: classifying faces, and
   forming hamlet blobs. v1's on-demand second fetch disappears.
3. **Small faces containing at least one building** become city blocks:
   cream, with known water/green areas subtracted mechanically (plain
   Clipper difference — no heuristics; a pond inside a block becomes an
   evenodd hole again, which was never the hard part). Blocks additionally
   paint **below** water, waterways and green, so even a missed overlap can
   never show cream over water. Block edges thus genuinely end at the
   water/green boundary, per the original spec.
4. **Small faces without buildings** get no block in this primary pass.
5. **Large faces** (>= `COUNTRYSIDE_MIN_KM2`, 0.35 km² as in v1) are not
   cream-filled (one farmhouse must not turn a huge rural face into a
   cream slab). Inside them, hamlet blobs are built from the
   already-fetched building bounding boxes (dilate 18 m / erode 10 m),
   exactly the v1 hamlet code. The dilate radius is the tuning knob for
   how far apart rural buildings may sit and still merge into one block
   (18 m bridges ~36 m gaps); it only applies inside large faces, so
   raising it never affects city blocks. Start with v1's values (tuned on
   the Nièvre exports) and adjust during milestone 7 validation.
6. **Coverage fallback pass (final phase, decided by Coen 2026-07-11):**
   after all layers are assembled, land inside small faces that no layer
   painted (face minus blocks, water, green, landcover, road buffers) is
   emitted as generic cream blocks in a separate `fallback_blocks` group —
   visually identical to city blocks, but structurally distinguishable and
   counted/reported per export, so OSM data gaps stay visible instead of
   silently blending in. Countryside faces are exempt (intentionally
   background). The v1 water-test heuristics (winding, interior points,
   island checks) stay dead: nothing in this pipeline ever asks "is this
   face water?".
7. Face `minArea` (400 px², traffic-island confetti guard) applies to both
   primary blocks and fallback patches.

Consequence accepted by Coen: in the layered SVG, `city_blocks` sits below
water instead of above (pure safety; with the subtraction in place the
overlap should be nil).

### Cream colour

v1 renders blocks as `#FEF6ED` at `fill-opacity="0.8"` over white — a pure
style choice from commit `a7ab512`. v2 bakes the flattened colour: solid
`#FEF8F1`, no opacity attribute. All other colours/widths/dashes come from
the existing `PRESETS.useit` constants, ported verbatim.

### Area features: one declarative table

A single ordered table `AREA_FEATURES`: each row is
`{ match(tags), category }`, each category maps to exactly one layer +
paint style. First matching row wins (specific before generic:
`leisure=park` before `landuse=grass`). Adding a forgotten OSM tag later is
one table row, never a new code path.

- **Only render-distinct categories get a row.** Anything that would render
  cream anyway (`landuse=residential`, plain grass, gardens, flowerbeds) is
  neither fetched nor rendered — the cream face below already covers that
  land. This keeps v1's "named parks only, not every scrap of green" look
  and avoids the 776-stray-patches failure mode measured in Ghent.
  Probe data backing this (central Ghent, 2026-07-10): the full
  Map-Features-style bundle is dominated by micro-green
  (1,194× `landuse=grass`, 235× `leisure=garden`, 120× `landuse=flowerbed`)
  that must not render; the whole bundle is only 615 KB gzipped / 2,518
  elements / ~5 s, so fetch cost is a non-issue either way.
- **Geometry gate before the table:** only closed ways and multipolygon
  relations pass; nodes and open ways are discarded (`place=square` as a
  node can't paint an area). `stitchMultipolygonRings` is ported as-is.
- **Two deliberate coded exceptions**, not table rows:
  - **Coastline/sea** — `natural=coastline` open ways, stitched and closed
    against the bbox on the water side, producing a sea polygon that then
    flows through the normal water path. This folds in
    `plans/2026-07-07_coastline-sea-fill.md` unchanged.
  - **Pedestrian squares** — shared `looksLikeSquare` predicate; the square
    area renders as a filled polygon in road-surface colour and its
    perimeter is excluded from road stroking (folds in item A of
    `plans/2026-07-07_squares-and-tunnels.md`).
- Starter categories (colours = existing preset values): water
  (natural=water|bay, waterway=riverbank|dock, landuse=reservoir|basin,
  leisure=marina|swimming_pool), green (v1's named-park set plus pitch,
  stadium, sports_centre, golf, dog_park, nature_reserve), countryside
  landcover (farmland/meadow → field, wood/forest → park colour), plus
  aeroway/military/power area rows where they should read differently from
  cream. Exact rows are tuned during implementation against the five visual
  cities; the coverage lint is the guard that nothing was dropped that
  mattered.

### Draw order (v2)

```
background, landcover, city_blocks (cream faces + hamlet blobs),
water_bodies (incl. sea), waterways, green/parks, roads,
rail, tram, metro, transit_stops, water_labels, street_labels
```

Only `city_blocks` moved (was above water in v1). Everything from `roads`
onward keeps v1 semantics: two-pass casing/fill (all casings then all fills,
never per-street pairs), sub-groups per highway class in `ROAD_DRAW_ORDER`,
path classes as dashes with the white twin clipped over green/blue, rail
sleepers, metro palette, tram — ported with their constants. Feature labels
stamp the shared collision grid before street labels, as in v1.

### Roads and tunnels

Same rendering as v1. New: `tunnel=yes|culvert` segments are dropped from
the surface network (drawn lines AND cutter input); bridges and
`tunnel=building_passage`/`covered` stay (item B of the squares-and-tunnels
plan).

### Labels

**Port, don't rewrite.** The full v1 engine moves over: placement (coverage
scan, `bendOver`/`MAX_TURN` gates, straight-vs-curved via
`fitStraightBaseline`), repeats with shrink floor, same-name suppression,
canvas gates + two-tier visible-first placement, one shared collision grid
including rail-corridor stamping, abbreviations, `endPad` junction margins,
squares and roundabouts, and both emission pipelines — standard
(`<text>` straight / `<textPath>` curved) and Illustrator (per-glyph with
`ARIAL_ADVANCE_WIDTHS`, baked `CAP_HALF` baseline, no `dominant-baseline`,
font-weight snapping, root-level defs). Allowed changes during the port:
readable naming and low-hanging simplifications with zero behaviour change,
verified by running the existing label tests against the ported code.

## Code layout

- **`engine-v2.js`** — new file, loaded by `index.html` next to `script.js`.
  Owns the v2 pipeline: face cutter (Clipper worker), `AREA_FEATURES` table +
  registry, layer builders, orchestration. Written in the readable style
  Coen asked for: full variable names, one statement per line, no golfing —
  the minifier handles production.
- **Shared with v1** (from `script.js`): projection, tile/cache/fetch
  plumbing (endpoint rotation + backoff — the 2026-07-10 probe saw
  kumi.systems and private.coffee time out on every attempt while .de
  intermittently 504'd even with "2 slots available", so backoff stays),
  `cache.php` keys (v2 queries hash differently and cache separately for
  free via `layerQHash`), UI, print envelope (67.5 × 40.5 cm @ 300 dpi),
  `PRESETS`, SVG wrappers. Where a shared function is currently hard-wired
  to `LAYER_REGISTRY`, parameterise it over a registry argument (small,
  behaviour-neutral v1 refactor) rather than copying it.
- **UI toggle** — an "Engine v2 (experimental)" switch in the export
  options; default off. v1 remains the default until sign-off.
- Deploy: `engine-v2.js` joins the minify + rsync whitelist only when v2
  ships; until then it is dev/test only. No deploy is triggered by this work.

## Overpass strategy

One combined v2 bundle per tile through the existing tile/cache mechanics
(same 0.1° grid, same batch cache probe). Measured cost for a central-Ghent
export bbox: 615 KB wire / ~5 s server time with `out geom` — comparable to
v1's parks+landcover fetch, and the real bundle will be smaller because
cream-equivalent categories are not fetched at all. Buildings (`out tags
bb`) are part of every export fetch. Coastline rides in the water fetch.

**Principle (Coen, 2026-07-11): Overpass cost or flakiness must never drive
the architecture.** If robustness demands heavier queries, so be it —
server load is an ops problem, not a design input.

## Verification

- `tests/real-export.mjs` gets an engine flag; every existing lint runs
  against v2 output: `svg-lint` (labels, off-canvas, rail crossings) and
  `coverage-lint` (the white-gap guard — this is the safety net that
  replaces v1's coverage-by-construction reasoning).
- Label unit tests (`label-fit`, `label-placement`, `abbreviate`) run
  against the ported v2 label engine.
- Five visual cities (Tilburg, Ghent, Paris, Bremerhaven, Oulu) exported
  with both engines and compared side by side; Bremerhaven/Oulu double as
  the coastline/sea acceptance cases, Erfurt as the river-island case
  (must render correctly through classification, subtraction and paint
  order alone, with none of v1's island machinery).
- Acceptance: zero lint errors, coverage lint green on all test cities,
  visual parity with v1 except the agreed improvements (sea, squares,
  tunnels, flattened cream).

## Milestones

Checkbox state below is the single source of truth for progress. **Tick a
box (and note partial state in a sub-bullet) in the same commit as the
milestone work** — a session resuming cold must be able to read this list
and know exactly where to pick up.

- [x] 0. Query cost measured 2026-07-10 (numbers above).
- [x] 1. Scaffold done 2026-07-11: `engine-v2.js` (single IIFE exposing
      `EngineV2 = { layers, layerOrder, buildSVG, doExport }`), UI toggle
      `#engine-v2-toggle`, `--engine=v2` flag in `tests/real-export.mjs`.
      - No v1 refactor was needed: `fetchLayer`/cache/`layerQHash` were
        already parameterised by layer objects. v2's only script.js hook is
        a 3-line branch at the top of `doExport()`.
      - v2's roads layer IS v1's registry object (looked up, not copied) —
        same query hash, shared cache. Roads render proven byte-identical
        to v1 on the same input.
      - Combined-tile Overpass bundling deferred to milestone 3 (v2 uses
        per-layer `fetchLayer` until the area bundle exists).
      - Engine v2 is local/test-env only until it ships (Coen,
        2026-07-11): the script tag AND the UI toggle sit between
        `engine-v2:start`/`end` marker comments in `index.html`, and
        `deploy.yml` deletes every marker block from the production
        index. Anything v2-visible added to `index.html` later must go
        inside such markers.
- [ ] 2. Face cutter: faces, building classification, cream blocks below
      everything, countryside threshold, hamlet blobs.
- [ ] 3. `AREA_FEATURES` table: water, green, landcover, coastline/sea;
      water/green subtraction from block shapes; coverage fallback pass
      (needs the painted layers, so it lands here).
- [ ] 4. Rail/tram/metro/transit port, path dashes + white twin.
- [ ] 5. Labels port (street + feature), both emission pipelines.
- [ ] 6. Squares + tunnels rules.
- [ ] 7. Test-harness integration, five-city + Erfurt validation,
      side-by-side review with Coen.
- [ ] 8. (Separate decision) deploy integration.

Each milestone that changes app behaviour gets its CHANGELOG entry in the
same commit, per house rule.

## Working method (binding for any session doing this work)

- **Delegate heavy work to cheaper agents** (fable-chief-agent pattern):
  discovery/reading of `script.js`, mechanical porting, and test runs go to
  Haiku/Sonnet-tier agents; architecture calls, tricky geometry code and
  final review stay with the lead model. Never read all of `script.js`
  into the lead context — use the anchors below plus targeted greps.
- **Code style:** full variable names, one statement per line, no golfing —
  the minifier makes it prod-ready. Comments are concise and explain *why*,
  never *how*; the code itself carries the how.
- **v1 stays untouched** except the small behaviour-neutral refactor that
  parameterises shared plumbing over a registry argument. Everything else
  lands in `engine-v2.js`. Toggle default off.
- **Resume procedure after an interrupted session:** read this plan
  (milestone checkboxes + sub-bullets = state), `git log` since the last
  plan commit, and the project memory index. No other state exists outside
  the repo.

### v1 anchors in `script.js` (as of cc1034f; the countryside commit
72809ec shifted later anchors by up to ~230 lines — re-grep, names are
stable)

| What | Where |
|---|---|
| `OVERPASS_ENDPOINTS` (rotation + backoff) | ~734 |
| `LAYER_REGISTRY` | ~247–321 |
| `ROAD_WIDTHS` / `PATH_STYLES` | ~372–386 / ~395–400 |
| `buildRoadsLayer` (two-pass casing/fill) | ~1208 |
| `buildLabelsLayer` (both emission pipelines) | ~1591 |
| Block worker (`BLOCK_WORKER_SRC`, Clipper) | ~2158–2535 |
| `prepareBlockData` (incl. hamlet dilate/erode) | ~2565–2686 |
| `LAYER_ORDER` | ~2958 |
| Blocks render (`fill-opacity`, evenodd) | ~2772–2795 |

v1 is frozen during this work, so these drift only if the registry
refactor lands first — re-grep after that commit.

## Risks

- **Label port regressions** — mitigated by running the existing label test
  suite against the port before any visual review.
- **Fallback patches mask data gaps in print** (they look like normal
  blocks by design) — mitigated by the separate `fallback_blocks` group and
  the per-export count/report, so gaps are visible to us even when the map
  looks fine.
- **Render-distinct table too small** (something that should read as
  water/green renders cream). Note the coverage lint cannot see this case —
  the land IS painted, just in the wrong colour. The guards are the
  side-by-side city comparison in milestone 7 and the rule that a miss is
  fixed by adding a table row, never new code.
- **Overpass flakiness** — existing rotation/backoff; no new exposure since
  the v2 bundle replaces, not adds to, the v1 area queries.

## Retires / folds in

- `plans/2026-07-07_coastline-sea-fill.md` (folded into milestone 3)
- `plans/2026-07-07_squares-and-tunnels.md` (folded into milestones 2/6)

Mark both plans' Status lines as folded into this plan when milestone work
starts on them.
