# Fix: river islands render blank — island-aware green cover + hole-aware city blocks

**Status: IMPLEMENTED (2026-07-07, follow-up 2026-07-09)** — shipped in
`script.js` (and verified offline against this archive's tiles; see "As
shipped" below). Awaiting a visual sign-off in the real browser app before
the reproduction archive is deleted.

## Follow-up (2026-07-09): a SECOND island class was still white

The 2026-07-07 fix covered islands that are **inner rings of a water
multipolygon**. The Erfurt export still showed a white island SE of
Predigerhof (between the Bergstrom and Walkstrom arms of the Gera): that land
is **not inside the water relation at all** — it sits in the concavity
between the relation's outer boundary and two stroked waterway centrelines
that fork and rejoin around it. No inner ring → `waterIslandRings` never sees
it, so the island exception can't apply.

Its city block WAS produced by the cutter, then discarded by the water-overlap
safety check: buffering the waterway centrelines with `ClipperOffset` returns
not just solid rings but also **hole rings** wherever the buffered lines close
a loop (the enclosed dry land), and the check tested `pointInPoly` against
every ring as if solid — so any land ringed by waterways was "in water".
The same defect blanked an entire Ghent district inside the
Muinkschelde/Leie canal loop (~200 blocks, present in every Ghent export
since the waterway check landed).

Fix (universal, no city-specific code): `waterwayVoidPolys` entries now carry
their orientation sign (+1 solid, −1 hole, from `Clipper.Area`), and the check
winds them — a point counts as waterway water only when its winding sum is
positive. Verified against the archived Erfurt tiles (corridor renders as a
cream block, island greens unchanged) and Ghent/Tilburg real exports
(district restored; Tilburg unchanged).

Known, deliberate limitation: unnamed green cover renders only on
multipolygon-hole islands (`waterIslandRings`). On a waterway-loop island it
would still be pruned and the land renders as a plain cream block — truthful
land, no error-white. Detecting loop islands in lat/lon for
`pruneIslandGreens` would need Clipper on the main thread; not worth it until
a real city shows the need.

## As shipped (deviations from the rev-2 plan below)

The rev-2 approach was implemented essentially as written, plus three things
the plan didn't foresee, all found while verifying end-to-end against the
archived Erfurt tiles:

1. **The block cutter's water-overlap safety check discarded island blocks
   two different ways.** (a) It used the *area centroid*, which for a
   banana-curved island lands out in the channel → looked like water. Fixed
   with `polyInteriorPoint` (worker), a guaranteed-inside point via the
   widest-span of a horizontal scanline. (b) Even with a correct interior
   point, the Breitstrom *waterway centreline* runs straight through the
   island corridor (OSM maps one centreline for the whole channel, not routed
   around each islet), and its buffer re-flagged the point as water. Fixed by
   making island membership skip BOTH water checks (outer polygon AND waterway
   buffer), not just the outer.
2. **Deterministic hole winding** — outer rings forced positive, inner rings
   negative in `prepareBlockData` (`ringIsPositive`) — was required for the
   nonZero void union to carve islands (and, as a bonus, park courtyards) as
   holes instead of depending on OSM's arbitrary ring winding.
3. **The named-category widening** (cemetery/garden/allotments/zoo/…, and the
   extra water surfaces) was folded in at the same time — see the two matching
   CHANGELOG entries. `parksNamedGate` / `isIslandGreenCandidate` /
   `islandGreenCover` are shared by the parks tagFilter, `pruneIslandGreens`,
   and the render branch; `tests/lib.mjs` now evaluates layer expressions
   inside the app sandbox so a tagFilter may call those helpers.

Verified offline (parks refetched live for the new query, all other layers
from the archive): the big island renders ~71% green + ~20% cream city block +
~9% thin water-edge slivers (a pre-existing simplification class, not new),
the two small islands render fully green, and no nameless green renders
anywhere off-island. All four offline tests pass; `script.min.js` builds.

---

**Original rev-2 plan (READY TO IMPLEMENT, 2026-07-07)** — superseded the
first version after a verification session refuted half of its root-cause
analysis and showed its fix B would not repair the visible problem.

## Archive contents

Alongside this file, in
`plans/2026-07-07_erfurt-river-islands-not-rendering/`:

- `export.svg` — the reproduction export
  (originally `~/Downloads/map-useit-erfurt-2026-07-07-201029-illustrator.svg`)
  showing the blank islands.
- `Screenshot 2026-07-07 at 20.22.37.png` — export crop (blank white islands).
- `Screenshot 2026-07-07 at 20.25.16.png` — OSM reference tile (islands green).
- `cache/` — the full set of cached Overpass tiles for this Erfurt bbox
  (`50.97313_11.01929_50.9821_11.03748`): `water_bodies`, `waterways`,
  `parks`, `roads`, `rail`, `street_labels`, `water_labels`. Copied here so a
  future session can re-run the export offline. **Note:** the `parks` tile
  becomes stale once this plan's query change lands (new `layerQHash`) — the
  parks layer alone will refetch live on the verification run; all other
  tiles stay valid.

## What rev 1 got wrong (verified 2026-07-07, second session)

Rev 1 claimed two stacked causes. Re-verification against the archived tiles,
the exported SVG (also re-rasterized), and live Overpass found:

1. **"Waterways stroke paints over the island holes" — refuted.** Rev 1's
   evidence was a point-in-**bbox** check; the island rings are elongated and
   concave (they hug the river bend), so their bboxes are mostly river
   channel. A real point-in-polygon + segment-intersection test of all 10
   cached waterway ways against all 5 stitched island rings gives **zero
   vertices inside and zero boundary crossings**. The claim was also
   internally inconsistent: the stroke is water-coloured (`#A4DBF3`), so
   painting over a hole would render *blue*, not the observed white — the
   white is simply the canvas background `<rect fill="#ffffff">` showing
   through the correctly punched hole. Rev 1's "fix A" (clip waterway strokes
   out of island holes) is dropped: it is a no-op here and would erase
   legitimate small streams/drains that genuinely cross an island (a hole is
   land, and a stream on that land should render).

2. **"The islands are unnamed `landuse=forest`/`natural=wood`" — wrong for
   the island that matters.** Live Overpass, tested per stitched inner ring
   of water relation 71472:
   - **Big island** (Schildchensmühle/Dämmchen — the prominent blank in the
     screenshots): cover is 2× unnamed `leisure=park` (645645134, 928856738),
     4× unnamed `leisure=garden`, 2× `landuse=grass`, 1× `natural=wetland` —
     and one ~40 m `natural=wood` scrap (1007584168) at the NW tip. Rev 1's
     fix B (drop the name gate for forest/wood only) would green only that
     scrap; the island stays blank.
   - **Small island S of Krämerbrücke**: the ring way itself is unnamed
     `natural=wood` (30600335) — the only island rev 1's fix B fixed.
   - **Tiny north islet**: ring way is `natural=wetland` (14809212).
   - **Northern islands** (mostly above the canvas): covered by the *named*
     park "Venedig" (relation 7374285), which already renders today.

3. **A third, unaddressed cause: city blocks can never exist on an island.**
   The block worker's water filter (`script.js:2186-2193`) tests the block
   centroid against every water ring independently, holes included — a
   candidate block on an island is inside the *outer* ring, so it is always
   discarded as "in water". And in the void union (`script.js:2112-2118`,
   `pftNonZero`) inner rings only survive as holes by accident of winding
   order. Net effect: whatever green cover doesn't explain stays **white**
   (raw background), not even cream — the built-up south half of the big
   island (buildings along Kreuzsand on OSM) has no correct rendering at all
   under rev 1.

## Design principle (agreed with the user, 2026-07-07)

The name gate is a *stylistic* city-wide rule and stays: unnamed green
scraps in the general cityscape must not render (this is a stylised USE-IT
map, not an ordnance survey). But an **island — a hole in a water
multipolygon — is different**: if nothing renders there it reads as an
error, so inside islands the map must show the truth, with no guesswork:

- what is actually vegetated (per OSM tags) → park-green fill;
- everything else → a normal cream city block, like any other land.

The island interior is a precise, data-derived exception zone: the stitched
inner rings of `water_bodies` multipolygons. This generalizes beyond Erfurt
to any river/lake island in any export (Strasbourg, Berlin Museumsinsel,
Paris, …) and adds zero heuristics.

## Plan

### A. Fetch unnamed green-cover candidates (parks layer query + tagFilter)

Define one curated constant near `LAYER_REGISTRY`:

```js
// Land-cover tags allowed to render UNNAMED, but only inside water-body
// island holes (see pruneIslandGreens). Everything else keeps the name gate.
const ISLAND_GREEN = {
  leisure: ['park','garden'],
  landuse: ['grass','village_green','meadow','forest'],
  natural: ['wood','scrub','wetland','heath'],
};
```

- `overpassQuery` (`script.js:164`): keep the named-only clauses for
  `leisure=nature_reserve` and `leisure=recreation_ground`; replace the
  named `park`/`forest`/`wood` clauses with **un-name-gated** clauses for
  the full `ISLAND_GREEN` set (the unnamed clause is a superset of the named
  one, so nothing is lost). Payload stays modest at USE-IT export scales —
  the whole Erfurt test bbox has only ~166 landuse/natural/leisure elements.
- `tagFilter` (`script.js:165`): accept an element if it **passes the
  existing named gate** (unchanged logic: name present, ≥4 chars, junk-name
  regex, category park/nature_reserve/recreation_ground/forest/wood) **or**
  matches `ISLAND_GREEN` (name irrelevant). The second group are only
  *candidates* — they get spatially pruned in step B, so nothing unnamed
  leaks into the general cityscape.
- Cache: `layerQHash` (`script.js:491`) hashes the query, so the parks cache
  self-invalidates; no manual busting. Note the tile cache stores
  **post-tagFilter** elements (`script.js:2776-2782`), which is why the
  pruning in step B must NOT happen in `tagFilter` (it needs water-layer
  context that doesn't exist per-element at fetch time) and must run on the
  assembled results instead.

### B. Spatial prune at the single results choke point

Add `pruneIslandGreens(results)` and call it right after the export's
results assembly (`script.js:2801-2804`), before `lastResults = results`
(2818) — so the block worker, the SVG render, and any layer-toggle re-render
(which reads `lastResults`) all see the same pruned data automatically:

- Build the island rings once: for every `water_bodies` element of type
  relation, run `stitchMultipolygonRings(el.members)` and keep the closed
  `inner` rings (lat/lon space; no projection needed).
- For every parks element that does **not** pass the named gate (i.e. it's
  only in the data as an `ISLAND_GREEN` candidate): keep it only if its
  centroid lies inside one of the island rings (plain ray-cast
  point-in-polygon). Otherwise drop it from `results`.
- If `water_bodies` is not among the selected layers there are no rings and
  all unnamed candidates drop — fail-safe, identical to today's behaviour.

### C. Render unnamed island greens (parks render branch)

In the parks branch of `renderLayerSVG` (`script.js:2400-2421`) turn
`if (!name) return;` (2406) into a branch: unnamed elements (guaranteed
island greens after step B) render with the same `preset.park` fill,
`fill-rule="evenodd"`, and the same `ctx.areaClipDs.push(d)` — id
`green_${tag}_${el.id}` (e.g. `green_wood_30600335`), `inkscape:label` from
the matched tag value capitalized ("Wood", "Park", "Garden", …). The
`areaClipDs` push matters: it's what gives footpaths crossing the island
(Dämmchen) the `_on_green` dash styling for free.

### D. Hole-aware city blocks, so the rest of the island becomes a block

Two coordinated changes in the block pipeline
(`computeBlocksAsync` packing at `script.js:2277-2295` + the worker):

- **Packing:** instead of flattening every stitched ring into the flat
  `areas`/`waterPolys` lists, keep rings grouped per source element with
  their role: `{ outers: [...], inners: [...] }` (ways: one outer, no
  inners).
- **Void union:** before `AddPath`, normalize winding — outers to positive
  orientation, inners to negative (`ClipperLib.Clipper.Orientation` +
  reverse). The existing `pftNonZero` union then *deterministically* keeps
  island holes open in `voidClean` (today it depends on OSM's arbitrary ring
  winding), so the `bbox − void` difference (2141-2145) yields a face for
  each island. This also fixes courtyard holes in named park relations as a
  side effect.
- **Centroid-in-water filter (2186-2199):** make it hole-aware per group —
  a centroid counts as "in water" only if it's inside one of the group's
  outers **and not** inside one of that group's inners. Island blocks then
  survive the safety check.

Roads that cross larger islands are already in the `lines` set, so big
islands subdivide into proper street-bounded blocks with no extra work. The
existing `minArea` (400 px²) keeps micro-islet faces from becoming confetti.

### E. Changelog

`CHANGELOG.md` "Unreleased" entry (mandatory, pre-commit hook enforces it):
river/lake islands now render truthfully — actual OSM green cover (even
unnamed) as park green, the rest as regular city blocks; unnamed green
outside islands still never renders.

## Resulting behaviour

| Case | Before | After |
| --- | --- | --- |
| Erfurt big island (Schildchensmühle) | all white | cream block base, green over the actual park/garden/grass/wetland/wood cover |
| Small island S of Krämerbrücke | white | fully green (unnamed wood ring) |
| Tiny north islet | white | green (wetland ring) |
| Northern islands (named park Venedig) | green already | unchanged |
| Unnamed green scraps anywhere else in a city | hidden | still hidden (pruned in step B) |
| Named parks/forests city-wide | rendered | unchanged |
| Island in any other city's export | white | same truthful treatment — no Erfurt-specific code |

Deliberate non-features (flag to the user if revisited): no island-size
threshold on the exception (a large inhabited island also gets truthful
green + blocks, which is exactly what we want there); `wetland` counts as
green cover; bare/unmapped island ground renders as block, not green — no
guessing beyond what OSM says.

## Files touched

- `script.js` — `ISLAND_GREEN` constant, parks entry in `LAYER_REGISTRY`
  (query + tagFilter), `pruneIslandGreens` + call site in the export flow,
  parks branch of `renderLayerSVG`, block packing in `computeBlocksAsync`,
  void-union winding + centroid filter in the block worker.
- `CHANGELOG.md` — mandatory entry.

## Verification

- Re-run the same Erfurt export against the archived tiles (all layers hit
  cache except parks, which refetches live once due to the query-hash
  change). Compare against `Screenshot 2026-07-07 at 20.25.16.png` (OSM
  reference): big island = cream block + green patches matching OSM's cover;
  the two small islands fully green; no unnamed green anywhere off-island
  (diff the parks group against the archived `export.svg` — only `green_*`
  additions inside island footprints, plus island block paths).
- Inspect the SVG: `parks` group gains `green_<tag>_<id>` paths; `city_blocks`
  gains island faces; footpaths over the island appear in the
  `roads_paths_*_on_green` groups.
- Durability spot check: one export of another river-island city (e.g.
  Strasbourg Grande Île) — expect truthful green + blocks, and confirm no
  green-scrap regression in the mainland cityscape.
- Offline suite: `node tests/road-merge.mjs`, `tests/abbreviate.mjs`,
  `tests/supersession.mjs`, `tests/pipeline-equivalence.mjs`; then
  `node tests/real-export.mjs` end-to-end.

## Cleanup (once implemented and verified)

Delete `plans/2026-07-07_erfurt-river-islands-not-rendering/` (export.svg,
screenshots, all cache tiles) and flip this file's `Status:` line to
`IMPLEMENTED <date>` per the `plans/*.md` convention.
