# Changelog

All notable changes to MapExport are recorded here, **newest at the top**.

> **Maintenance rule (for humans and AI assistants alike):** every commit that
> adds, changes, or removes a feature/behaviour MUST add an entry to the top of
> the "Unreleased" section below in the same commit. Keep entries short and
> user-facing — describe *what changed and why*, not every line touched. Group
> related work under one dated entry. Pure-internal churn (formatting, comment
> typos) does not need its own entry.

## Unreleased

### 2026-07-17 — Engine v2: scrub/heath now paint as field tint, not cream
- `natural=scrub|heath` land (e.g. Ghent's Dok-Zuid, Nièvre's countryside)
  now paints through the Countryside layer as field-tint like farmland,
  instead of showing as a crème "Uncategorized" fallback patch.

### 2026-07-17 — Engine v2: named squares get their own "Squares & plazas" layer
- Named pedestrian squares/plazas (Domplatz, Willy-Brandt-Platz, …) now get
  their own "Squares & plazas" layer in the editor instead of being folded
  into "Water & park names", and no longer also show up as a street label on
  the same plaza.

### 2026-07-17 — Water/park names label once per feature, not per OSM segment
- Rivers and parks made of multiple OSM ways or polygons (e.g. a river split
  into several segments, a park split into several polygons) now get one
  name label for the dominant part of the feature instead of one label per
  segment. A genuinely long river or park may still repeat its name far away.

### 2026-07-17 — Exports: every SVG object id is now unique and stable
- Every object id in an exported SVG (roads, rail, tram, metro, water/park/
  landcover fills, feature and street labels, POIs, and — in Engine v2 —
  waterways/landcover/beach/city blocks/fallback patches) is now guaranteed
  unique across the whole document, so editors like Illustrator or Inkscape
  never silently collapse two same-named objects (e.g. a repeated street or
  river name) into one. Repeated names get a deterministic `_2`, `_3`, …
  suffix in document order, so the same input always produces the same ids.

### 2026-07-16 — Exports: no races, frozen bbox, empty frames render
- Double-clicking Export can no longer start two exports at once, and a slower
  superseded run can no longer overwrite a newer export — the map you can
  download always comes from the most recent run of the chosen engine.
- A running export now sticks to the bbox it started with, so changing the area
  (history or boundary pick) mid-export can't mix old data with a new frame.
- Engine v2: a genuinely empty area (nothing mapped, no failed tiles) now paints
  a full covered frame via the coverage fallback instead of erroring; the
  "check your connection" message is reserved for actual fetch failures.

### 2026-07-14 — Engine v2: "Sand" layer and less green confetti
- The v2 "Beaches" layer is now "Sand" and labels each patch by what OSM
  actually records — Beach, Dune, Sandbox, or plain Sand — so inland sandy
  ground stops being called a beach. Coastal dunes (`natural=dune`) now render.
- Tiny grass patches (street verges, tree pits, single-bush beds mapped as
  `landuse=grass`) below ~80 m² are no longer painted, so parks and lawns stay
  green without the map filling up with green confetti. Coverage is unchanged.

### 2026-07-14 — Overpass failover, timeouts and cancellation unified
- Every Overpass request in both engines now goes through one shared fetch
  contract: a hung endpoint hits a hard per-attempt timeout, goes on a short
  backoff, and a healthy endpoint takes over instead of the export stalling
  or the same dead host being retried. When an export fails, all of its
  still-running requests (including losing race requests) are cancelled at
  once. Error messages now name the actual kind of outage — timeout, rate
  limit, HTTP error, unreadable response or network drop — and which tile
  failed, and a failing cache read is reported as such instead of silently
  looking like an empty cache. An empty-but-valid Overpass answer is still
  treated as a legitimate empty map layer, never as an error.

### 2026-07-14 — Cache endpoint rate-limits writes and bounds its disk use
- Each IP may now store at most 300 cache entries per 10 minutes; anything
  more gets HTTP 429 and the app simply proceeds as if the cache missed, so
  exports never fail because of the throttle. The cache also cleans up after
  itself during writes: entries past the 7-day TTL are dropped proactively
  and, above 2 GiB total, the oldest entries are pruned first. Decision
  recorded with ME-04c: browsers keep writing directly (no server-side
  Overpass proxy), so Overpass load stays spread across user IPs.

### 2026-07-14 — Cache endpoint rejects bad uploads and writes atomically
- The server-side tile cache (`cache.php`) now refuses uploads that aren't
  shaped like our own Overpass tiles before anything touches disk: wrong
  method/content type, corrupt or truncated gzip, non-JSON payloads, bodies
  over 8 MiB compressed or 80 MiB decompressed (gzip bombs included). Valid
  entries are staged in a temp file and renamed into place, so a reader can
  never see a half-written tile and a failed upload can never clobber a good
  cached entry. Existing cache hits, misses, the `?exists=` batch probe and
  legacy uncompressed entries behave exactly as before.

### 2026-07-14 — Engine v2: countryside/roadless frames are covered again
- A v2 export of a frame with no block-cutting roads (open countryside, or a
  view with only paths or tunnels) no longer comes back blank. The frame is now
  painted by the normal coverage layers instead of showing the page through.

### 2026-07-14 — Live previews no longer replace full downloads
- Reduced previews now have separate, engine-aware state, so changing layers
  cannot replace the last complete SVG download and stale preview updates are
  ignored. The preview clearly labels when Download refers to the last export.

### 2026-07-14 — Failed exports stop without replacing the last good map
- Missing Overpass tiles and city-block calculation errors now stop both export
  engines with a clear message instead of producing an incomplete SVG. Export
  controls always recover, while the previous preview, download and history
  remain untouched.

### 2026-07-13 — Engine v2: green-dominant ground beats cream; standalone buildings (experimental)
- Parking areas (`amenity=parking`) now count as city fabric in the block
  classification, so parking-covered land paints as ordinary cream blocks
  instead of surfacing as "Uncategorized/Parking" patches. Classification
  only — nothing new is painted or cut.
- Green-open land no longer gets cream "Residential" coverage patches for its
  unmapped slivers (path verges, yard gaps OSM leaves without a polygon).
  The coverage remainder merges into the piece's largest landcover polygon —
  one grown green shape in the panel instead of a green area plus cream
  wedges beside it.
- The SVG layer tree groups "Water bodies" and "Waterways" under one "Water"
  parent layer. Pure panel organization: both children keep their exact paint
  position.
- A land piece whose ground OSM paints mostly green (≥ 60% landcover) now
  renders as open land even when it carries buildings — the buildings are
  drawn individually as small outlined cream blocks instead of the whole piece
  painting cream. The Gera island in Erfurt shows its meadows with the mills
  standing on them; the same rule greens OSM-attested grass grounds (barracks
  yards, campus lawns) in the other areas.
- A residential/commercial landuse polygon alone no longer turns sparsely
  built green open space into a cream city block (buildingless-green veto,
  now measured against sparse building coverage rather than zero buildings).
- Engine v2 fetches real building footprints (geometry) for drawing; v1 keeps
  its bounds-only fetch and is unchanged. Bounds rectangles drew a
  campus-sized "building" across Ghent's Coupure — caught in the screenshot
  sweep, fixed, re-verified.

### 2026-07-12 — Engine v2: river islands classified per land-mass, opaque paint, wider landcover cull (experimental)
- River islands and other water-severed parcels are now classified on their own.
  When water (or a park) splits a road-bounded face into separate land masses,
  each mass gets the city/open-land test individually instead of the whole face
  taking one verdict — so the wooded island in the Gera at Erfurt paints as
  countryside with its greenery showing through, not as a solid city block.
  Built-up masses are never affected. No island heuristics: the same
  classify-and-subtract machinery, applied per mass.
- Everything paints fully opaque — no more see-through. The only softened ink
  left in engine-v2's own output, the waterway lines (92% opacity), now paint
  the same solid blue as the water bodies they join, removing a faint seam where
  a river meets a lake. (Rail lines keep their look for now; they render through
  the shared v1 code and flatten when that layer is reworked.)
- More invisible countryside shapes are dropped from the file. Woodland fully
  hidden under a named park or under water (not just under city blocks) is now
  culled from the render, so the SVG carries far fewer paths a designer can
  never see (Tilburg: ~900 fewer landcover/grass paths). Purely a file-size and
  tidiness win — nothing that was visible changes.

### 2026-07-12 — Engine v2 classification fixes: fewer Uncategorized patches, greener land, no transit dots (experimental)
- Faces covered by `landuse=residential/commercial/retail` but without building
  footprints now paint as ordinary city blocks instead of Uncategorized patches
  — much of OSM maps a district by its landuse polygon and never its buildings
  (dominant in Erfurt). Industrial land is deliberately not included, so open
  quays stay open. The signal classifies only; it never paints or cuts.
- The landuse promotion is vetoed on open land (green/woodland ≥ 35% of a
  face): a green face never turns cream just because a landuse polygon overlaps
  it. Extending that veto to faces with buildings was measured on the five
  validation cities and rejected — it would wrongly flip about 10% of Oulu's
  genuinely urban faces to Uncategorized.
- Dense city pockets inside a large forest, harbour or park face now paint as
  city blocks rather than Uncategorized (Bremerhaven's Bürgerpark-area blocks,
  some with over a hundred buildings, were mislabelled).
- Grass now reads as green: `landuse=grass`/`village_green` and unnamed
  parks/gardens paint as a green tint (visible through Uncategorized holes and
  in the countryside) instead of surfacing as "Uncategorized › Grass" clutter.
  Grass is deliberately kept out of the countryside/open-land classification —
  it only paints.
- Edge blocks classify correctly: the buildings query now reaches ~100 m past
  the frame, so a clipped block whose buildings sit just off-map is no longer
  mistaken for empty land.
- Engine v2 exports no longer include the transit-stops dot layer.

### 2026-07-12 — Engine v2 declutter: no rail carve/corridor beds, no plaza paths, slivers become road infill (experimental)
- Rail, tram and metro lines no longer carve a corridor out of the city
  blocks, and the "Rail corridor beds" layer is gone. The carve and the bed
  that repainted it cream were net-zero ink: blocks now simply paint under
  the drawn tracks — same image, and the designer-facing clutter (no-name
  "Railway" patches between tracks, rail-side slivers, a whole beds layer)
  disappears with it.
- Squares stop being special: a square-tagged plaza no longer cuts the
  blocks or paints its own white polygon — the area reads cream like the
  block it sits in, and the "Squares" layer is gone. Named squares keep a
  map label (styled like park names for now).
- Junction pockets (sub-3×3 mm crumbs fully surrounded by roads) no longer
  clutter the Uncategorized layer as a "Slivers" list. They paint once, as a
  single "Junction infill" path in road white at the bottom of the roads
  layer — one selectable path instead of hundreds of micro-patches.

### 2026-07-12 — "Water & park names" no longer labels neighbourhoods
- The water/park feature-label layer stops fetching and rendering
  `place=suburb|neighbourhood|quarter` nodes (Tilburg showed "Korvel",
  "Trouwlaan", "Oud-Zuid" among park names; Ghent, Bremerhaven and Erfurt had
  the same leak). The layer now does exactly what its name says, on both v1
  and v2 — the clause had been there since the layer's origin.

### 2026-07-12 — Engine v2 hamlet blobs require a rural place node (experimental)
- Fake hamlets in city exports are gone. A cream hamlet pad now paints only
  where OSM attests a nearby rural settlement via a `place` node — a
  hamlet/isolated_dwelling/farm/village within 1000 m, or a `locality`
  (unpopulated named spot) within 300 m — instead of anywhere a large green,
  harbour or park face read as "countryside". Ungrounded blobs fall back to
  cream (Bremerhaven's 36 and Oulu's 71 invented hamlets drop to zero; Nievre's
  59 real ones stay). Each surviving hamlet is now named after its nearest
  attesting place node ("Hamlet “Montgaudon”").

### 2026-07-11 — Engine v2 sea map label + landcover occlusion cull (experimental)
- The sea now renders its name ON the map (not just as the layer name), styled
  like the water/park feature labels with the same halo and collision grid. The
  anchor is a robust interior point of the sea water (largest piece), so a
  coastal frame no longer risks placing it on land. A new "Sea name" field next
  to the v2 toggle (and a `--sea-name=<name>` flag in the export test) overrides
  the coastline-derived name; a nameless sea keeps the layer named "Sea" and
  draws no label. Sea naming is now judged on stitched coastline chains, not
  raw ways: an island ring split into individually-open ways no longer names
  the whole sea (Oulu's islet "Elba" did, until now).
- Landcover (farmland/meadow/forest/wood tint) that is fully hidden under the
  city blocks is now dropped from the drawing — countryside texture that only
  ever sat invisibly beneath urban cream no longer bloats the file. Paint-only
  and conservative: coverage is unchanged (nothing that shows is removed), and
  any doubt keeps the element (Bremerhaven 60→55, Oulu 240→220 landcover paths).

### 2026-07-11 — Engine v2 beach layer, grouped Uncategorized, scaled waterways, named road/rail groups (experimental)
- Beaches and sand (`natural=beach|sand`) now paint as their own "Beaches"
  layer (pale sand fill), above parks — previously label-only, so they only
  ever surfaced as an "Uncategorized" patch label underneath.
- The Uncategorized layer now groups its patches into named sub-groups (one
  per category — "Railway", "Parking", etc., plus "Uncategorized" for
  untagged land and "Slivers" for junction micro-patches below the block
  floor), so a designer can select a whole category at once instead of
  scrolling a flat list.
- Waterway stroke width now scales with export size instead of a fixed 12px,
  matching the width the face cutter already subtracts at every export size
  (previously the two only agreed by coincidence at the A3@300dpi baseline).
- Road and rail groups in the layer panel now carry human-readable names
  ("Main roads (outline)", "Residential streets (surface)", "Railway
  sleepers", …) instead of anonymous ids or v1's raw per-tag labels.

### 2026-07-11 — Engine v2 design contract + named corridor-bed paths (experimental)
- New `ENGINE-V2.md`: the binding design contract for engine v2 (coverage
  promise, complement rule, paint order, named-green rule, sea semantics,
  change discipline). Referenced from CLAUDE.md and README so any future
  change is checked against the invariants instead of re-deriving them.
- Corridor-bed strokes now carry ids and labels (`bed_rail_<osmid>`,
  "Rail bed" / "<line name> (bed)") instead of being anonymous paths.

### 2026-07-11 — Engine v2 named-green rule restored, named waterway paths (experimental)
- Nameless sports/recreation green (pitches, sports centres, golf courses)
  no longer paints: it was a v2-only addition that broke v1's "only named
  parks and greenery" rule inside cities (Bremerhaven review). Those
  elements are still fetched, but label-only — a pitch under an
  Uncategorized patch now labels it "Pitch". Named parks, gardens and
  nature reserves are untouched (Bremerhaven's parks layer: 79 paths → 23,
  all named).
- Waterways render as one named path per waterway instead of v1's single
  merged anonymous path ("path124" in editors): same-named segments merge
  into one path ("Geeste"), nameless ones are labelled by their waterway
  tag ("Stream", "Canal"). Stroke styling unchanged.

### 2026-07-11 — Engine v2 zero bare pixels, no more fake hamlets (experimental)
- Big faces only classify as countryside when OSM actually shows open land
  (green + landcover) across a real share of them (water excluded — harbour
  basins sit inside dock faces and faked a rural signal). Dock peninsulas and
  industrial estates now get ordinary curb-to-curb city blocks instead of
  hamlet blobs: Bremerhaven loses its 32 invented in-city "hamlets"; Nièvre's
  real countryside (59 hamlets, 7 rural faces) is untouched.
- The countryside fallback remainder now subtracts the PAINTED hamlet shapes
  instead of the raw cluster blobs, so no seam can open between a blob and
  the cream around it (the Oulu forest-edge bites).
- Sub-400px² faces and block pieces are no longer dropped as noise — they
  paint as Uncategorized cream (a dropped sliver was a bare-page sliver;
  junction micro-faces were a measured bare-pixel class in every city).
- Net effect, measured on the rendered ink: 0.000% bare pixels across all
  seven validation areas (was 0.002–0.024%); Oulu's last recorded coverage
  allowance is gone.
- Uncategorized patch labels read the tag value only ("Railway", "Parking
  “Autoranta”"); plain "Uncategorized" is reserved for truly untagged land.

### 2026-07-11 — Engine v2 rail beds, Uncategorized layer, render-based coverage check (experimental)
- Rail/tram/metro corridors no longer show bare page beside the tracks: the
  block cutter carves them at 20px·sf but the drawn tracks are narrower, so
  every line left an unpainted flank on each side (plus a bare cap past each
  spur end). A cream corridor bed now paints the whole carved band, above the
  block layers and below water so rivers still show under rail bridges. This
  also fills the previously-allowed rail-yard gap in Oulu.
- The fallback layer is now called "Uncategorized" in the SVG, and every patch
  carries a designer-facing label saying what OSM thinks the land is
  ("Uncategorized — landuse=railway", "… amenity=parking “Autoranta”"), driven
  by a new label-only Overpass sweep (broad landuse/natural/parking/aeroway/
  military fetch that is never painted — the paint rules are tag-specific, so
  widening the fetch cannot widen what paints).
- New render-based coverage check in the export test: the finished SVG is
  rasterized over a magenta page in headless Chrome and actual bare pixels are
  counted and clustered. The geometric lint checks the worker's model of the
  map; this checks the ink, so paint/model disagreements (the rail flanks
  above, simplification drift) can no longer pass silently. Same significance
  floor and --record approval channel (allowance key: bareBlobs); skipped
  gracefully when no Chrome binary is available.

### 2026-07-11 — Engine v2 countryside coverage + square band fixes (experimental)
- Engine v2 no longer leaves bare page background inside large rural/harbour
  faces: the countryside remainder (whatever landcover, green, water and
  hamlet blobs do not cover) now paints cream through the coverage fallback,
  so dock yards, quays and unfarmed floodplain render as land instead of
  white holes (Bremerhaven's Geeste bend was the reference failure; Nièvre's
  unmapped patch heals too). The coverage lint stops counting unpainted
  countryside placeholders as covered on v2 runs — coverage must be proven
  by real paint.
- Squares no longer leave a bare road-width ring: the plaza absorbs its
  former ring street by stroking its outline in plaza colour at full street
  width (the perimeter still cuts blocks at that width, but M6 excluded
  squares from road stroking, so the band was painted by nothing).
- Fallback patches carry a self-coloured seam stroke so abutting cream
  shapes don't show hairline background between them.
- The synthetic sea takes its name from the coastline when OSM offers
  exactly one (open ways only — island rings never name the sea); otherwise
  it stays the generic "Sea" layer name.

### 2026-07-11 — Engine v2 validation sweep (experimental)
- Engine v2 validated against all five visual cities (Tilburg, Ghent, Paris,
  Bremerhaven, Oulu) plus Erfurt (river islands) and the Nièvre countryside,
  with every lint and the coverage guard green. Erfurt's Gera islands render
  through classification, subtraction and paint order alone — no island
  machinery. The coastline→sea closure was rebuilt for coasts that cross the
  frame many times (Oulu's archipelago broke the one-crossing version):
  one shared boundary walk now joins all crossings, and closed coastline
  rings become island holes. Island rings that straddle the frame edge are
  rotated so clipping splits them only at true crossings (Oulu's edge islands
  were silently dropped before). v2 exports now also carry per-city count
  floors in the test suite (`<city>-v2` keys), and the coverage guard learned
  a per-city allowance for intentional bare spots — rail-yard corridors
  between widely spaced tracks show the page background in v1 and v2 alike
  (Oulu's yard is the reference case), so a human-approved `--record` run
  bakes the observed count in instead of failing forever.

### 2026-07-11 — Engine v2 squares and tunnels (experimental)
- Engine v2 renders pedestrian squares (place=square, or area=yes on a closed
  way) as one open plaza in street colour instead of stroking their outline as
  a ring street, and drops tunnels (tunnel=yes/culvert) from the drawn
  road/rail/tram network and street labels — a tunnel no longer looks like a
  surface street. Bridges, building passages and covered streets still draw;
  the metro layer keeps its underground lines by design. Still behind the
  default-off "Engine v2 (experimental)" toggle; v1 output is unchanged (the
  square predicate is shared with the label engine, refactor verified
  behaviour-neutral).

### 2026-07-11 — Engine v2 labels (experimental)
- Engine v2 now places street and water/park labels through the full v1 label
  engine — same placement, collision grid, abbreviations and repeats, in both
  the standard and Illustrator pipelines. Rail corridors and feature names
  claim their space first, exactly as in v1. Still behind the default-off
  "Engine v2 (experimental)" toggle; v1 is untouched.

### 2026-07-11 — Engine v2 transit rendering (experimental)
- Engine v2 now draws railways (hatched sleepers), tram and metro lines and
  transit stops, through the same builders v1 uses — they were already fetched
  as block-cutter input, now they paint too. Path dashes and their white twin
  over parks/water were already live via the shared clip plumbing. Still behind
  the default-off "Engine v2 (experimental)" toggle; v1 is untouched.

### 2026-07-11 — Engine v2 area features (experimental)
- Engine v2 now paints water, named parks/green, sports grounds and
  countryside land cover, classified from one combined fetch through an ordered
  AREA_FEATURES table (first match wins). Coastlines close into a filled sea,
  and rivers/canals/streams draw as lines. City and hamlet blocks have water,
  green and waterway strokes carved out mechanically (no water heuristics), and
  a final pass fills any leftover buildingless land — dry river islands, data
  gaps — as cream in a separate, counted `fallback_blocks` group, so land is
  never left bare. Still behind the default-off "Engine v2 (experimental)"
  toggle; v1 is untouched.

### 2026-07-11 — Engine v2 face cutter (experimental)
- Engine v2 now builds city blocks. Faces are the space between roads and
  railways (tunnels excluded); a face becomes a cream block only when it is
  small and actually contains a building, so open land and water are never
  painted over — no water heuristics involved. Large rural faces instead grow
  chunky hamlet blobs from their buildings, as in v1. Blocks render in a
  flat cream (`#FEF8F1`) below everything else. Still behind the default-off
  "Engine v2 (experimental)" toggle; v1 is untouched.

### 2026-07-11 — Engine v2 scaffold (experimental)
- A new "Engine v2 (experimental)" toggle in the export options (default off)
  routes exports through the new `engine-v2.js` instead of the v1 pipeline. It
  renders roads only for now and ignores the layer checkboxes. v1 is untouched
  and remains the default.

### 2026-07-10 — Countryside follow-ups: forest z-order, lighter buildings fetch
- Land cover now paints big polygons first and small ones on top: a CORINE
  meadow import spanning the whole bbox as one multipolygon used to hide every
  forest patch inside it.
- The on-demand buildings fetch for hamlet blocks now asks Overpass for
  bounding boxes only (`out tags bb`) instead of full outlines — a fraction of
  the payload; after the buffer-and-merge the blocks look the same.

### 2026-07-10 — Countryside rendering: farmland, forest, hamlet blocks
- Rural exports no longer paint every road-bounded face as a solid building
  block. A face whose paintable area exceeds 0.35 km² (dense-city faces top
  out around 0.08 km²) is classified as countryside: it stays unfilled, and
  only its actual building clusters — fetched on demand, buffered and merged
  into chunky hamlet blocks — get the block fill. Pure-city exports never
  fetch a single building and render exactly as before.
- New default-on "Countryside" layer paints farmland/meadow/orchard/vineyard
  in a pale field tint and unnamed forest/wood/scrub/heath in park green, at
  the very bottom of the stack. Inside cities these polygons sit under the
  block fill and stay invisible, so the urban "named destinations only" style
  is untouched.
- Each hamlet block is its own named shape (`hamlet_1`, …) in the SVG;
  countryside test area added (`node tests/real-export.mjs nievre`).

### 2026-07-10 — Every water body is its own named SVG shape
- The water bodies layer now emits one `<path>` per lake/reservoir/dock,
  named after its OSM name where present (`water_Étang_du_Perron` style ids),
  instead of one merged path for the whole layer — matching how parks already
  worked, so individual water bodies can be selected, recoloured, or hidden
  in Illustrator/Inkscape.

### 2026-07-10 — "Find my location" button in the city search
- A locate icon inside the search field flies the map to your current
  position via the browser Geolocation API and fills the search box with the
  reverse-geocoded place name. Strictly opt-in: the browser's permission
  prompt only appears when you click it, never on page load.

### 2026-07-10 — Blocks with an internal pond no longer discarded whole
- A city block containing a small internal water feature — a courtyard pond,
  fountain basin — near its horizontal midline could pick its "guaranteed
  interior" test point from inside that pond instead of the surrounding dry
  land, so the water-overlap safety check discarded the whole block (Ghent,
  a full block near Burgstraat/Abrahamstraat rendered entirely blank except
  for its pond). The interior-point picker now excludes hole spans (ponds,
  courtyards) from its scanline before choosing a point, so it can no longer
  land inside a hole.
- Added a coverage lint (`tests/coverage-lint.mjs`, wired into
  `tests/real-export.mjs`) that rasterises every block/water/park/road/
  waterway/rail shape in an export and fails the run if any patch of land
  above ~3x3mm on the printed sheet ends up painted by nothing — the general
  form of both this bug and the 2026-07-09 waterway one. It found this one.

### 2026-07-09 — Land enclosed by forking waterways no longer renders white
- City blocks on land ringed by waterway centrelines — a river splitting and
  rejoining around an island (Erfurt, between Bergstrom and Walkstrom), or a
  whole district inside a canal loop (Ghent, south of Sint-Lievenslaan) —
  were wrongly discarded as "in water" and left the area blank white. The
  water-overlap check now winds the buffered waterway rings (solid vs hole)
  instead of treating every ring as water, so enclosed dry land keeps its
  cream blocks. Restores ~200 missing blocks in the Ghent test area alone.

### 2026-07-09 — Export filenames now include a place name
- The exported filename now includes a place name, derived silently in the
  background: reverse-geocoded from the bbox centre after drawing a
  rectangle, or taken from the matched place when using "Use admin
  boundary". No UI field for this in the normal flow — it just works.
- If no name could be derived (rural/unnamed areas), clicking **Export
  SVG** now pops up a small modal asking for one before the export starts;
  cancelling it cancels the export. This is expected to be rare.
- The exported filename is now `map-{style}-{name}-{timestamp}.svg`
  instead of just `map-{style}-{timestamp}.svg`. When OSM returns several
  usable place names for a location, the shortest one is used.
- **Recent exports** now show the area name and time instead of the style
  name (which was always "useit" and told you nothing) — long names are
  truncated with "…" so the list doesn't wrap.

### 2026-07-09 — Illustrator export: curved labels no longer "dance"
- Per-glyph curved labels in the Illustrator pipeline sampled their rotation
  from a polyline whose bends sit at discrete vertices, so a single letter
  could swallow an 8–11° direction change while its neighbours stayed flat —
  designers reported letters visibly dancing along streets. The glyph
  baseline is now resampled and low-passed (Gaussian sigma ≈ 0.9em) before
  layout, and narrow glyphs get a minimum tangent-sampling window, spreading
  each bend smoothly across neighbouring letters. Standard (Inkscape/others)
  pipeline unchanged.

### 2026-07-08 — Tests no longer build or run minified code
- `tests/real-export.mjs` now loads `script.js` directly, the same source the
  browser runs in dev — it no longer builds `script.min.js` first. There was
  never a real reason for this test to exercise minified output, and it meant
  the minifier ran (and left gitignored build artifacts sitting around)
  on every test run.
- Minification (`tools/minify.sh`) now happens in exactly one place: the
  GitHub Actions deploy workflow, right before rsyncing to production.
  `script.min.js`/`style.min.css` should exist there and nowhere else — not
  the repo, not a local checkout, not any test run.
- No behaviour change to the exported maps themselves; this is test/build
  tooling only.

### 2026-07-07 — River/lake islands render truthfully instead of blank
- **Fixes islands in a river or lake exporting as blank white** (reported for
  the Gera islands in Erfurt — Schildchensmühle/Kreuzsand). An island is a
  hole in a water multipolygon; nothing was drawn there, so it read as an
  error rather than the green-and-buildings it is on the ground.
- Inside such islands the map now shows the truth with no guesswork: whatever
  is actually vegetated on OpenStreetMap renders as park green (even when
  unnamed — small islets rarely carry names), and the rest becomes a normal
  city block, exactly like any other land. Everywhere *outside* an island the
  stylistic rule is unchanged: nameless green (stray verges, single trees)
  still never renders — this is a stylised USE-IT map, not an ordnance survey.
- City blocks can now form on islands at all (the block cutter treats a water
  body's inner rings as holes, and no longer discards a concave island block
  whose centre happens to fall out in the channel or under a river centreline).
- Generalises to any city with a river/lake island, not just Erfurt.

### 2026-07-07 — More kinds of water and green now recognised
- **Water bodies** additionally include harbour/dock water, retention and
  village basins, marinas, and the legacy `waterway=riverbank` river-area
  tag — so a harbour or basin no longer paints a solid cream block over open
  water. (Open sea via `natural=coastline` is still not handled — tracked in
  a separate plan.)
- **Parks & green** additionally include named cemeteries, gardens,
  allotments, recreation grounds and zoos — large named green spaces that
  read as green on the map but previously fell through as city block. The
  existing "must have a name" gate and junk-name filter are unchanged, so no
  new stray green appears.

### 2026-07-07 — Escape place names in search result rendering
- City search and admin-boundary search results now HTML-escape the place
  name pulled from Nominatim before inserting it via `innerHTML`, closing a
  DOM XSS vector if Nominatim (or a network MITM) ever returned a crafted
  `display_name`.

### 2026-07-07 — Print size is now derived automatically, not user-picked
- Removed the "Print size" dropdown (A4/A3/A2/A1 @ 300dpi + custom px) —
  those paper-format names never mapped onto USE-IT's own print convention
  and didn't guarantee any particular aspect ratio anyway.
- The export's physical size (and with it, resolution and line/label
  weights) is now derived from the shape of the drawn area: fit as large as
  possible inside the standard USE-IT plattegrond envelope (67.5 × 40.5cm @
  300dpi, or that rotated for a taller area), without exceeding it on either
  edge. Shown live under the bbox coordinates once you draw an area.
- Teams needing a bigger (gigantic-city) or smaller (inset) final size scale
  the exported SVG themselves in Illustrator/InDesign — stroke widths and
  labels scale proportionally, so the result is identical to exporting at
  that size directly.

### 2026-07-06 — City blocks no longer streak over rivers and canals
- **Fixes cream block fill showing on top of water** (reported in Ghent, along
  the Leie): the block cutter simplified water/park polygons and waterway
  centerlines with a flat tolerance instead of the renderer's own
  (`EPS.area_large` / `EPS.line`), so its cut void drifted from the water
  shape actually painted — the same bug class fixed for roads on 2026-07-05,
  never extended to water. The cutter now uses the renderer's exact
  tolerances, and its water-overlap safety check now uses a true
  area-weighted centroid (not a vertex average, which missed elongated
  blocks hugging a curvy bank) and also checks buffered waterway
  centerlines, not just closed `natural=water` polygons.
- **Multipolygon water/park boundaries (e.g. a river mapped as dozens of way
  segments under one relation) are now stitched into real closed rings**
  before use, instead of force-closing each member's open arc into its own
  chord-shaped fake polygon — the dominant cause of the Ghent streaks, since
  the Leie is one 40-member relation with 38 open arcs. Applies everywhere
  relation members are turned into polygons: block-cutting, plain area/line
  rendering, and named park labels.

### 2026-07-06 — Deploy moved to GitHub Actions with a restricted server user
- Deploying is now `.github/workflows/deploy.yml` (manual `workflow_dispatch`
  only — never on push), triggered via the GitHub UI or `gh workflow run
  deploy.yml`. The latter only needs `gh` auth, so deploys can be triggered
  from anywhere, including a Claude Code mobile session — no local SSH key
  required anymore.
- Server credentials (deploy SSH key, host, user, path) now live only as
  encrypted GitHub Secrets, never in a repo file. `deploy.sh` at the repo root
  (gitignored) is now just a thin wrapper around `gh workflow run`.
- The server-side deploy account changed from the admin's own root SSH key to
  a dedicated, restricted non-root user that can only write the handful of
  files it needs to (`index.html`, `script.min.js`, `style.min.css`,
  `cache.php`, `fonts/`) — it can't reach `cache/` (protected by a sticky bit
  on the parent directory) or anything else on the server, and has no sudo.
  Limits the blast radius if the deploy secret is ever compromised.

### 2026-07-06 — Minified assets no longer committed; no local build step
- `script.min.js` / `style.min.css` are now gitignored build artifacts instead
  of tracked files — they're never committed. `index.html` loads `script.js` /
  `style.css` directly, so day-to-day development needs no build/minify step
  at all.
- The minifier (`tools/minify.sh`) now only runs on demand: `tests/real-export.mjs`
  builds `script.min.js` fresh before testing the shipped code path, and
  `deploy.sh` builds both minified files and a rewritten production
  `index.html` (pointing at them) right before syncing to the live server.
- The pre-commit hook no longer regenerates minified assets on every commit —
  it only enforces the changelog rule now.

### 2026-07-06 — Illustrator-compatible export pipeline
- **New format choice in Export options** (like Maperitive's
  `compatibility=illustrator`): **SVG (Illustrator)** — now the default, since
  most USE-IT designers work in Illustrator — and **SVG (Inkscape / others)**
  for standards-based tools. Illustrator's SVG import is buggy enough that one
  file cannot be optimal in both worlds.
- **The Illustrator variant** (filename suffix `-illustrator`) stays inside the
  SVG subset Illustrator actually parses: curved street names are laid out
  glyph by glyph with real Arial metrics (its `<textPath>` import doesn't
  rotate glyphs before v23.0.6 and explodes text into per-letter objects in
  every version), halos are stacked text copies instead of `paint-order`,
  clipPaths move to the document root, one font name instead of a CSS list,
  font weights snap to real Arial styles (400/700), and all Inkscape/RDF
  editor metadata is stripped. A warning appears when the canvas exceeds
  Illustrator's 16383pt artboard limit.
- **The standard variant modernised** (rendering unchanged): feature-label
  halos are now a single `paint-order="stroke"` text element, `textPath` uses
  plain `href` (no xlink namespace), and shared stroke styling moved from
  every road/rail/tram/metro path onto its class group — smaller files, same
  picture.
- **The Simplify slider is gone**: exports always use the former default
  (position 2, 0.6px tolerance). The other positions were never a real
  trade-off worth a control.
- `tests/real-export.mjs --illustrator` writes the Illustrator variant next to
  the standard trail, with its own profile assertions.

### 2026-07-06 — Footways, cycleways, paths and steps become dashed trails
- **Small path classes no longer masquerade as streets**: footway, cycleway,
  path and steps now render as a single dashed stroke in the casing colour —
  no casing, no white fill — so real streets (which bound city blocks) are
  instantly distinguishable from paths (which don't). Dash code: long dash =
  cycleway, short dash = footway, fine thin dash = dirt path, wide rungs =
  steps. Fixes the root cause too: the old dash patterns were never scaled to
  the export size, so at print resolution these classes rendered as solid
  mini-streets with casings (reported on Locomotiefboulevard and Willem
  II-passage at Tilburg station).
- **Paths turn white over parks and water**: a clipPath overprints the dashes
  in white wherever they cross park or water polygons (salmon would vanish on
  the green), flipping colour exactly at the area edge.
- **No more labels on footways and cycleways**: path-class ways are unlabelled;
  the cycleway toggle is gone from the label controls.

### 2026-07-05 — City blocks hug the road casings exactly
- **Block contours now match the rendered streets** (reported on Groenstraat /
  Flemingstraat / Heuvelring, Tilburg): the block cutter used a much coarser
  copy of the road network than the renderer (8px simplification vs ~0.6px,
  square buffer joins vs round stroke joins/caps, integer coordinates, 4–6px
  polygon cleaning, 2px output simplify), leaving irregular white gaps between
  blocks and casings. The cutter now buffers the exact merged+simplified
  polylines the renderer strokes, with round joins/caps at sub-pixel arc
  tolerance on a 10× integer grid, and tucks the block edge 0.5px under the
  casing (roads paint over blocks) so no hairline can show.

### 2026-07-05 — Labels: on-canvas policy, one collision grid, rail clearance, no dwarf labels, cleaner curves
- **Labels never overlap railways**: the hatched rail bed claims its corridor
  in the label collision grid before any label is placed, so street and
  feature names dodge the tracks (reported on NS Plein and Sint
  Ceciliastraat, Tilburg).
- **Labels stay on the canvas**: entirely-offscreen placements are gone (they
  were invisible but still consumed the street's repeat budget, leaving the
  visible part nameless); a partially clipped label at the map edge is only
  placed once the same street has a fully visible label. Single-placement
  labels (squares, roundabouts, rivers, parks) are fully visible or skipped.
- **One collision grid for all labels**: park/water/suburb names and street
  names now share the street-label footprint grid — feature labels (fixed
  anchor) claim space first, street labels (many candidate spots) dodge them.
  Fixes river names printing on top of quay-street names in Ghent (~60 cases).
- **No more dwarf labels** (reported on Roggestraat, Tilburg): font shrinking
  now only compensates for short streets, never squeezes a label past
  collisions — floor at 50% of the class size for a street's first label,
  75% of full size for repeats (instead of shrinking to 5px absolute).
- **Curved labels are typographically clean** (reported on Stratinghpad and
  Doctor Leijdsstraat, Tilburg): a label is never draped over a corner or
  tight elbow (>30° of turn within ~2 glyph heights — measured over the whole
  window, so multi-vertex elbows are caught too), and `textPath` baselines
  get their corners rounded (Chaikin) so glyphs no longer jam on a bend's
  inside or tear a gap on its outside ("DOC TOR").
- `tests/svg-lint.mjs`: off-canvas/clipped-only/feature-clipped and ALL
  label-overlap findings are errors now (previously warnings pending the
  engine fix), and a new check fails any label crossing a rail corridor.
  `label-placement.mjs` grew from 37 to 46 checks covering the new policies.
- Internal: stale `landuse_*`/`poi_*` ids removed from `LAYER_ORDER`;
  unknown layer ids now sort last instead of first (latent `indexOf||999`
  bug); `water_labels` builds before `street_labels` (feature-first grid
  order — z-order between the two is irrelevant as they can't overlap).

### 2026-07-04 — Street labels stay inside their street, in every renderer
- **Straight labels must stay inside the road fill**: merged with the
  2026-07-02 fitted-baseline work below — a straight label is allowed only
  while the road deviates from the span's least-squares baseline by less
  than BOTH the room between glyph edge and road-fill edge AND 30% of the
  font size; beyond either it falls back to a road-following `textPath`.
  Previously the label rotated to the road's *local* angle at its centre, so
  names lifted off the street wherever it curved under them (reported on
  Koopvaardijstraat, Sint Annastraat, Hooistraat, Professor Dondersstraat).
- **Labels keep clear of junction mouths**: placement is inset from both ends
  of a street run, so a name can no longer poke into a crossing street.
- **Vertical centring is baked into geometry** — baseline = road axis +
  0.36×font-size (rotates with the anchor), and `textPath` baselines are
  pre-shifted perpendicular. The `dominant-baseline` attribute is gone:
  QuickLook and Adobe Illustrator ignore it and rendered every label sitting
  on/above its street. Output is now identical in every renderer (also
  resolves the baseline item from the retired Illustrator-interop plan).
- `tests/svg-lint.mjs` gained a within-street containment check (label glyph
  band vs the street's own white fill, matched by name), so this defect class
  now fails the test run instead of needing eyes.

### 2026-07-03 — Test harness can now fail: SVG lint, label unit tests, per-city floors
- New `tests/svg-lint.mjs`: deterministic checks on any exported SVG — NaN/undefined
  in attributes, empty/mirrored/upside-down labels, dangling `textPath` refs,
  label-on-label overlap, labels outside the canvas (warning; known engine
  behaviour). Guarded by its own `tests/svg-lint-selftest.mjs` (11 checks).
- New `tests/label-placement.mjs` (31 checks): unit + integration tests for the
  street-label engine — reading-angle normalisation, straight-vs-textPath choice,
  reversed-geometry orientation, repeat spacing, same-name suppression, squares,
  roundabouts — running the real `buildLabelsLayer` from `script.js`.
- `tests/real-export.mjs` is now a test, not just a demo: it exits non-zero on
  lint errors, zero roads/labels, or a layer under its per-city floor
  (`tests/expectations.json`, captured at ×0.5 with `--record` on an approved
  run; Tilburg + Ghent recorded). It also refuses to run against a stale
  `script.min.js` and properly drains cache-write POSTs instead of sleeping 2s.
- `tests/smoke.sh` now runs all six offline suites (incl. supersession) before
  the Overpass round-trip; `OFFLINE_ONLY=1` skips the network step.
  `tests/query-equivalence.mjs` warns on >1.5× over-fetch (accidentally widened
  query). Scanner/parsing code deduplicated into `tests/lib.mjs`, which now
  hard-fails if extraction stops matching `script.js` instead of silently
  skipping layers.
- `tests/viewer.html` accepts `?crop=x,y,w,h` for 1:1 detail screenshots.
- svg-lint judges canvas clipping per street, not per label: a clipped repeat
  next to a fully visible sibling label is fine (per Coen's rule); warnings
  now only flag invisible placements and streets with no fully visible label
  (tilburg: 21/24 such cases, ghent: 23/55 — the engine fix planned in
  `plans/2026-07-03_labels-canvas-clipping-and-unified-collision.md`).

### 2026-07-04 — More realistic export-time estimates and a simpler layers tip
- Step 1 (export area) help now quotes realistic export times (under a
  minute / 2–5 min / 10+ min) instead of the old "seconds" estimate, and
  notes that the public Overpass API's rate limiting causes pauses.
- Step 2 (map layers) help replaces the buildings-specific slowdown note
  with a generic "disable unneeded layers" tip.

### 2026-07-02 — Straight street labels no longer veer off gently bending roads
- Straight (rotated `<text>`) labels are now anchored on the **least-squares
  baseline of the whole label span** — centroid position + fitted angle —
  instead of the point and single-segment heading at the span's midpoint.
  On a slightly bendy street the old anchor tilted the label by up to the
  full bend and pushed it to the outside of the curve; the fit averages the
  bend so the label sits centred on the street.
- The straight-vs-`textPath` decision is now **deviation-based** (road may
  wander at most 30% of the font size from the fitted baseline) instead of
  the old 12°-total-bend rule, which was length-blind: long labels could
  drift visibly off-road while short ones were needlessly exploded into
  per-letter `textPath` objects. Spans that deviate more keep `textPath`.
- Collision footprints for straight labels now follow the straight baseline
  that is actually drawn (previously they were stamped along the curved
  road, so the collision model disagreed with the render on exactly the
  labels that veered). New offline regression test: `tests/label-fit.mjs`.

### 2026-07-03 — Multi-city visual test harness
- `tests/real-export.mjs` accepts named test areas (`tilburg`, `ghent`, `paris`,
  `bremerhaven`, `oulu`) besides raw bboxes; the city is now part of the export
  filename. `tests/visual-cities.sh` runs the four extra cities in one go.
- The extra cities are **gated**: they run only after the standard Tilburg
  export passed visual inspection and Coen approved it (`tests/README.md` §7).
  Each area is a Tilburg-sized chunk chosen to surface bugs Tilburg can't
  (medieval core, boulevards, harbour, 65°N projection).
- `tests/IMPROVEMENTS.md` records prioritized findings on harness gaps (no
  assertions in real-export, subjective visual check, Tilburg-only fixtures).

### 2026-06-28 — Tracked build + changelog enforcement
- The build is now version-controlled: `tools/minify.sh` (terser for JS,
  clean-css for CSS) replaces the personal gitignored `minify.sh`.
- A tracked pre-commit hook (`.githooks/pre-commit`, activated via
  `bash tools/setup-hooks.sh`) re-minifies staged source and **rejects commits
  that change app source without a `CHANGELOG.md` entry** (bypass:
  `SKIP_CHANGELOG=1`). Keeps `script.min.js`/`style.min.css` and the changelog
  from drifting.

### 2026-06-28 — Street layers grouped by class, alphabetical within
- **Roads:** the exported SVG now sub-groups road paths by `highway=` class
  inside each rendering pass (`roads_casings_<hw>` / `roads_fills_<hw>`, e.g.
  "Residential streets"), ordered alphabetically within each class. The two-pass
  structure (all casings, then all fills) and `ROAD_DRAW_ORDER` are preserved, so
  junctions stay seamless and minor roads still paint under major ones. Casing
  paths now also carry `inkscape:label`. Designers can grab/hide/restyle a whole
  class at once, or find one named street fast.
- **Street labels:** split into `labels_<hw>` subgroups (importance-ordered,
  alphabetical within). No visual change — labels never overlap, so paint order
  is irrelevant.
- Casing+fill were deliberately *not* paired per street: that would stamp a
  crossing road's casing over the other road's fill at every intersection.

### 2026-06-28 — Illustrator-editable labels + headless export harness
- Straight street labels emit as a single rotated `<text>` (one editable object
  in Illustrator) instead of per-letter `<textPath>`; curved stretches keep
  `<textPath>`. Export filenames use local time.
- Added a headless export + visual-check harness (`tests/real-export.mjs`) that
  runs the shipped `script.min.js` outside a browser.

### 2026-06-25 — Road segment merging + street label engine
- `mergeNamedWays` stitches OSM ways sharing name + highway class into maximal
  polylines, cutting SVG path count and improving label placement.
- Name-centric label engine: collision detection, abbreviation, straightest-run
  placement, no upside-down labels.

### 2026-06-25 — Developer documentation
- Added a comprehensive README and a mobile usability notice.

---

_Earlier history predates this changelog; see `git log` for the full record._
