# Plan: pedestrian squares as open areas, and tunnels not drawn as surface

**Status: READY TO IMPLEMENT (2026-07-07)** — two small, independent
rendering-correctness items scoped out of the Erfurt river-island work. Either
can be done alone. Not started.

## A. Pedestrian squares should render as an open filled area, not a ring

### Problem
A city square mapped as an area (`highway=pedestrian` + `area=yes`, or
`place=square`) is drawn as if its outline were a **street**: the block cutter
strokes the square's perimeter as a road casing and fills the interior as a
tiny city block. The result is a square with a road-coloured border and a
block in the middle, instead of one open plaza in street colour.

The label side already knows about squares — `looksLikeSquare` (`script.js`,
the street-label builder) detects `place=square` / `area=yes` / closed
pedestrian ways so it can lay the name flat instead of along a line. The
**geometry** side doesn't have the matching concept.

Reproduction: any medieval core with a real plaza — e.g. a Grote Markt / Plaza
Mayor / Piazza. Compare the plaza rendering to how it "reads" on OSM.

### Suggested approach
- Detect an area-square the same way `looksLikeSquare` does (share one
  predicate — don't fork the logic).
- Render it as a filled polygon in the road/pedestrian surface colour, and
  either (a) exclude its perimeter from the road stroking pass, or (b) let the
  block cutter treat it as an open surface (part of the street network's
  negative-space, not a block). Option (b) is likely cleaner: add square
  polygons to the road-void set so the plaza reads as continuous paved space.
- Keep non-square pedestrian ways (regular footways) exactly as today.

### Watch out for
- Don't turn every closed pedestrian way into a plaza — a pedestrianised
  street loop or a building courtyard footway shouldn't flood-fill. Reuse the
  square heuristic's existing guards (roundabout exclusion etc.).

## B. Tunnels shouldn't be drawn as surface roads/rail

### Problem
A road or railway with `tunnel=yes` (or `layer<0` underground) is drawn as a
normal surface line. A road tunnel under the river or a rail tunnel under the
old town then looks like a surface street/track — e.g. a bridge-less crossing
straight over the water, or a line cutting through blocks it actually runs
beneath.

Reproduction: a city with a central road/rail tunnel — many German
Innenstädte have a `B-road` or tram in tunnel under the core.

### Suggested approach
- In the roads/rail/tram tagFilters (or at render), detect `tunnel` present
  and truthy and either drop the segment or render it as a faint dashed
  "under" style, per USE-IT taste. Simplest first version: **drop** tunnel
  segments from the surface network (both the drawn line AND the block-cutter
  input, so a tunnel doesn't bound a block).
- Confirm bridges (`bridge=yes`) are unaffected — those ARE surface and must
  keep rendering.

### Watch out for
- Covered/arcade streets (`covered=yes`) and short `tunnel=building_passage`
  segments — decide whether those count. A pedestrian passage under a building
  is usually still walkable surface; `building_passage` probably should stay.
  Scope the drop to `tunnel=yes|culvert` on vehicle/rail ways first.

## Files likely touched (either item)

- `script.js` — square predicate reuse + area-fill/void; tunnel filtering in
  road/rail tagFilters or render + block-data prep.
- `CHANGELOG.md` — one entry per item shipped.
