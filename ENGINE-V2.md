# Engine v2 — design contract

This file is the binding contract for `engine-v2.js`, MapExport's map
*construction* engine. It exists so that any future change — by a human or an
AI agent of any capability — can be checked against the invariants instead of
re-deriving them. If a change would violate a rule here, the rule wins until
the contract itself is deliberately amended (same commit, with a CHANGELOG
entry explaining why).

Scope: v2 replaces v1's block construction (worker, island heuristics,
prepareBlockData) and adds the sea, the coverage guarantee and the
Uncategorized layer. Everything else — fetch/cache, the label
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
  NOT count as covered (`countrysideCovers: false`). When a landcover element
  carries `_mergedRings` (a green-remainder merge — grown to element ∪ the
  green-open coverage remainder it sits in), the lint marks those grown rings,
  exactly as `renderLandcover` paints them; marking only the raw element
  geometry there made the grown-only band read as a false unpainted-land gap
  while the SVG covered it (fixed 2026-07-14 — a lint-side complement-rule
  slip, engine unchanged).
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

1. **Cutter network**: roads only, buffered at drawn width minus `ROAD_TUCK`
   (blocks tuck under the casing). Rail/tram/metro deliberately do NOT cut
   (since 2026-07-12): the old 20 px·sf rail carve plus a corridor_beds layer
   that repainted exactly that band cream was net-zero ink — identical output
   with extra machinery, plus designer-facing pollution (no-name "Railway"
   between-track faces, rail-side slivers, a whole beds layer). Blocks now
   simply paint under the drawn tracks. Square-tagged ways (closed
   `highway=pedestrian`/`place=square` areas, not roundabouts) do not cut
   either — a square is land inside its face and paints cream via normal
   classification (see §3); a NAMED square still gets a map label through
   v1's feature-label engine (a synthetic node at the square's interior
   point, park styling for now), rendered as its own "Squares & plazas"
   editor group right after water/park names — not folded into the water
   labels — and dropped from street labels so the same plaza never carries
   two names. Tunnels (`tunnel=yes|culvert`) never cut and
   never draw as surface; bridges and `building_passage`/`covered` stay.
2. **Faces** = frame rectangle minus the cutter union. No face is dropped:
   pieces under the 400 px² block floor are junction pockets (sub-3×3 mm
   crumbs fully surrounded by road bands) — road-space, not land — and paint
   once as a single road-fill "Junction infill" path at the head of the roads
   layer, under the casing/fill strokes (a dropped sliver is a bare-page
   sliver).
3. **Classification** (per face):
   - ≥ 0.35 km² (`COUNTRYSIDE_MIN_KM2`) **and** green+landcover covers ≥ 35%
     of its land area → **countryside**: hamlet blobs (morphological closing
     of building bboxes) + cream fallback remainder. Water is excluded from
     the open-land signal — harbour basins sit inside dock faces and fake a
     rural reading (Bremerhaven grew 32 invented in-city "hamlets" before
     this gate). **Place-node grounding**: a hamlet blob is emitted only when
     OSM attests a nearby rural settlement via a `place` node — a settlement
     node (`hamlet|isolated_dwelling|farm|village`) within
     `HAMLET_GROUND_SETTLEMENT_M` (1000 m), or the tighter `place=locality`
     within `HAMLET_GROUND_LOCALITY_M` (300 m). Ungrounded blobs are dropped
     and fall back to cream, because face-level signals cannot tell true
     countryside from urban forest/harbour/park faces (measured: Nievre's real
     hamlets all ≤928 m from a rural node; Bremerhaven/Oulu's false blobs have
     no rural node in range). The grounded blob takes the name of its nearest
     in-range node (`inkscape:label="Hamlet “<name>”"`). Grounding is applied
     to the emitted contours after subtraction, so the complement rule (§3)
     subtracts the KEPT blobs only. The same place nodes also feed the
     visible "Place names" label layer (AF-04, see §7) — the blob's label
     stays editor-only, so a settlement's name appears on the map once.
   - otherwise it runs the **urban test**: a face is **urban** (curb-to-curb
     cream block) iff it contains a building, **or** it is **not** open land
     **and** the urban-signal landuse set (see the urban-landuse signal bullet
     below) covers ≥ 50% of its land area. Anything else is **fallback** (cream remainder after subtracting
     everything any layer paints — this is how river islands and OSM data gaps
     render). The signals beyond building presence:
     - **Urban-landuse signal.** Much of OSM maps a district by a
       `landuse=residential|commercial|retail` polygon and never its individual
       buildings (Erfurt: 37 of 43 above-floor Uncategorized patches were
       residential/commercial). Those polygons are projected from the label-only
       sweep (§5) into a classification void (`urbanVoid`); like building
       centres they classify but **never paint or cut**. The signal set
       (`isUrbanSignalElement`) is `landuse=residential|commercial|retail`,
       `amenity=parking` (paved block-land, Coen 2026-07-13) and — since
       AF-03c — the institutional built-land tags
       `landuse=institutional|education|religious` (Oulu's "Institutional"
       fallback patch); institutional joined at the SAME ≥ 50% share threshold
       and under the same open-land veto, no numbers moved. `industrial` — and
       the whole working-land family (brownfield, construction, depot,
       landfill, quarry, railway grounds) — is excluded deliberately:
       Bremerhaven's industrial-tagged open quays are open land, not cream city
       blocks, and industry is never silently promoted to residential; those
       patches stay labelled fallback under their semantic editor family (§7).
     - **Open-land gate, promotions only.** The same green+landcover ≥ 35%
       signal (`COUNTRYSIDE_MIN_OPEN_SHARE`, water excluded) that picks
       countryside vetoes the urban-landuse *promotion* (and the remainder
       re-test below) — it never demotes a face that building presence already
       made urban. Extending it to building-attested faces of all sizes was
       measured on the five validation cities (2026-07-12) and **rejected**:
       Oulu would have flipped 10.22% of its urban faces to fallback (Erfurt
       3.16%, Ghent 3.28%, Bremerhaven 2.11%, Tilburg 1.52%), over the 5%
       guard — small faces are frequently green-covered yet genuinely urban.
       (The Erfurt Gera wood island is invisible to any face-level gate — its
       parent road-bounded face spans the river with open-land share 0.11 — and
       is instead fixed by per-land-mass classification below.)
     - **Per-land-mass classification.** A face's land is what remains after the
       block void (water + green + waterway strokes) is subtracted; that
       difference already splits a river-crossed or park-severed face into
       disjoint solid **masses** (a bank, an island). When there is more than one
       mass, each runs the urban test on its own instead of inheriting one
       whole-face verdict — so the Gera wood island (buildingless, open-land
       share high) paints fallback and its landcover shows through, while the
       built banks stay cream. This is the universal, heuristic-free island fix
       the construction model promises (§2): no winding, no island machinery,
       just classification per mass. The per-mass test runs with the building
       gate OFF (like a small face), so a mass a building already claimed is
       never demoted — the split can only move buildingless open-land masses to
       fallback, which honours the same 5% abort the all-sizes gate failed. A
       single-mass face is untouched by construction (identical emit). Measured
       demotions on the seven-area sweep (2026-07-12): Erfurt 3, Tilburg 8,
       small elsewhere — all buildingless open-land islands.
     Buildings for this test are fetched with the frame **padded ≈ 100 m**: a
     clipped edge face whose buildings all sit just off-frame would otherwise
     lose them and misclassify. Buildings never paint or cut, so the geometry is
     unaffected (only the buildings layer's cache key changes; §8 — cost is not
     a design input).
   - the countryside **remainder** is no longer emitted wholesale as fallback:
     every solid piece of face minus (block void ∪ kept hamlets) — the pieces
     water/green/waterways carve out — **re-runs the urban test** (here the
     open-land gate applies to the building signal too: every piece was
     fallback before, so gating a promotion cannot regress anything). A genuine
     city pocket inside a big forest/harbour/park face — or a hamlet dropped
     for want of a rural place node — paints a cream block instead of
     Uncategorized (Bremerhaven's Bürgerpark-area pockets carried 9–123
     buildings yet read as Uncategorized). The granularity is the piece, never
     the remainder as a whole, whose open-land share is high by countryside
     construction and would veto every pocket. Complement rule (§3): a passing
     piece IS the curb-to-curb block shape already (face minus block void) and
     emits verbatim; a failing piece additionally subtracts the fallback void
     (a superset — the difference is exactly landcover) — either way the
     piece's whole area paints cream except holes another layer paints, so no
     seam or bare sliver opens.
4. **Subtraction** is plain Clipper difference on an integer grid
   (SCALE=100), nonZero fill, rings pre-oriented (outer positive, inner
   negative). Nothing downstream decides what a ring "means".

## 3. The complement rule

**Anything subtracted from a coverage layer must be subtracted as the shape
that actually gets painted — same polygons, same simplification tolerance.**
Every measured bare-pixel class so far was a violation of this rule:

- rail cut at 20 px·sf, drawn at 12 → bare flanks (first patched by corridor
  beds that painted the full carved band; resolved for good on 2026-07-12 by
  removing both the carve and the bed — no void, nothing to complement);
- fallback remainder subtracted the *raw* hamlet cluster while the hamlet
  painted the *clipped* blob → seam bites (fixed: the remainder subtracts
  `PolyTreeToPaths` of the emitted hamlet tree);
- squares cut blocks at street width but were excluded from road stroking →
  bare ring (first patched by the plaza stroking its own outline at full
  street width; resolved for good on 2026-07-12 the same way as rail:
  squares no longer cut, so there is no plaza path, no ring and no
  outline-stroke workaround — the square area is ordinary land inside its
  face and paints cream through classification).

The rail and square resolutions show the strongest form of the rule: the
easiest complement to keep correct is the one that doesn't exist. When a cut
exists only to be painted back identically, delete both sides.

Corollaries: paint eps and void eps must be identical per feature class
(`getAreaLargeEps()` for areas, line eps for waterways, road eps for
cutters); abutting unstroked fills need a self-coloured seam stroke (water
and fallback patches both carry one).

## 4. Paint order (bottom → top) and why

```
landcover       unnamed farmland/wood/grass tint (countryside + fallback holes, see §5)
city_blocks     urban cream + hamlet blobs
fallback_blocks the Uncategorized coverage patches
water_bodies    incl. the synthetic sea
waterways       stroked rivers/canals/streams
parks           named green
parks_recreation recreation grounds — golf/dog park/sports centre/allotments (§5)
roads → rail → tram → metro → labels
```

`transit_stops` is deliberately **not** in v2's layer set (since 2026-07-12):
the dot symbols cluttered the plate without wayfinding value at this scale.
v1's layer registry keeps the layer untouched.

Load-bearing relations, do not reorder casually:

- **landcover below blocks**: unnamed woods/meadows must not show inside
  cities (v1's named-green rule); they surface only where blocks don't paint
  — countryside faces and fallback holes.
- **blocks below water**: a pond in a block is a hole + water paint, no
  heuristic.
- **junction infill paints first** within the roads layer (the single
  road-fill path holding all sub-floor slivers, §2 item 2), so casings and
  fills stroke over it.
- Roads render **all casings, then all fills** (v1 convention) so junctions
  stay seamless.
- **Two-class rail** (AF-05b, v2-only): within the rail layer, ways carrying
  any `service=*` (yard/siding/spur/crossover) render as one thin muted
  stroke each in a "Service tracks" group (`rail_service`) painted FIRST, so
  the main lines' casing+sleepers+track signature strokes over them. Main
  ways (no `service`) keep v1's full signature untouched. Rationale: drawn
  full-signature, service ways stack into the audit's black yard moiré —
  89% of Oulu's rail ways and 61% of Paris's rail length are service track.
  Service ways skip the label-grid corridor stamp (a hairline is ground
  texture, not an obstacle) and, like all rail since 2026-07-12, never cut —
  coverage is unaffected. v1 keeps rendering every rail way full-signature
  (§9); guarded offline by `tests/rail-service.mjs`.
- **Public metro geometry** (AF-05c, v2-only): ways carrying any `service=*`
  are depot, siding, spur or crossover geometry and do not paint in the Metro
  layer. Unlike rail, they get no muted stroke: Metro is a schematic
  rider-facing overlay, while the depot area remains available through the
  `landuse=railway` fallback patch. Surviving ways without `ref` inherit one
  only when their exact `name` maps to one unambiguous `ref` among the other
  surviving ways. This rejoins loose relation-member geometry such as Paris'
  ref-less `name=Métro 5` ways to the existing `metro_5` line group instead of
  painting a second palette-coloured fragment group. Names shared by multiple
  refs are deliberately not guessed. The fallback palette is assigned against
  the original group keys before filtering, so removing a service/fragment
  group never recolours unrelated surviving public lines. Main metro tunnels
  remain visible pending AF-05d; v1 is unchanged. Guarded offline by
  `tests/metro-dedup.mjs`.

## 5. AREA_FEATURES and the named-green rule

One ordered declarative table maps tags → category → render layer; first
match wins; adding a forgotten tag is one row + one query line + one preset
colour, never a new code path. Only render-DISTINCT categories get rows —
anything that reads cream is neither painted nor rowed.

- **Green paints only through v1's `parksNamedGate`** (named parks, gardens,
  forests, cemeteries…). There is deliberately no general nameless-green row:
  one existed for sports pitches and it broke the rule inside cities. The
  **recreation rows** below are the one bounded exception, limited to four
  specific destination tags — never a blanket green.
- **Landcover** (farmland/meadow/forest/wood) is nameless by design — it is
  countryside texture, kept invisible in cities by paint order (§4). The
  **grass display rows** — `landuse=grass|village_green`, *unnamed*
  `leisure=park|garden`, and `natural=scrub|heath|wetland` (category `grass`;
  wetland joined via AF-03b) — paint
  through the same landcover layer as a green tint (v1's ISLAND_GREEN, never
  ported until now; scrub/heath/wetland instead render `renderLandcover`'s
  field tint, same as farmland) and
  subtract from the fallback void so grass shows through fallback holes instead
  of reading as an "Uncategorized › Grass" patch. They are a **paint** signal
  only: the grass rows are held OUT of the open-land classification signal
  (the ≥ 35% share test), because grass is ubiquitous in cities — Tilburg tags
  39% of its Uncategorized patches `landuse=grass`, so grass in the signal
  would flip genuinely urban faces to fallback en masse. The paint set
  (landcover + grass) and the signal set (landcover only) are split in the face
  worker for exactly this reason. As a
  paint-only optimization the face worker culls landcover elements that lie
  fully under the **opaque layers painted above landcover** (§4): a Clipper
  difference on a finer grid (SCALE=100) of the element minus the covering
  union, empty → dropped from the render. The covering set is the opaque upper
  layers — urban + hamlet **city blocks** (cream), **named parks** (green,
  fillOpacity 1), **recreation grounds** (same opaque green, AF-03b) and
  **water bodies** (opaque since everything went opaque, 2026-07-12). A wood fully inside a named forest/park was invisible yet
  survived the old city-blocks-only cull (Tilburg's "invisible forest"); parks
  in the covering set drop it. Deliberately **excluded**: fallback blocks (the
  fallback void already subtracts landcover, so a fallback patch is holed
  exactly where landcover paints — it can never cover it, by construction);
  waterway strokes and roads (opaque but thin — a river line or street rarely
  covers a whole landcover polygon, so omitting them only ever KEEPS ink, the
  conservative direction). Each covering layer contributes its region with its
  own holes punched (a block's pond, a lake's island) before the regions union,
  so a hole one layer leaves that another fills stays counted as covered. Any
  remainder above ~1px² keeps the element, and the cull never touches a
  subtraction void — so it removes only ink another opaque layer already covers
  and the coverage promise (§1) is unaffected by construction (measured: Tilburg
  drops 902 of 3082 paint elements, Erfurt 186 of 265, at 0.000% bare).
- **Recreation grounds** (v2-only, AF-03b): `leisure=golf_course|dog_park|
  sports_centre` plus nameless `landuse=allotments` (a properly named
  allotments already passes the green gate row above) form category
  `recreation` → the `parks_recreation` layer, painted `preset.park` directly
  above named parks and nested with them under one "Parks & green" parent
  (§7). These grounds are green *destinations* the audit found reading as
  cream (Bremerhaven's golf-course bite by the Bürgerpark, Oulu's dog park),
  regardless of whether OSM names them. They follow the complement rule (§3)
  exactly like named green — the same polygons join the block and fallback
  voids, so blocks lose precisely the shape painted — but they stay OUT of
  every classification signal (`openLandVoid`, `landcoverVoid`): recreation
  changes a face's paint, never its urban/countryside verdict. Unnamed
  `pitch`/`stadium`/`nature_reserve` remain label-only; the recreation rows
  must not widen back into the failed nameless-green rule.
- **Label-only sweep**: a broad landuse/natural/parking/aeroway/military/
  leisure fetch that never paints. The table rows are tag-specific, so
  widening the fetch cannot widen what paints. It has two read-only jobs:
  naming Uncategorized patches, and supplying the **urban-landuse
  classification signal** (`isUrbanSignalElement` — residential/commercial/
  retail/institutional/education/religious landuse plus `amenity=parking` →
  `urbanVoid`, §3). Both are read-only over the sweep — exactly like building
  centres, the sweep classifies and labels but never paints or cuts, so this
  keeps §5 intact.
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

Naming: the sea takes a name only when the coastline chains that stay OPEN
after stitching agree on exactly one; island rings never name the sea — and
"island" is judged on the stitched chain, not the raw ways, because a split
island ring is open way-by-way (Oulu's islet "Elba" named the whole sea
before this was chain-aware); otherwise the layer stays "Sea". A manual
override — the "Sea name" field next to the v2 toggle, or
`--sea-name=<name>` in the export test — wins over the coastline-derived name.

Map label: the sea renders its name ON the map through v1's feature-label
engine (a synthetic `natural=water` node, so it inherits the exact water
styling, halo and shared collision grid). It renders only when the sea has a
real name (override or unique open-coastline name); the generic "Sea" fallback
names the layer group but paints no label. The anchor is a robust interior
point of the sea water — the point farthest from every boundary (outer edge and
island holes) in the largest sea piece, never the bounds centre, which for a
coastal frame usually lands on land.

Deliberate punts (documented, not bugs): a frame entirely at sea with no
coastline in view (assumes land, no-op) and lakes-in-islands-in-lakes.
Guarded offline by `tests/sea-sign.mjs` (no network).

## 7. Editor-facing contract

The SVG is the product; a designer must be able to select, rename, recolor
and delete by name. Every path carries an `id` and an `inkscape:label`;
every layer is an Inkscape layer group. No anonymous merged blob paths
("path124") — one named path per water body, per waterway, per green, per
block, per Uncategorized patch. The one deliberate exception is the roads
layer's single "Junction infill" path (§2 item 2): its subpaths are road-space
crumbs no designer should ever manage individually, so they merge into one
selectable, deletable path.

Uncategorized labels read the OSM tag **value** ("Railway", "Parking
“Autoranta”", "Pitch"); plain "Uncategorized" is reserved for land OSM does
not tag at all. Within the Uncategorized layer, patches from known
built/paved/worked land group under three semantic **families** (AF-03c):
"Working land" (`landuse=industrial|brownfield|construction|depot|landfill|
quarry`), "Railway grounds" (`landuse=railway` or any `railway=*` area tag)
and "Paved areas" (`amenity=parking`, `landuse=garages`) — pure panel
organization (`fallbackSemanticGroup`): the patches keep their cream fallback
paint and their specific per-path labels, the audit's decision being that this
land is neither green nor generic Uncategorized, while city-block styling is
not redesigned. Tags with no family keep their raw value group (e.g.
"Residential").

Named squares get their own "Squares & plazas" editor group, separate from
"Water & park names" and from the street-label layers (§2 item 1).

Inside the Railways layer, service tracks live in their own selectable
"Service tracks" group (`rail_service`, §4) — a designer can restyle or
delete a whole yard without touching the main lines. Named service ways keep
their name as id/label; unnamed ones read "Service track (<osm id>)".

Inside the Metro layer, AF-05c keeps the existing ref-based line subgroup IDs
stable and folds an unambiguously named ref-less member into that same group.
Technical `service=*` geometry gets no SVG object at all; an ambiguous name
keeps its own subgroup rather than being merged into the wrong public line.

Rural settlement names render as their own **"Place names"** layer
(`id="place_labels"`, AF-04), built from the place_nodes fetch that also
grounds hamlet blobs (§2). Tier sub-groups in hierarchy order — "Villages",
"Hamlets", "Farms & dwellings", "Localities" — with per-tier styling; the
locality tier (lieux-dits: named, formally unpopulated) is deliberately
decluttered: lowest grid priority, lightest italic style, and a minimum
spacing from every other place label (`PLACE_LOCALITY_SPACING`), so a
lieu-dit-dense frame shows a readable selection rather than every name.
Same-name node duplicates dedupe within `PLACE_NAME_GAP` (the settlement
tier wins); labels share the one collision grid (claim order water/parks →
squares → places → street labels) and additionally avoid the major-road
network (`motorway|trunk|primary|secondary(_link)`) through a local
corridor grid that no other label family consults. Fixed anchors: a label
is fully on-canvas or skipped, like feature labels.

Adjacent-in-paint-order layers may share a parent layer group when that moves
no paint — pure panel organization. Two exist: **"Water"** (water bodies +
waterways) and, since AF-03b, **"Parks & green"** (`id="parks_green"`) holding
**"Named parks"** (the v1 parks group, `id` stays `"parks"`, label rewritten
v2-side so it doesn't repeat the parent's name) and **"Recreation grounds"**
(`id="parks_recreation"`). "Countryside" (landcover) deliberately stays a
separate top-level layer — four layers separate it from the parks band, so
nesting it would reorder paint (Coen, 2026-07-14).

## 8. v1 parity quirks, kept deliberately

- Waterways stroke at fixed 12 px (not ×sf) — **v1-only**, kept as v1's own
  quirk. **v2 scales** (`12 * getScaleFactor(W)`, since 2026-07-11): v2's
  cutter already buffered `waterwayLines` at a scaled half-width, so a fixed
  12px paint against a scaled void only agreed by coincidence at the
  A3@300dpi baseline (scaleFactor 1) — the complement rule (§3) needs paint
  and void to share the same number at every export size, so v2's paint was
  the one that had to move.
- `CREAM` is v1's `#FEF6ED @ 0.8 over white` flattened to solid `#FEF8F1`.
- **Everything paints opaque — no fill/stroke alpha, no shine-through**
  (2026-07-12). Alpha in these plates was only ever a colour-softening trick,
  never a see-through requirement; it also caused two small bugs (overlapping
  water bodies double-darkening at the seam; water reading as two different
  blues over cream vs white page). `CREAM` already set the pattern (bake the
  alpha into a solid colour). In v2's own renderers the one remaining alpha was
  the waterways stroke (`0.92`), now dropped so a river paints the exact same
  `preset.water` as the water body it flows into — one water colour, no faint
  body/way seam. Water bodies were already opaque (`preset.waterOp` is 1; the
  `water_bodies` registry `fillOpacity: 0.85` is dead — the water branch of
  `renderLayerSVG` overrides it). Opacity that still lives in **shared v1
  renderers** (rail base `0.5` / casings, feature-label text `0.9`) flattens
  only when v2 takes over that renderer — the rail one folds into the pending
  rail/tram work; v1 stays frozen (§9). Opaque water is what lets water join
  the landcover occlusion cull (§5).
- Overpass fetch cost is never a design input; robustness and simplicity
  win (queue/self-hosting are the escape hatches).

## 9. Change discipline

- Every behaviour change: CHANGELOG entry, same commit (hook-enforced).
- After any engine change, the seven-area sweep
  (`node tests/real-export.mjs <city> --engine=v2`) must pass with zero
  allowances; offline suites (`sea-sign`, `hamlet-grounding`, `road-merge`,
  `abbreviate`, `supersession`, `pipeline-equivalence`) stay green.
- `--record` is a human-approval act, not a convenience — never run it to
  make a failure go away.
- `script.js` (v1) is not modified for v2 features. Shared helpers may be
  *read* from v2, never edited for v2's benefit alone.
- Never deploy unless explicitly asked; milestone 8 is a separate decision.
