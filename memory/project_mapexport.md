---
name: MapExport project overview
description: USE-IT City Map Builder — generates Illustrator-ready SVGs from OSM data, current architecture and state
type: project
---

## What it is
**USE-IT City Map Builder** — a browser-based tool that generates Illustrator/Inkscape-ready SVG city maps from OpenStreetMap data. Designed to automate what USE-IT volunteers currently do manually: tracing Google Maps in Illustrator to produce stylized city guide maps.

**Why:** USE-IT is a network of tourist info offices that makes free city guides. Each guide needs a hand-drawn-style city map. This tool aims to automate 80% of that work for any city in the world.

**How to apply:** Every feature decision should optimize for print-ready vector output that a designer can open in Illustrator and immediately start editing (recoloring, adding icons, annotations).

## Architecture
- **Single-page app**: `index.html` + `script.js` + `style.css` (no framework)
- **Data source**: Overpass API (OpenStreetMap), fetched tile-by-tile with adaptive delay
- **City blocks**: Web Worker + ClipperLib — buffer roads into polygons, union, subtract from bbox = individual block `<path>` elements
- **Output**: SVG with named Inkscape-compatible layers (`inkscape:label`, `inkscape:groupmode="layer"`)
- **Caching**: Server-side PHP cache (`cache.php`) + browser IndexedDB tile cache (prefix `v2_`)
- **Minification**: `minify.sh` (terser for JS, custom node script for CSS), runs via pre-commit hook
- **Deployment**: `deploy.sh` — rsync to coen.at server (see `reference_deploy.md`)

## Key files
- `script.js` — All application logic (~1500 lines)
- `index.html` — Loads `script.min.js`, `style.min.css`, ClipperLib CDN, Leaflet
- `style.css` / `style.min.css` — UI styles
- `minify.sh` — Build script (pre-commit hook)
- `deploy.sh` — rsync deploy (gitignored)
- `cache.php` — Server-side Overpass response cache

## Current color scheme (USE-IT preset)
- Background: `#ffffff` (white)
- Building blocks fill: `#FEF6ED`
- Building blocks / road casing stroke: `#F4AFA7`
- Water (all): `#A4DBF3`
- Parks/green: `#51A886`
- Roads fill: `#ffffff`
- Road casing: `#F4AFA7` (uniform width: 6)

## Layer render order (bottom to top)
`water_bodies → waterways → buildings → parks → roads → rail → tram → metro → transit_stops → labels`

Key rendering decisions:
- Buildings (blocks) render BEFORE roads — so road strokes cover block edges
- Parks render BETWEEN buildings and roads — paths through parks stay visible
- Each named park is a separate selectable `<path>` with its name as `id`
- Tram and metro OFF by default in UI

## City blocks (Web Worker + ClipperLib)
- Roads buffered by half-width using `ClipperOffset` (jtSquare, etOpenSquare)
- All voids (buffered roads + parks + water) unioned, then subtracted from bbox
- `PolyTree` traversal for hole detection (blocks with courtyards)
- Blocks with centroid inside water bodies filtered out
- Aggressive simplification: `dpSimplify` eps=8, `CleanPolygon` distance=4-6, SCALE=1
- `BLOCK_ROADS` set excludes footways/cycleways/paths from block boundaries
- `minArea = 400` filters out tiny fragments
- Progress reporting from worker to UI

## Parks filtering
- Only named parks from OSM (`["name"]` in Overpass query)
- Leisure: park, nature_reserve, recreation_ground (no garden)
- Landuse: forest (no grass, meadow, village_green, allotments, orchard)
- Natural: wood (no scrub, heath, grassland)
- Name blacklist in `tagFilter`: filters out generic names like "Green area", "Groen", "Tuin", "Garden", "Playground", etc.
- Minimum name length: 4 characters

## Print sizes
A4@300dpi (3508px), A3 (4961px), A2 (7016px), A1 (9933px), custom px.
`getScaleFactor(W)` returns `W / 4961` — all widths tuned for A3.

## Scalability concern
ClipperLib boolean operations can be slow for large areas (10x10km city). Previous attempts froze the browser before the Web Worker was added. Current optimizations (aggressive simplify, SCALE=1, square joins, batched offset) work for medium areas. Full-city exports may still need tiling (split into grid, process per tile).

## Reference files
- Tutorial PDF: `Google Drive/.../how to draw a street map.pdf` — manual process we're automating
- Sample map: `Google Drive/.../gent.ai` — Ghent USE-IT map (binary .ai, can't be read by Claude)
