# Plan: small local Overpass instance for dev/test

**Status: NOT STARTED — design decisions settled; ready for a Tilburg data
pilot when implementation is requested.**

Background and hardware/cost analysis for the rejected full-Europe,
production-style instance is in `memory/reference_self_hosted_overpass.md`.
This plan is deliberately different: it creates a small, frozen Overpass
database for the areas that MapExport actively tests. It is not a public or
production endpoint and it does not require the full Europe database.

## Goal

Make live-data development tests fast and predictable when an Overpass query
changes or `cache.php` cannot be used. With the local database already built
and running, the seven real-export validation areas and the larger Tilburg
fixture area should fetch in seconds without contacting a public Overpass
server.

Areas outside that known test footprint must continue to use the existing
public endpoint pool. A local database must never return a plausible but empty
response merely because the requested area was not imported.

## Non-goals

- No full-Europe database, locally or on a VPS.
- No production traffic or public access.
- No minute updates, replication feed, or continuously current OSM data.
- No high availability, HTTPS, authentication, or server hardening beyond
  binding the test service to the local machine.
- No promise that an arbitrary new city will be instant. It uses public
  Overpass until it is deliberately added to the test corpus and the small
  database is rebuilt.

## Initial test corpus

The initial local footprint comes from the live-data tests, not from the
USE-IT city list:

| Area | Test bbox (south, west, north, east) | Purpose |
| --- | --- | --- |
| Tilburg fixture | `51.530,5.040,51.590,5.130` | Query, capture, timing, and pipeline tests |
| Tilburg export | `51.545,5.07,51.562,5.1` | Default real-export approval gate; contained by the larger fixture |
| Ghent | `51.03438,3.70857,51.06093,3.74599` | Medieval streets and canals |
| Paris | `48.81896,2.33906,48.84935,2.39433` | Dense roads, rail, metro, and labels |
| Bremerhaven | `53.51265,8.56247,53.56336,8.61380` | Harbour and large water areas |
| Oulu | `64.99163,25.43747,65.02165,25.51197` | High latitude and coastline |
| Nièvre | `46.92190,3.85448,46.94663,3.90324` | Rural hamlets, farmland, and forest |
| Erfurt | `50.97313,11.01929,50.9821,11.03748` | River-island regression case |

The larger Tilburg fixture replaces the smaller Tilburg export bbox for data
extraction, leaving seven extraction footprints in total.

The source of truth remains `tests/real-export.mjs` for the seven named export
areas and `tests/lib.mjs` for the larger Tilburg fixture. The planned local
coverage definition copies their exact selection coordinates so non-JavaScript
tooling can read them. A generator then uses the real tiling and engine-v2
building-padding rules to calculate the **safe query rectangles** that local
Overpass must contain. A consistency check must fail with a useful message if
either test source or either fetch-footprint rule changes without regenerating
coverage. Offline tests that merely use invented coordinates with mocked data
do not belong in the corpus.

Adding another area requires more than a database rebuild because the retained
PBFs contain no OSM objects for a new footprint. Follow the coverage-expansion
workflow below: add the test/coverage definition, obtain a source PBF that
contains the new area, extract it, merge it with the retained area fragments,
and import a candidate database. It is not necessary to refresh every existing
area or grow toward all USE-IT cities.

## Data acquisition without Europe

1. For each footprint, use the smallest maintained Geofabrik country or
   sub-region extract that fully contains the extraction boundary. In practice
   this means small regional/country sources for the Netherlands, Belgium,
   Paris, Burgundy, Bremerhaven, Erfurt, and Finland rather than
   `europe-latest.osm.pbf`.
2. Treat those source PBFs as rebuild inputs, not permanent database contents.
   They may be deleted after a successful import and downloaded again for a
   later refresh. Record each source URL, published date, and checksum in a
   generated build manifest.
3. Expand each generated safe query rectangle by 5 km before extraction. A
   safe rectangle already includes grid snapping and the engine-v2 100 m
   building pad; the still larger extraction footprint provides room for ways
   and relations that cross its edge.
4. Run `osmium extract` with the **`smart` strategy**. Do not offer
   `complete_ways` as an alternative: it can leave multipolygon relations
   incomplete, while MapExport depends heavily on building, water, land-use,
   and coastline geometry.
5. Process one footprint at a time, or at most the one or two footprints that
   share a source PBF. Do not use one giant multi-extract job. Osmium's memory
   use grows with the number of simultaneous extracts and the source's highest
   node ID.
6. Merge the seven fragments into one combined PBF. Overlapping fragments are
   acceptable. Run `osmium check-refs -r` on the result and stop the rebuild if
   node, way, or relation references are missing.
7. Keep the individual area-fragment PBFs, combined PBF, and imported Overpass
   database as generated local artifacts. Retaining the small fragments makes
   it possible to add or replace one area without downloading and extracting
   every other source again. Measure their actual sizes during the pilot; do
   not retain the old plan's unsupported “few GB” or “low tens of GB” estimates
   as promises.

The 5 km extraction margin is a starting value, not a substitute for the
reference check. If `smart` extraction plus that margin fails validation or a
known coastline/multipolygon smoke query, increase the affected footprint and
record why.

## Local Overpass service

- Use the same Overpass API implementation (`osm-3s`) as public servers, based
  on the `wiktorn/overpass-api` container setup.
- Use a native arm64 image on the M1 Mac. Pin the image or source revision so a
  rebuild does not silently change infrastructure behavior.
- Import the combined PBF into a persistent local database volume. Disable
  replication updates and area generation unless a real MapExport query is
  shown to need Overpass area objects; current bbox queries should not need
  them.
- Bind the HTTP port to `127.0.0.1`, not all network interfaces.
- Add `Access-Control-Allow-Origin: *` at the local proxy. Browser tests served
  from another localhost port are cross-origin even though both services are
  on the same computer. No credentials are sent, so a wildcard is sufficient
  for this loopback-only test service.
- Provide repeatable `build`, `start`, `stop`, `status`, `rebuild`, and `smoke`
  commands. Whether the wrapper is a shell script or Makefile is not important
  as long as those operations are documented and non-interactive.
- Distinguish container-running from database-ready. The readiness check must
  execute a tiny known query inside the Tilburg coverage and validate an HTTP
  200 Overpass JSON envelope whose `elements` value is an array.
- Build a replacement database/volume first, run its checks, and only then make
  it the active local database. A failed refresh must leave the previous known
  good snapshot usable.

## Routing: local for the corpus, public everywhere else

Production and ordinary development keep the current public endpoints by
default. Local routing is a deliberate dev/test mode and must be impossible to
activate on the deployed site. The planned activation is `?overpass=local` in
a browser page whose hostname is loopback, and an explicit command-line flag
or environment setting in Node tools. Production hostnames must ignore/reject
the browser flag. Do not persist the mode in `localStorage`, where it could be
forgotten between sessions.

When local mode is enabled:

1. Plan the complete fetch footprint before choosing an endpoint. This includes
   adaptive or grid-aligned tiles and the engine-v2 100 m building pad.
2. Use the local endpoint only when **every** planned query bbox is contained
   by the safe coverage manifest and the local readiness check passes.
3. For a covered export, use the local endpoint exclusively. Do not add it to
   the public race or create public workers alongside it.
4. If any part lies outside safe coverage, use the public endpoint pool for the
   entire export. Do not mix a frozen local snapshot with current public data
   in one SVG.
5. Surface the chosen source (`local snapshot <id>` or `public Overpass`) in
   test output and the browser progress log.

Selection-level routing, rather than deciding independently per tile, prevents
seams caused by different OSM snapshots. The generated build manifest supplies
the snapshot ID and the safe coverage rectangles. Containment must fail closed:
unknown, malformed, or partly overlapping bboxes go public rather than local.

If the local readiness check shows that the service is unavailable, a covered
area falls back to the public endpoint pool and normal public cache behavior.
The fallback must be visible in the test output/browser progress log; it must
not look like a successful local run. Availability failures are connection
errors, timeouts, and server-side 5xx responses. A query/client error such as
HTTP 400 still fails normally because sending the same broken query to a public
server would only hide the real problem.

If the local service fails after an export has fetched some data, discard the
partial local results and restart the **whole** Overpass fetch on public
endpoints. Never continue the remaining tiles on public endpoints and mix two
snapshots in one SVG.

The default fallback favors convenient development. The validation workflow
also needs a strict `require-local` option: it fails instead of falling back
and is used whenever the acceptance criterion is “prove this sweep made no
public Overpass request.” Uncovered areas use public Overpass in ordinary local
mode; `require-local` rejects them with a coverage error.

## Cache isolation

Local requests should bypass `cache.php` reads and writes:

- The purpose is to exercise a changed query even when the normal cache is
  stale or unusable.
- Current cache keys describe the query and bbox, but not the endpoint or OSM
  snapshot. Sharing them would let a frozen local response masquerade as a
  current public response, and vice versa.
- A running local database should already be fast enough that persistent HTTP
  response caching adds little value.

Public requests outside local coverage keep the existing cache behavior and
cache keys unchanged. `tools/prefetch-validation-cache.mjs` remains a
public-cache maintenance tool; the local test workflow should not need it and
must not fill the public cache namespace from the frozen snapshot.

## One routing contract for every live-data consumer

The eventual implementation must not change only the browser path. These
callers currently obtain live Overpass data and need deliberate behavior:

- `script.js`, including single-tile racing, multi-tile workers, and the
  on-demand block-building fetch;
- `tests/real-export.mjs`;
- the fixture capture, query-equivalence, and timing tools using
  `tests/lib.mjs`;
- `tools/prefetch-validation-cache.mjs`, which must explicitly remain on the
  public/cache path rather than inheriting local snapshot data.

Endpoint selection, coverage containment, snapshot identity, and local health
must have one contract with tests, rather than separate hard-coded endpoint
lists that can drift. The implementation plan must include mocked routing tests
for covered, uncovered, partially covered, padded, local-down, and production
cases before any real network test is used.

## Starting, rebuilding, expanding coverage, and updating OSM data

These are four separate operations:

- **Start:** start the existing Overpass database. This does not inspect,
  download, extract, or update OSM data.
- **Rebuild:** recreate the Overpass database from the retained combined PBF
  for the current snapshot. This is useful after a container/database problem
  and does not download newer OSM data.
- **Expand coverage:** add a new local test area. This needs an OSM source for
  the new footprint and produces a new area fragment, combined PBF, database,
  and snapshot ID. Existing unrelated fragments need not be refreshed.
- **Refresh:** deliberately create a new OSM snapshot. This is the only normal
  operation that replaces OSM data for areas already covered.

There is no timer, startup check, or automatic freshness schedule. Changing an
Overpass query or bypassing an unusable cache does **not** require fresh OSM
data; those are the main cases this local service is intended to make fast. A
manual refresh is appropriate when:

- a regression or feature explicitly depends on OSM edits made after the
  current snapshot;
- the test baselines are intentionally being brought up to current map data;
- Coen simply decides the snapshot is old enough to replace.

The service should show the snapshot ID and source dates in status/test output
so that decision can be made without guessing how old the database is.

### Adding one new area

1. Add the area to the relevant live-data test list and coverage definition.
2. Generate its safe query rectangle and 5 km extraction rectangle using the
   same tiling/padding rules as the existing corpus.
3. Reuse a retained source PBF only if it contains that rectangle and its
   recorded date is acceptable. Otherwise download the smallest current
   Geofabrik region that contains it and verify/record its checksum.
4. Create a `smart` area fragment and validate its references.
5. If its padded footprint does not overlap an existing footprint, merge the
   new fragment with the retained existing fragments. Existing areas keep
   their old data and source dates.
6. If it overlaps an existing footprint, re-extract the overlapping group from
   one source version and replace those old fragments. Do not merge different
   versions of the same OSM objects into the candidate PBF.
7. Validate the new combined PBF, import a candidate database, run the new-area
   and existing smoke gates, and switch only after they pass.

This is a coverage expansion, not a full refresh. The build manifest records a
source date/checksum per fragment, and the snapshot ID covers the complete
manifest. It is acceptable for disconnected test areas to have different OSM
source dates because one export never mixes local and public data and the exact
provenance is recorded. A full refresh of every fragment remains available if
a uniform source date is ever desired.

A rebuild of the same snapshot should reuse the retained, checksummed combined
PBF. An explicit **refresh** downloads current regional inputs and creates a
new combined PBF and snapshot ID. The full refresh workflow should:

1. Download the selected regional source files, verify provider checksums, and
   record the exact observed checksums in the candidate build manifest.
2. Generate and validate the coverage/build manifest.
3. Extract each padded footprint with `smart`.
4. Merge the fragments and run `osmium check-refs -r`.
5. Import into a new Overpass database volume with updates and areas disabled.
6. Start the candidate service and wait for query-level readiness.
7. Run the smoke and correctness gates.
8. Record source dates/checksums, tool/container versions, combined-PBF size,
   database size, import time, peak memory if available, and snapshot ID.
9. Switch to the candidate database only after all required gates pass.

The decided refresh policy is manual and pinned: ordinary starts and database
rebuilds reuse the existing combined PBF; an explicit refresh command
chooses newer Geofabrik inputs and creates a new combined PBF and snapshot ID.
The large regional inputs may then be deleted, but the much smaller individual
fragments, combined PBF, their checksums, and their build manifest must be
retained with the database. This gives repeatable tests without pretending the
data is permanently frozen.

## Acceptance gates

### Correctness and isolation

- The combined PBF passes `osmium check-refs -r`.
- A readiness query returns valid Overpass JSON from the imported snapshot.
- Every current live-data layer can query the larger Tilburg fixture locally.
- The seven named real-export areas pass their existing automated expectations
  and visual gates using the local endpoint.
- Routing tests prove that all seven areas and the larger Tilburg fixture use
  local only, while an arbitrary bbox outside the manifest uses public only.
- A partially covered or building-padded request uses public only.
- Ordinary local mode falls back visibly to public Overpass when the local
  service is unavailable, without mixing local and public results.
- Strict `require-local` mode fails clearly when the service is unavailable,
  the bbox is outside coverage, or any public request would be made.
- Network logging during the local seven-area sweep contains no public
  Overpass hostname.
- Local responses never appear in the normal `cache.php` namespace.

The initial snapshot is not allowed to rewrite expectations automatically. If
an existing count differs because OSM genuinely changed since an expectation
was recorded, review the SVG and the data difference first; update expectations
as a separate, explicit test-baseline change.

### Performance on the M1 MacBook Air, 16 GB

Measure both cold start and warm operation. Initial targets, to be confirmed by
the first Tilburg pilot, are:

- an already-imported database becomes query-ready within 30 seconds of
  `start`;
- an uncached combined Tilburg query returns within 3 seconds;
- all Overpass fetching for an uncached Tilburg real export finishes within
  10 seconds;
- the service and an export run without memory pressure or swapping severe
  enough to make the machine unresponsive.

Record results rather than weakening a missed target silently. If the combined
query is the slow part, measure individual layer queries before changing the
dataset or architecture. Rebuild time is secondary because rebuilds are
manual; start/query time is the developer-facing goal.

## Implementation phases

1. **Data pilot:** build only the larger Tilburg fragment, import it, verify
   references/readiness, and measure size, import time, memory, and query time.
   Stop and revise the estimates if this is not comfortable on the target Mac.
2. **Seven-footprint database:** add the other six fragments, merge, validate,
   import into a fresh volume, and repeat the measurements.
3. **Routing and cache isolation:** implement the opt-in, production guard,
   coverage containment, exclusive endpoint choice, local cache bypass, and
   source reporting, with offline mocked tests first.
4. **Consumer integration:** wire the browser and all live-data test tools to
   the routing contract; keep the public cache warmer explicitly public.
5. **End-to-end validation:** run the seven-area sweep locally, verify no public
   traffic, then prove an uncovered custom bbox still uses public Overpass.
6. **Documentation:** record setup, lifecycle, refresh/recovery, artifact
   locations, measured resource use, and troubleshooting. Add the mandatory
   `CHANGELOG.md` entry when implementation changes app/test behavior.

No implementation phase starts merely because this document is revised.

## Planned repository/artifact split

The reusable setup is tracked as a backup and as reviewable documentation:

- container/compose definition and pinned version;
- build/lifecycle wrapper scripts;
- coverage definitions and their consistency check;
- routing tests and developer documentation.

Ignored local artifacts:

- downloaded Geofabrik source PBFs and checksums copied from the downloads;
- extracted area-fragment and combined PBFs;
- Overpass database volumes, logs, and generated build manifests containing
  machine-specific paths;
- temporary candidate databases.

Tracking the reusable tooling makes the setup reviewable and recoverable while
keeping all large data out of Git. The supported target remains Coen's M1 Mac
development setup; making this a portable service for other developers,
operating systems, or production hosts is out of scope. The tracked files may
still be useful elsewhere, but portability is best effort rather than an
acceptance requirement.

## Decided

- Ordinary local mode visibly falls back to public Overpass when the local
  service is unavailable. A strict no-fallback mode exists for validation.
- Track the small reusable compose/scripts/coverage/tests/docs files in the
  repository as a backup. Keep downloaded PBFs, the combined PBF, databases,
  volumes, generated manifests, logs, and machine paths out of Git.
- OSM snapshot refresh is explicit and manual. Starting or rebuilding the
  service never downloads newer data. Adding a new area separately downloads
  or reuses source data for that footprint and does not refresh unrelated
  existing areas.
