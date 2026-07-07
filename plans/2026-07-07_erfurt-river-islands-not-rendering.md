# Fix: river islands in Erfurt export render blank instead of green

**Status: READY TO IMPLEMENT (2026-07-07)** — investigation complete, not
yet implemented. Archived for a later session; not acted on further in this
one.

## Archive contents

Alongside this file, in
`plans/2026-07-07_erfurt-river-islands-not-rendering/`:

- `export.svg` — the reproduction export
  (originally `~/Downloads/map-useit-erfurt-2026-07-07-201029-illustrator.svg`)
  showing the blank islands.
- `cache/` — the full set of cached Overpass tiles for this Erfurt bbox
  (`50.97313_11.01929_50.9821_11.03748`): `water_bodies`, `waterways`,
  `parks`, `roads`, `rail`, `street_labels`, `water_labels`. `cache/` at the
  repo root is gitignored, so these wouldn't otherwise survive — copied here
  so a future session can re-run the export fully offline (no live Overpass
  hit) and verify the fix.
- **Screenshots** (export overview, export zoomed crop, OSM reference tile)
  pasted into the original chat were not reachable as files on disk from
  that session, so they could not be archived automatically. If they matter
  for implementation, re-attach them or drop them into this folder manually
  (e.g. `plans/2026-07-07_erfurt-river-islands-not-rendering/screenshots/`).

## Cleanup (once implementation A+B above is done and verified)

This archive folder exists only to make the fix reproducible offline. Once
the fix has landed and been verified against these same tiles, delete:

- `plans/2026-07-07_erfurt-river-islands-not-rendering/export.svg`
- `plans/2026-07-07_erfurt-river-islands-not-rendering/cache/` (all 7 tiles)
- `plans/2026-07-07_erfurt-river-islands-not-rendering/screenshots/` (if
  added)
- This plan file itself, or flip its `Status:` line to
  `IMPLEMENTED <date>` per the convention in the other `plans/*.md` files —
  don't leave it as `READY TO IMPLEMENT` once it's done.

## Context

In an Erfurt test export, the small islands in the Gera (Breitstrom) render
as plain background instead of the vegetated park/forest look they have on
OSM. The user attached three screenshots (export overview, export zoomed-in,
and the OSM reference tile) plus the exported SVG
(`~/Downloads/map-useit-erfurt-2026-07-07-201029-illustrator.svg`) and asked
to investigate using the local Overpass cache in `cache/` (gitignored,
already populated for this Erfurt bbox) instead of hitting the live API.

Investigation (cache inspection + a Python re-implementation of the app's
ring-stitching algorithm + point-in-polygon checks against the exported SVG)
found **two independent, stacked causes** — fixing only one leaves the
islands still wrong:

1. **A `waterways` stroke paints over the correctly-punched water hole.**
   The Gera is mapped as multipolygon relation 71472 ("Breiter Strom") with
   6 outer + 8 inner members. Verified directly against the cached Overpass
   response: every inner member *does* carry full embedded `geometry`
   (Overpass's `out geom` resolves relation members automatically), and
   running the app's own `stitchMultipolygonRings` (`script.js:916-951`)
   algorithm against that data in Python produces 5 correctly **closed**
   island rings. The `water_bodies` layer's combined `d` (built at
   `script.js:2437-2441`, painted via `fill-rule="evenodd"` at
   `script.js:2451`) genuinely does cut the holes — confirmed by matching
   subpath shapes in the actual exported SVG.

   The problem is layer order. `LAYER_ORDER` (`script.js:2468`) paints
   `waterways` immediately after `water_bodies`. The `waterways` layer draws
   the river's centerline (`way["waterway"~"river|canal|stream|drain"]`,
   `script.js:161-163`) as a flat **12px-wide stroke**, same water colour,
   with no awareness of the area layer's holes. I confirmed with a
   point-in-bbox check that the Breitstrom centerline ways (415219501,
   415219502) run directly through the island bounding boxes (13, 12, 7, 9
   points respectively land inside two of the islands — OSM mapped one rough
   centerline through the general corridor, not routed around each islet).
   That thick stroke repaints solid water colour right over the
   correctly-cut hole, which is exactly the white/blank patches in the
   screenshots.

2. **Even once (1) is fixed, the island would just show plain background**,
   because nothing renders a fill *for* the island — it would read as an
   accidental gap/city-block colour, not the park/forest look the user wants
   (their point: "het moet geen city block worden, want dat is het meestal
   niet"). The `parks` layer already queries `landuse=forest` and
   `natural=wood` (`script.js:165`) — the tags that plausibly cover these
   islands — but both the Overpass query and the client `tagFilter`
   (`script.js:166`) hard-require `["name"]`, and the render branch itself
   drops any unnamed element (`script.js:2412-2413`,
   `if (!name) return;`). Small river islets are essentially always unnamed,
   so they're filtered out at three separate points before ever reaching a
   `<path>`.

## Plan

### A. Stop `waterways` strokes from painting over `water_bodies` island holes

- In `buildSVGContext` (`script.js:2470-2489`), add a new accumulator next to
  the existing `areaClipDs: []`: `waterIslandHoles: []`.
- In the generic area-rendering loop in `renderLayerSVG`
  (`script.js:2438-2441`, the `el.type==='relation'` branch that already
  calls `stitchMultipolygonRings`), when `layer.id==='water_bodies'`, also
  push each `inner` ring's path `d` (via the same `geomToPathD` call already
  used for `allD`) onto `ctx.waterIslandHoles`. `water_bodies` always
  renders before `waterways` per `LAYER_ORDER`, and `ctx` is a single object
  threaded through every `renderLayerSVG` call in `buildSVG`
  (`script.js:2592-2599`), so the holes are guaranteed to be populated by
  the time `waterways` renders.
- In the line-rendering branch (`script.js:2452-2455`), when
  `layer.id==='waterways'` and `ctx.waterIslandHoles.length`, wrap the
  emitted stroke `<path>` in a `<g clip-path="...">` whose clipPath is one
  combined path: a full-canvas rect (`M0,0H${W}V${H}H0Z`, using `W`/`H`
  already in scope at `script.js:2363`) followed by each island hole ring,
  all under `clip-rule="evenodd"` — the standard "cut these holes out of an
  otherwise-full clip region" trick. This is the same clipPath idiom already
  used for `greenblue_clip` in `buildRoadsLayer` (`script.js:1163-1172`),
  including the existing `ctx.illustratorCompatible` /
  `ctx.illustratorDefs` branching so the clipPath still lands in the
  document root for the Illustrator export flavour. Scope this to
  `layer.id==='waterways'` only — no other line layer (rail/tram/roads)
  needs it.

This only affects rendering where a waterway centerline happens to cross an
island hole; waterway strokes with no accompanying area polygon elsewhere in
an export are untouched.

### B. Let unnamed forest/wood cover render with the park fill

Reuse the existing `parks` layer/pipeline rather than inventing a new
category — it already targets `landuse=forest` and `natural=wood` with the
right green fill (`preset.park`) and already handles multipolygon holes via
`stitchMultipolygonRings`. Only the "must have a name" gate needs to relax,
and only for those two land-cover tags (leave `leisure=park` /
`nature_reserve` / `recreation_ground` name-gated as-is — those are genuine
named amenities):

- `overpassQuery` (`script.js:165`): drop `["name"]` from the
  `landuse=forest` and `natural=wood` clauses only.
- `tagFilter` (`script.js:166`): restructure so `landuse==='forest'` /
  `natural==='wood'` elements pass without a name, while the `leisure=*`
  clauses keep the existing name/junk-name checks.
- Render branch (`script.js:2411-2424`): the `if (!name) return;` guard
  needs to only apply when there *is* no fallback — for unnamed
  forest/wood elements, generate a stable id from the OSM id (e.g.
  `wood_${el.id}`) instead of `safeName(name)`, and skip the
  `inkscape:label` attribute (or default it to `"Wood"`/`"Forest"`) instead
  of bailing out. The path-building logic itself (way vs. relation/
  `stitchMultipolygonRings`, `ctx.areaClipDs` push) is unchanged and already
  generic enough to reuse as-is.

Because `layerQHash` (`script.js:498-501`) hashes `overpassQuery.toString()`
into the cache key, this query edit automatically invalidates the stale
`parks` cache entries — no manual cache-busting needed, next export just
refetches.

Confirmed scope with the user: the dropped name requirement applies **only**
to `natural=wood` and `landuse=forest` — every other tag in this query
(`leisure=park`, `leisure=nature_reserve`, `leisure=recreation_ground`) stays
name-gated exactly as today, so odd scraps of `landuse=grass`/gardens/etc.
in cities don't start turning green. This will also surface unnamed
forest/wood patches elsewhere in an export bbox (not just river islands) —
that's accepted as the intended generalization, not scope creep.

## Files touched

- `script.js` — `LAYER_REGISTRY` parks entry (query + tagFilter), the
  `renderLayerSVG` area/line branches, `buildSVGContext`.
- `CHANGELOG.md` — mandatory entry per `CLAUDE.md` (pre-commit hook enforces
  this for any `script.js` change).

## Verification

- Start the local LAMP stack and open the app at `http://localhost:8080/…`
  (per `CLAUDE.md`); re-run the same Erfurt export that produced the
  attached SVG. Because `cache/` already has the matching tiles
  (`mapexport_v3_*_..._50.97313_11.01929_50.9821_11.03748.json.gz`), this
  hits cache, not live Overpass, and re-fetches only the now-changed `parks`
  query.
- Confirm visually: the islands near Comthurgasse/Schildchensmühle and
  Kreuzsand now show the park green fill instead of blank/white, and the
  `waterways` stroke no longer bleeds across them.
- Inspect the exported SVG: `waterways` `<path>` should now sit inside a
  `clip-path` group with hole subpaths; `parks` group should contain new
  anonymous `wood_*`/forest paths over the island footprints.
- Run the offline regression suite (`node tests/road-merge.mjs`,
  `tests/abbreviate.mjs`, `tests/supersession.mjs`,
  `tests/pipeline-equivalence.mjs`) to make sure nothing else broke, plus
  `node tests/real-export.mjs` for an end-to-end sanity pass.
