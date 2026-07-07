# Plan: render the sea (natural=coastline) as water

**Status: READY TO IMPLEMENT (2026-07-07)** — scoped out of the Erfurt
river-island work; written so a fresh session can pick it up. Not started.

## Problem

In a coastal or estuary city the sea renders as one solid cream **city
block** covering the whole water. Cause: the `water_bodies` layer only fetches
closed water areas (`natural=water|bay`, docks/basins/reservoirs/marina as of
2026-07-07). The open sea in OpenStreetMap is **not** a polygon — it is
`natural=coastline`, an unclosed collection of *ways* with land on one side
and sea on the other (direction convention: sea is on the right of the way
direction... actually **land on the left, water on the right**). Nothing in
MapExport consumes coastline, so the sea is never voided and the block cutter
fills it.

The app's own intro copy already promises this ("Water — rivers, lakes, and
**coastlines**", `script.js` help text), so it currently over-promises.

Reproduction: export any coastal city — e.g. Marseille (Vieux-Port),
Barcelona (Barceloneta), Lisbon (Tejo), Genoa, Piraeus. Expect the water half
of the frame to come out cream.

## Why it's harder than a normal water polygon

Coastline ways are open. To fill the sea you must **close them against the
export bounding box**: stitch the coastline ways end-to-end, then walk along
the bbox edges between where the coastline enters and leaves the frame, on the
*water* side, to form closed sea polygons. Edge cases that make this fiddly:

- A frame entirely at sea (no coastline in view) — is it all water or all
  land? Resolve with a point-in-… test against the global coastline, or a
  simpler heuristic (if no coastline and no land polygons, assume land — the
  status quo). Probably out of scope; document the limitation.
- A frame entirely inland — no coastline, nothing to do (common case; must
  stay a no-op with zero cost).
- Islands in the sea, and lakes on islands (coastline nests). Full generality
  is a lot; USE-IT city maps rarely need nested coastline, so a first version
  can handle the common "one coast cutting across the frame" case and punt on
  nesting.
- Coastline direction correctness — get the land/water side wrong and the fill
  inverts (land painted as sea). Must assert against a known city.

## Suggested approach

1. **Fetch**: add `way["natural"="coastline"](${b});` to the `water_bodies`
   overpassQuery, and accept it in `tagFilter` (`el.tags?.natural ===
   'coastline'`). It comes back as open ways with geometry.
2. **Close against the bbox** in a dedicated helper (this is the real work):
   stitch coastline ways (reuse the same end-matching idea as
   `stitchMultipolygonRings`, but these stay open), clip to the bbox, and
   close each open chain along the bbox boundary on the water side into one or
   more sea polygons. Keep it in projected space or lat/lon consistently.
3. **Render + void**: feed the resulting sea polygons through the SAME
   `water_bodies` area path — they get the water fill, and the block cutter
   already voids anything pushed to `areas`/`waterPolys`, so blocks stop
   covering the sea for free (mirror the island-hole plumbing added
   2026-07-07). Make sure the sea polygon also lands in `ctx.areaClipDs` so
   coastal paths dash correctly over it.
4. **Verify**: a coastal city (Marseille/Barcelona) renders sea as water with
   the coast in the right place; an inland city (Tilburg/Erfurt) is a byte-for
   -byte no-op (no coastline fetched → nothing changes). Add one coastal city
   to `tests/real-export.mjs` CITIES + `expectations.json` once approved.

## Scope / non-goals

- Handle the common single-coast-across-frame case well; explicitly punt on
  deeply nested coastline (island-in-lake-in-island) and note it.
- Don't attempt global "am I at sea?" resolution for a frame with no coastline
  at all — keep that a no-op (assume land), and document it.

## Files likely touched

- `script.js` — `water_bodies` query + tagFilter; a coastline-closing helper;
  a hook where its output joins the water areas for render + block-voiding.
- `CHANGELOG.md` — one entry.
- `tests/real-export.mjs` + `tests/expectations.json` — a coastal test city.
