# Plan: keep labels on the canvas + one collision grid for all labels

**Status: ready to implement** (written 2026-07-03, branch
`claude/testing-harness-improvements-mcbrb5`; line numbers refer to
`script.js` at commit `c9499f5` — the 2026-07-04 "labels stay inside their
street" fix shifted them somewhat, but every named function/const still
exists; re-locate by name. That fix also added `chordOf`/`offsetPolyline`
and an `endPad` inset in the candidate loop, none of which conflict with
this plan).

## Context

The new SVG lint (`tests/svg-lint.mjs`, added 2026-07-03) surfaced two
pre-existing label-engine defects in every export, including the approved
Tilburg/Ghent ones:

1. **Labels land outside the visible canvas.** Roads extend past the export
   bbox and the label engine doesn't know where the canvas ends, so per export
   ~20 street names are placed *entirely* outside `[0,W]×[0,H]` (invisible —
   clipped by `#map-clip`) and ~40 more are *partially* clipped at the edge.
   A clipped repeat is fine per se (a long street naturally runs off the map);
   the defects are (a) invisible placements, which still call `recordName`
   (`script.js:1273`) and consume the street's same-name budget so it can end
   up **nameless in the visible part**, and (b) streets whose *only* label is
   a clipped one.

2. **Street labels and feature labels can overlap each other.** Street labels
   share one footprint grid (`makeFootprintGrid`, `script.js:1200`); feature
   labels (parks/water/suburbs, `buildFeatureLabelsLayer`, `script.js:1477`)
   share a separate box grid (`makeCollisionGrid`, `script.js:1188`). The two
   never see each other, so "Leie" can print on top of "Korenlei" — ~60 cases
   in the Ghent export (all reported as lint warnings today).

The lint deliberately downgrades both defect classes to **warnings** so the
harness stays green on approved output. Part of this plan is flipping them to
errors once the engine is fixed.

## Where everything lives (script.js)

| Thing | Location |
|---|---|
| `makeCollisionGrid` (feature labels' private box grid) | `:1188` |
| `makeFootprintGrid` (street labels' circle-ribbon grid) | `:1200` |
| `buildLabelsLayer(elements, pr, W, H)` | `:1262` |
| footprint closures `fpR` / `fpLine` / `fpPath` / `fpFits` / `fpStamp` | `:1277–1281` |
| square/plaza emit (centroid, horizontal) | `:1364–1378` |
| roundabout emit (ring textPath / centred fallback) | `:1402–1418` |
| linear-street candidate loop (scan → sort by bend → place) | `:1426–1453` |
| `buildFeatureLabelsLayer(elements, pr, W, H)` | `:1477–1521` |
| label-builder dispatch in `renderLayerSVG` | `:1843–1844` |
| `LAYER_ORDER` (build **and** paint order) | `:1903` |
| `buildSVGContext` (per-export ctx — natural home for a shared grid) | `:1905` |

## Fix 1 — labels on the canvas: clipped only as a bonus, never as the only one

**Policy (per Coen, 2026-07-03):** a partially clipped label at the canvas
edge is acceptable — but only as a *supplementary* placement. Per street
(per name), if any label is placed at all, **at least one must be fully
visible**. Concretely:

- **Entirely outside** `[0,W]×[0,H]`: never place. Invisible, and it burns
  the street's same-name budget (see Context). No exceptions.
- **Partially clipped**: allowed only once the same street already has a
  fully-visible label in this export. E.g. Hart van Brabantlaan repeats its
  name several times, one of them cut off at the edge — fine.
- **Street with no fully-inside spot that fits** (a sliver poking into the
  map at the border): gets no label at all. Explicitly OK — such a street is
  "too tiny to realistically be considered part of the map". Do not fall
  back to a clipped-only label.

Implementation:

1. Inside `buildLabelsLayer`, add two helpers next to `fpFits` (`:1280`):
   ```js
   const fpInside =(fp,r)=>fp.every(p=>p[0]>=r&&p[0]<=W-r&&p[1]>=r&&p[1]<=H-r);
   const fpVisible=(fp,r)=>fp.some (p=>p[0]>=-r&&p[0]<=W+r&&p[1]>=-r&&p[1]<=H+r);
   ```
   (`W`/`H` are already parameters; circle radius `r` approximates the text's
   half-height, so `center±r` inside ≈ glyphs inside.)
2. Track which street names already own a fully-visible label, next to
   `placedByName` (`:1271`): `const fullyVisibleNames=new Set();`. This is
   per-name across ALL of a street's runs (the `pool` loop), matching how
   `nearName` budgeting works.
3. Linear candidate loop (`:1426–1453`) — two-tier placement per size step:
   - Split `cands` (already bend-sorted) into `inside` (passes `fpInside`)
     and `clipped` (fails `fpInside` but passes `fpVisible`); discard the
     entirely-outside rest.
   - Place from `inside` first (existing logic unchanged). On the first
     successful placement, `fullyVisibleNames.add(name)`.
   - Then, only if `fullyVisibleNames.has(name)`, continue placing from
     `clipped` up to the same `ideal`/spacing rules — these are the
     legitimate cut-off-at-the-edge repeats.
   - The font-shrink loop's early exit (`placedC.length>0` at `:1452`) stays
     driven by inside placements: never shrink the font just to squeeze a
     clipped label in.
4. Single-placement sites require full visibility (no "supplementary" concept
   applies): roundabout ring `:1405–1407`, its centred fallback `:1413–1414`,
   square/plaza `:1372–1373` — all `fpInside` or skip.
5. `buildFeatureLabelsLayer`: also single-placement → `fpInside` or skip (it
   becomes a ribbon footprint under Fix 2; until then use its box vs the
   canvas). Rivers/parks straddling the edge lose their name in this export —
   nudging the anchor inward is out of scope (centroid labels that drift look
   wrong faster than they help).
6. Optional refinement (skip unless trivial): the repeat count `ideal`
   (`:1425`) still divides the *full* run length including off-canvas
   stretches. Harmless — placement filtering caps the real count — but
   clamping `lenPx` to the inside portion would make repeat spacing slightly
   more honest on border-crossing roads.

## Fix 2 — one shared collision grid, features claim space first

**Policy decision (recommended):** feature labels stamp first, street labels
dodge them. Rationale: a feature label has exactly one possible position (its
centroid/midpoint anchor) while a street label has ~24 candidate positions
per size step — the flexible party should yield. Consequence: a street name
moves over or shrinks rather than sitting on "Leie".

Implementation:

1. Hoist `fpR` and `fpLine` out of `buildLabelsLayer` to module scope next to
   `makeFootprintGrid` (`:1200`) — they capture nothing; `fpPath`/`fpFits`/
   `fpStamp` stay closures (they use `grid`, which now comes in from outside).
2. Create the shared grid per export in `buildSVGContext` (`:1905`):
   `labelGrid: makeFootprintGrid()`, and pass it through the dispatch at
   `:1843–1844`: `buildLabelsLayer(elements,pr,W,H,ctx.labelGrid)` /
   `buildFeatureLabelsLayer(elements,pr,W,H,ctx.labelGrid)`. Both builders
   take the grid as a parameter, falling back to a fresh
   `makeFootprintGrid()` when not given one (keeps unit tests and
   `scheduleLivePreview` filtered runs working).
3. `buildLabelsLayer:1265`: use the passed grid instead of creating its own.
4. `buildFeatureLabelsLayer`: replace `makeCollisionGrid()` (`:1480`, box
   model, `collision.overlaps`/`add` at `:1508–1509`) with the ribbon model on
   the shared grid: `r=fpR(sz)`, `fp=fpLine(cx-tw/2,cy,cx+tw/2,cy,r)`, reject
   when any circle hits, stamp otherwise. This makes feature-vs-feature,
   feature-vs-street and street-vs-street all one mechanism. Delete
   `makeCollisionGrid` if nothing else uses it (grep first).
5. **Ordering:** in `LAYER_ORDER` (`:1903`) move `'water_labels'` **before**
   `'street_labels'`. Build order and paint order are the same loop
   (`buildSVG:1947` walks `sortedResults`), so this makes features stamp
   first. The z-order swap of the two label groups is visually irrelevant once
   nothing overlaps; it only reorders two sibling groups in the Inkscape
   layers panel.
6. Sanity-check `getAllSelectedLayers`-driven partial exports (e.g. street
   labels on, water labels off): grid simply stays empty of feature stamps —
   no special-casing needed.

## Test / harness updates (same branch, after the engine change)

1. `script.js` changed → `bash tools/minify.sh` (pre-commit hook re-minifies
   anyway) + CHANGELOG entry (hook enforces).
2. `tests/svg-lint.mjs`: flip severities to match the policy. The
   name-grouped verdict is **already implemented** (2026-07-03, via
   `inkscape:label`): clipped-with-visible-sibling produces no warning;
   per-label "entirely outside" and per-street "none fully visible" are
   warnings. The fix session only turns those two warning classes into
   **errors**, plus:
   - feature label clipped → error (single-placement family);
   - cross-family overlap: drop the special-case warning branch, all label
     overlap becomes an **error** (delete the `L.kind === O.kind` fork).
   Update the corresponding `svg-lint-selftest.mjs` cases (they currently
   assert warning-hood) and add a cross-family overlap case (street `lbl_` +
   `feat_` on the same spot → error).

   **Baseline to beat** (the fix should drive all of these to 0), measured on
   the committed 2026-07-03 exports:
   | | invisible placements | clipped-only streets | all-invisible streets |
   |---|---|---|---|
   | tilburg | 21 | 24 | 6 |
   | ghent | 23 | 55 | 14 |
3. `tests/label-placement.mjs`: add cases —
   - street crossing the canvas edge, long inside portion → at least one
     fully-inside label; clipped repeats (if any) only in addition to it
     (assert the visible part IS labelled — the budget-burn regression);
   - street entirely outside → no label;
   - sliver street barely poking into the canvas, no inside spot fits → no
     label at all (not a clipped-only one);
   - feature label first, street on the same spot → street label dodges
     (moved or absent), no overlap in `lintSvg` output;
   - feature label at the canvas edge → skipped.
   Note `buildLabelsLayer`/`buildFeatureLabelsLayer` gained an optional 5th
   arg; `loadAppSandbox` callers can pass a fresh grid to test the shared
   path explicitly.
4. Re-run `node tests/real-export.mjs tilburg` and `ghent` — expect **fewer
   total labels** (outside ones gone) but **new names appearing** in border
   areas (budget no longer burned) and zero lint warnings of the flipped
   classes. Visually verify per `tests/README.md` §8, get Coen's approval,
   then refresh the floors: `--record` on the approved runs (the recorded
   `labels` floors 223/448 in `tests/expectations.json` predate this change).
5. Commit the new exports as the usual trail; update the "Open" section of
   `tests/IMPROVEMENTS.md` (both engine findings close; the multi-city
   fixtures item stays).

## Risks / gotchas

- **Don't** filter candidates by bbox *before* computing `cum`/`pathPts` —
  the sub-path baseline math (`subPath:1291`) needs the full run geometry;
  only the placement decision is canvas-gated.
- The `fpInside` inset uses `r` as a proxy for text extent; a textPath label
  on a strongly curved baseline can still poke a glyph corner out a few px.
  Accept that (the lint's own footprint model is the same, so it stays
  green); do not try to compute exact glyph boxes.
- Feature-label ribbon radius `fpR(sz)` is taller than the old box model's
  `th/2 + pad` for large names — expect a handful of previously-placed
  feature labels to drop in dense areas. That is the intended trade for
  guaranteed no-overlap.
- `scheduleLivePreview` (`:1957`) builds at `PREVIEW_W=600`; nothing to do,
  just confirm the preview still shows labels (it exercises the
  no-grid-passed fallback if the ctx wiring is missed — which would be a bug:
  ctx must always pass the grid).
