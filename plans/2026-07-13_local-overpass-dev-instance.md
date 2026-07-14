# Plan: local self-hosted Overpass instance for dev/test

**Status: NOT STARTED — parked for later implementation.** Background and
hardware/cost analysis for the (rejected) full-Europe production version is
in `memory/reference_self_hosted_overpass.md`. This plan is a separate,
smaller thing: not a production primary endpoint, a **dev/test-only
instance** covering a curated, expandable set of cities.

## Why

`cache.php` is a pure response cache — it only ever serves a query that's
already been fetched once. Any time `script.js` changes what it queries (new
tags, adjusted bbox, restructured OverpassQL), or a new city is tried for the
first time, that's a guaranteed miss straight through to the public,
rate-limited Overpass endpoints. A local instance is a true OverpassQL
endpoint — same software, same query language, instant, no rate limits — so
a changed query or a brand-new city answers as fast as a repeat one. It's
frozen at import time, not live, which doesn't matter for dev/test.

## Scope

Dev/test only, local, spun up on demand. No HTTPS/CORS proxy, no
update/diff pipeline, no always-on server requirement — all of that stays
scoped to the parked production-primary idea in the reference doc.

## Data strategy

1. Local master source: `europe-latest.osm.pbf` from Geofabrik (~32 GB),
   downloaded once. Includes Turkey (Geofabrik lists it as a Europe
   subregion), so Istanbul is covered without a separate download.
2. A growing `osmium extract` config, one entry per city (name, working
   bbox or center point, margin). See City list below for the initial set.
3. Rebuild pipeline: `osmium extract` each city bbox from the local master
   file → `osmium merge` into one combined PBF → reimport into the Overpass
   container.
   - Use osmium's `complete_ways` or `smart` extract strategy (not a plain
     bbox clip) so roads/buildings straddling a city's bbox edge aren't cut
     mid-geometry.
   - Overlapping city bboxes are fine — `osmium merge` dedupes by object id.
4. No diff/update feed. Re-download the master file occasionally (or never)
   if newer OSM data is wanted.

Adding a new city later is one config line + a rebuild, not a new
infrastructure decision — reimport stays cheap since the combined dataset is
a few GB even with a few dozen cities, not full-Europe scale.

## City list — 107 entries

**100 USE-IT cities** (from `use-it.travel/sitemap.xml`, every `/cities/`
page — current, coming-soon, and archived, combined): Aachen, Amstelveen,
Amsterdam, Angers, Antwerp, Arnhem, Augsburg, Bari, Barcelona, Belgrade,
Bilbao, Bologna, Bordeaux, Braga, Bratislava, Bremerhaven, Brescia, Brno,
Bruges, Brussels, Budapest, Calais, České Budějovice, Charleroi, Chemnitz,
Coimbra, Córdoba, Drammen, Dresden, Düsseldorf, Eberswalde, Erfurt,
Esch-sur-Alzette, Ferrara, Funchal, Geneva, Ghent, Glasgow, Granada, Graz,
Guimarães, Helsinki, Innsbruck, Karlovac, Kutná Hora, Leeuwarden, Leiden,
Leuven, Liège, Lille, Ljubljana, Magdeburg, Malmö, Maribor, Metz, Milan,
Modena, Mons, Namur, Nantes, Nicosia, Nijmegen, Łódź, Olomouc, Olsztyn, Oslo,
Ostrava, Oulu, Padua, Palermo, Paris, Pilsen, Portici, Porto, Prague, Prato,
Ravenna, Rennes, Rijeka, Rouen, Rovigo, Salamanca, Tbilisi, The Hague,
Thessaloniki, Tilburg, Timișoara, Trieste, Tromsø, Turin, Utrecht, Verona,
Vicenza, Vienna, Viterbo, Warsaw, Wrocław, Würzburg, Zagreb, Zlín.

**+ 6 coming-soon cities not yet on the sitemap**: Edinburgh, Gdynia,
Genova, London, Rome, Uusikaupunki.

**+ Nievre** — the one regression-test area that isn't a USE-IT city (a
rural Burgundy bbox for hamlet/farmland rendering, see
`tests/real-export.mjs`).

An archived USE-IT city is still a perfectly good bbox for cartography
testing, so no need to filter the list down to current/upcoming only.
Scenario diversity already in this list: Funchal (island/coastal), Porto
(river estuary), Malmö/Tromsø (coastal). Add exploration cities on top only
for scenarios still missing — e.g. **Istanbul** for density (not a USE-IT
city, not in this list).

## Margins

Flat **+5 km pad** around each city's working bbox (or a 4 km-radius default
box, for a city with no working bbox defined yet). USE-IT city bboxes are
small (~1–6 km across; coastline data is fetched with that same bbox, no
wider radius needed), so this is enough for a way to terminate naturally
past the visible map edge without pulling a whole surrounding region into
every fragment.

Istanbul will be the largest single fragment by far — much denser per km²
than any USE-IT city. If the goal there is coastline/strait rendering
specifically, the working bbox itself needs to span the Bosphorus (~700
m–3 km wide at most points); the margin doesn't need to grow beyond +5 km
just because the strait is the subject.

## Software + platform

- Same `osm-3s` as the public servers. Reference build: `wiktorn/overpass-api`
  Docker image + docker-compose (see parked reference doc for the compose
  shape).
- **Native arm64 build**, not the official amd64 image under Rosetta
  emulation — Rosetta support is being dropped in the next macOS release.
  Build the same Dockerfile locally for arm64 (source compile via autotools,
  architecture-agnostic in principle).

## Hardware target: M1 MacBook Air, 16 GB RAM

Comfortable for this scope — fragmented city-level dataset is a few GB, not
the full 32 GB Europe PBF. Allocate Docker Desktop's VM 8–10 GB. DB likely
low tens of GB on disk. Import is a short, bursty job, not a concern for a
fanless machine.

## Integration

Point a dev-only Overpass endpoint config at the local instance, separate
from `cache.php` (which stays as-is, serving the fast-repeat path in both
dev and production). Exact wiring (env var vs. a second entry in
`OVERPASS_ENDPOINTS`, whether it needs to go through `cache.php` at all) is
an implementation-time decision.

## Decided

- Dockerfile/compose/extract-config files live purely locally (Coen's
  machine only), not committed to the repo.

## Open items for implementation time

- Whether the rebuild pipeline is a shell script or a Makefile target.
- Confirm the regression-test city list against `tests/expectations.json`
  before writing the initial extract config (it may have grown since this
  plan was written).
