# Engine v2 — design contract

This file is the binding contract for `engine-v2.js`, MapExport's map
*construction* engine. It exists so that any future change — by a human or an
AI agent of any capability — can be checked against the invariants instead of
re-deriving them. If a change would violate a rule here, the rule wins until
the contract itself is deliberately amended (same commit, with a CHANGELOG
entry explaining why).

Scope: v2 replaces v1's block construction (worker, island heuristics,
prepareBlockData) and adds the sea, the coverage guarantee, squares, corridor
beds and the Uncategorized layer. Everything else — fetch/cache, the label
engine, the road/rail/area renderers, both SVG emission pipelines — is v1
code in `script.js`, shared verbatim. v1 stays untouched and production until
cutover (plan milestone 8, a separate human decision).

## 1. The coverage promise

**Every land pixel inside the frame is painted by a content layer.** The page
background is never load-bearing; it stays white for print but must never
show through. This is v2's reason to exist — v1 shows the page through
countryside faces, rail corridors and dropped slivers by design, and has no
way to measure it.

Enforcement is two checks in `tests/real-export.mjs`, and the second one is
the authority:

- **Geometric lint** (`tests/coverage-lint.mjs`): rasterizes the *worker's
  model* (blocks + area features + cut lines) on a grid. Fast, offline, finds
  model-level regressions. On v2 runs, unpainted countryside placeholders do
  NOT count as covered (`countrysideCovers: false`).
- **Render coverage** (`tests/render-coverage.mjs`): rasterizes the *finished
  SVG* over a magenta page in headless Chrome and counts actual bare pixels.
  The model and the paint have disagreed three separate times (rail corridors
  carved wider than the drawn tracks; hamlet-blob edges vs the fallback
  remainder; squares excluded from road stroking) and every such class is
  invisible to a model-side check by construction. Only the ink counts.

Both use the same significance floor (3×3 mm on paper) and the same
human-approval channel: a `--record` run bakes observed counts into
`tests/expectations.json` (`coverageGaps` for the model check, `bareBlobs`
for the ink check). **All seven validation areas currently stand at zero
allowances and 0.000% bare pixels. A change that needs a new allowance needs
a human to approve that specific run.**

## 2. Construction model

Deterministic, mechanical, no winding/island heuristics — ever. The two
v1 island bugs (Erfurt's Gera islands, fixed twice) came from heuristics;
v2 renders river islands with no island machinery at all, purely through
classification + subtraction + paint order.

1. **Cutter network**: roads buffered at drawn width minus `ROAD_TUCK`
   (blocks tuck under the casing); rail/tram/metro at v1's fixed 20 px·sf.
   Tunnels (`tunnel=yes|culvert`) never cut and never draw as surface;
   bridges and `building_passage`/`covered` stay.
2. **Faces** = frame rectangle minus the cutter union. No face is dropped:
   pieces under the 400 px² block floor still paint, downgraded to fallback
   cream (a dropped sliver is a bare-page sliver).
3. **Classification** (per face):
   - ≥ 0.35 km² (`COUNTRYSIDE_MIN_KM2`) **and** green+landcover covers ≥ 35%
     of its land area → **countryside**: hamlet blobs (morphological closing
     of building bboxes) + cream fallback remainder. Water is excluded from
     the open-land signal — harbour basins sit inside dock faces and fake a
     rural reading (Bremerhaven grew 32 invented in-city "hamlets" before
     this gate).
   - otherwise, contains a building → **urban**: curb-to-curb cream block.
   - otherwise → **fallback**: cream remainder after subtracting everything
     any layer paints (this is how river islands and OSM data gaps render).
4. **Subtraction** is plain Clipper difference on an integer grid
   (SCALE=100), nonZero fill, rings pre-oriented (outer positive, inner
   negative). Nothing downstream decides what a ring "means".

## 3. The complement rule

**Anything subtracted from a coverage layer must be subtracted as the shape
that actually gets painted — same polygons, same simplification tolerance.**
Every measured bare-pixel class so far was a violation of this rule:

- rail cut at 20 px·sf, drawn at 12 → bare flanks (fixed by corridor beds
  that paint the full carved band);
- fallback remainder subtracted the *raw* hamlet cluster while the hamlet
  painted the *clipped* blob → seam bites (fixed: the remainder subtracts
  `PolyTreeToPaths` of the emitted hamlet tree);
- squares cut blocks at street width but were excluded from road stroking →
  bare ring (fixed: the plaza strokes its own outline at full street width).

Corollaries: paint eps and void eps must be identical per feature class
(`getAreaLargeEps()` for areas, line eps for waterways, road eps for
cutters); abutting unstroked fills need a self-coloured seam stroke (water,
fallback patches, squares all carry one).

## 4. Paint order (bottom → top) and why

```
corridor_beds   cream band over every carved rail/tram/metro corridor
landcover       unnamed farmland/wood tint (countryside only, see §5)
city_blocks     urban cream + hamlet blobs
fallback_blocks the Uncategorized coverage patches
water_bodies    incl. the synthetic sea
waterways       stroked rivers/canals/streams
parks           named green
roads → rail → tram → metro → transit_stops → labels
```

Load-bearing relations, do not reorder casually:

- **beds below landcover**: a forest along a railway must stay flush to the
  casing (bed shows only through the carve).
- **landcover below blocks**: unnamed woods/meadows must not show inside
  cities (v1's named-green rule); they surface only where blocks don't paint
  — countryside faces and fallback holes.
- **blocks below water**: a pond in a block is a hole + water paint, no
  heuristic.
- **squares paint before streets** within the roads layer, so crossing
  street strokes stay on top.
- Roads render **all casings, then all fills** (v1 convention) so junctions
  stay seamless.

## 5. AREA_FEATURES and the named-green rule

One ordered declarative table maps tags → category → render layer; first
match wins; adding a forgotten tag is one row + one query line + one preset
colour, never a new code path. Only render-DISTINCT categories get rows —
anything that reads cream is neither painted nor rowed.

- **Green paints only through v1's `parksNamedGate`** (named parks, gardens,
  forests, cemeteries…). There is deliberately no nameless-green row: one
  existed for sports pitches and it broke the rule inside cities.
- **Landcover** (farmland/meadow/forest/wood) is nameless by design — it is
  countryside texture, kept invisible in cities by paint order (§4).
- **Label-only sweep**: a broad landuse/natural/parking/aeroway/military/
  leisure fetch that never paints. The table rows are tag-specific, so
  widening the fetch cannot widen what paints. Its only job is naming
  Uncategorized patches.
- Two coded exceptions live outside the table: `natural=coastline` (§6) and
  linear waterways (stroked lines, one named path per waterway).

## 6. The sea

OSM's convention: coastline ways carry land on the LEFT, water on the right,
and the open sea is never a polygon. v2 stitches coastline ways into chains,
clips to the frame (rotating closed rings whose seam falls inside the frame),
and closes all runs with **one shared clockwise perimeter walk** — per-run
closure stacked 25 overlapping sea polygons on Oulu's archipelago. Closed CCW
rings are island holes; CW rings are lagoon outers. Output is a single
synthetic `natural=water` relation that flows through the ordinary water
path.

Naming: the sea takes a name only when the OPEN coastline ways agree on
exactly one; island rings never name the sea; otherwise the layer stays
"Sea". The synthetic relation never feeds the label engine.

Deliberate punts (documented, not bugs): a frame entirely at sea with no
coastline in view (assumes land, no-op) and lakes-in-islands-in-lakes.
Guarded offline by `tests/sea-sign.mjs` (24 checks, no network).

## 7. Editor-facing contract

The SVG is the product; a designer must be able to select, rename, recolor
and delete by name. Every path carries an `id` and an `inkscape:label`;
every layer is an Inkscape layer group. No anonymous merged blob paths
("path124") — one named path per water body, per waterway, per green, per
block, per bed, per Uncategorized patch.

Uncategorized labels read the OSM tag **value** ("Railway", "Parking
“Autoranta”", "Pitch"); plain "Uncategorized" is reserved for land OSM does
not tag at all.

## 8. v1 parity quirks, kept deliberately

- Waterways stroke at fixed 12 px (not ×sf) — v1's quirk, kept until a
  deliberate joint change; the cutter subtracts at the same 12, so the
  complement rule holds.
- Rail cuts at 20 px·sf clearance (the visual breathing room around tracks).
- `CREAM` is v1's `#FEF6ED @ 0.8 over white` flattened to solid `#FEF8F1`.
- Overpass fetch cost is never a design input; robustness and simplicity
  win (queue/self-hosting are the escape hatches).

## 9. Change discipline

- Every behaviour change: CHANGELOG entry, same commit (hook-enforced).
- After any engine change, the seven-area sweep
  (`node tests/real-export.mjs <city> --engine=v2`) must pass with zero
  allowances; offline suites (`sea-sign`, `road-merge`, `abbreviate`,
  `supersession`, `pipeline-equivalence`) stay green.
- `--record` is a human-approval act, not a convenience — never run it to
  make a failure go away.
- `script.js` (v1) is not modified for v2 features. Shared helpers may be
  *read* from v2, never edited for v2's benefit alone.
- Never deploy unless explicitly asked; milestone 8 is a separate decision.
