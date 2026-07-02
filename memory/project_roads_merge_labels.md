---
name: roads-merge-labels
description: Road segment merging + street label engine rewrite (Jun 2026 session on branch roads-merge-segments)
metadata:
  type: project
---

## Road segment merging (branch `roads-merge-segments`)

**Why:** OSM splits every street at intersections and tag changes, so one road
becomes dozens of SVG paths (Ringbaan-Zuid was 105 fragments). This bloats the
Inkscape layer list, complicates labeling, and makes streets hard to select.

**What was built:**

### 1. `mergeNamedWays()` + `stitchWays()` — segment stitcher
Stitches OSM ways sharing the SAME name AND highway class into maximal continuous
polylines ("runs"), matched on shared node IDs with a coordinate fallback. Each run
is shaped like a way `{type,id,tags,geometry}` so downstream code barely changed.
Unnamed ways pass through untouched. Parallel carriageways (divided roads) correctly
stay separate since they don't share nodes.

Both `buildRoadsLayer` and `buildLabelsLayer` consume the merged runs.

### 2. Casing/fill groups kept (now sub-grouped by class)
The two-pass casing+fill rendering was kept deliberately: drawing all casings then
all fills is what keeps junctions seamless. Merging only reduces the *number of
paths inside* each group, it doesn't replace the structure.

Update (branch `claude/street-layers-alphabetical-v0hnyk`): inside each pass the
paths are now sub-grouped by `highway=` class — `roads_casings_<hw>` and
`roads_fills_<hw>` (labelled e.g. "Residential streets") — with streets ordered
alphabetically within each class. The class subgroups stay in `ROAD_DRAW_ORDER`
so minor classes still paint under major ones, and *all* casings still precede
*all* fills, so junctions remain seamless. Casing paths now also carry
`inkscape:label` (the street name), mirroring the fills. Rationale: let designers
grab/hide/restyle a whole class at once (their real workflow) or find one named
street fast, without breaking paint order. Pairing casing+fill per street was
explicitly rejected — it would stamp a crossing road's casing over the other
road's fill at every intersection. `street_labels` is split the same way into
`labels_<hw>` subgroups (ordered by importance via `RANK`, alphabetical within);
label paint order is irrelevant since the collision engine prevents overlap.

### 3. Street label engine — complete rewrite of `buildLabelsLayer`
The labeler was rewritten from scratch over several iterations. Architecture:

**Name-centric grouping:** all runs of a street are grouped by name first. The label
is placed on the street's *main* (longest, highest-class) run, not whichever fragment
sorts first. This fixed the systemic bug where a short stub claimed the label and
suppressed the real road.

**Coverage-first placement:** scans ~30 positions along each run, sorted by
straightness. If every spot collides at full size, shrinks the font progressively
(×0.8 down to 5px floor). Only skips when even a tiny label fits nowhere. This
recovered streets like Valkenierstraat and Slotstraat that a midpoint-only placer
dropped.

**Footprint collision** (`makeFootprintGrid`): each label is a ribbon of circles
along its actual baseline (straight, diagonal, or curved), backed by a spatial hash.
The old single horizontal box mismodelled everything that wasn't horizontal — 382
false-negative overlaps. Now verified at 0 real glyph overlaps.

**Per-label oriented sub-paths** (`subPath`): every textPath label gets its own
baseline covering just its arc, oriented to read left-to-right (or bottom-to-top when
vertical). This fixed 6 mirrored/upside-down labels that a whole-path reverse missed.

**Bend cap** (`bendOver`): sums turn angles at actual path vertices; rejects
placements where the label would wrap >80° (120° as last resort). Dropped
Schouwburgring from 370° wrap to 0 labels on its hairpin.

**Square detection:** language-free and tag-based only (`place=square`, `area=yes`, or
closed pedestrian/foot way). PCA geometry was tested and rejected — bent streets score
as "2D" as real plazas, no threshold separates them. A name-suffix list is the
multilingual database the user wanted to avoid. Under-mapped squares get normal street
treatment (never wrong), properly-mapped ones centre correctly.

**Abbreviation** (`abbreviateName`): compact multilingual table (~60 rules) curated
from the OSM Name finder/Abbreviations wiki. Applied ONLY when the full name won't
fit. Covers NL/DE/Scandinavian suffixes, Romance/Slavic/Turkic/Finno-Ugric type-words,
titles, and some Cyrillic prefixes. Test: `tests/abbreviate.mjs` (26 cases).

**All label visibility defaults changed to `true`** — residential, cycleway, footway
were off; now every named road type is labeled. UI checkboxes still allow toggling.

### 4. Helper functions added
- `geoLength(geom)` — real-world polyline length in metres (zoom-independent)
- `pointAngleAtLength(pts,target)` — point + reading angle at arc-length
- `makeFootprintGrid(cell)` — spatial-hash circle collision
- `abbreviateName(name)` — multilingual abbreviator

### 5. Tests added
- `tests/road-merge.mjs` — 10 cases (chains, forks, disconnected, loops, class-change, unnamed, coord-fallback)
- `tests/abbreviate.mjs` — 26 cases (NL/DE/FR/ES/IT/PL/HU/FI/TR/BG/Cyrillic, graceful fallback)
- Both wired into `tests/smoke.sh`

### 6. Verified state (Tilburg south bbox)
- 427 labels / 328 distinct streets
- 0 real glyph overlaps (per-character extent check)
- 0 mirrored labels
- 1 label >90° bend (Voetboogplein roundabout, intentional)
- Ringbaan-Zuid: 74→~15 merged runs; road-fill/casing pairs all 1:1

## How to apply
This branch (`roads-merge-segments`) is not yet merged to main. All changes are in
`script.js` (+ `script.min.js` generated). The label engine is the most complex part
and has the most tunable constants — see inline comments for `MIN_FS`, `MIN_STREET_M`,
bend caps, `fpR`, and `style.spacing` multipliers.

Related: [[lamp-local-server]]
