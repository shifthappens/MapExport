# Plan: v2 face-runtime optimizations — deferred hamlets and spatial clipping

**Status: IMPLEMENTED (2026-07-22, accepted revision).** Two ordered,
output-preserving performance changes for `engine-v2.js`. PERF-01 retains the
global rural morphology input: testing showed that omitting even disconnected
rings moves a Nièvre hamlet outline by 0.1px. The urban-only fast path remains
the intended performance improvement, while rural geometry remains exact.

## Objective and evidence

Warm-cache Tilburg v2 baseline (2026-07-21): 102.4 s total, of which 95.9 s is
the face worker. The profile attributes 37.8 s to Clipper building
dilate/erode and about 18.3 s to urban/green intersection tests. Tilburg sent
20,916 buildings but produced 267 urban faces, 17 fallback patches, **0
countryside faces and 0 hamlets**. Post-export validation is only about 4 s and
is not the target.

Implement in order:

1. Defer hamlet morphology until countryside faces are known; run it only when
   needed, while retaining its global building input whenever it runs so rural
   geometry stays exact.
2. Spatially filter global signal paths before each `intersectArea` call.

Output, classification thresholds, geometry tolerances and layer structure
must remain unchanged. Before editing, read `AGENTS.md` and all of
`ENGINE-V2.md`, especially the coverage promise and complement rule.

## Scope

Allowed: `engine-v2.js`, a focused test/benchmark script under `tests/` or
`tools/`, `tests/README.md` if a script is added, and `CHANGELOG.md`.

Do not change: v1 behaviour in `script.js`, Overpass queries/cache keys,
classification thresholds, `SCALE`, Clipper version, paint order, SVG shape
format, or deployment files. Reuse existing worker data; do not add a library.

## PERF-01 — defer and limit hamlet morphology

### Required design

- Move construction of `clusterPolys` (currently the global 18 m dilate / 10 m
  erode) until after `rawFaces`, `waterVoid` and `openLandVoid` exist.
- Extract the current countryside predicate into one helper and evaluate it
  exactly once per raw face. Store the result on worker-local face records for
  reuse in the main classification loop. Preserve the current formula exactly:
  area floor, water-excluded land denominator, open-land share and thresholds.
- If no face is countryside, leave `clusterPolys = null` and perform no
  `ClipperOffset` work. This is the important Tilburg fast path.
- If countryside faces exist, retain all `clusterRings` for the existing global
  morphology operation. A tested bounding-box filter changed emitted hamlet
  geometry by 0.1px even for rings outside the local influence area, so exact
  output takes priority over a rural-only speed optimization.
- Run the existing global dilate/erode algorithm once over that retained set,
  using the same round joins, arc tolerance, scale and distances. Keep the later
  exact face intersection and place-node grounding unchanged.
- Do not filter `buildingCenters`: ordinary urban classification still needs
  all of them.

### PERF-01 acceptance

- Tilburg output is byte-identical apart from unavoidable filename/timestamp
  text, with 267 urban, 17 fallback, 0 countryside and 0 hamlet; the hamlet
  offset phase is skipped.
- Nièvre (rural/hamlet reference) has identical block kinds/counts, grounded
  hamlet names and emitted path geometry before versus after the change.
- No classification or coverage allowance changes.
- Warm-cache Tilburg face time improves by at least 30% against the 95.9 s
  baseline; report median of three runs and phase timings.

## PERF-02 — spatially filter signal intersections

### Required design

- Keep `buildVoid` output as the geometry authority. Build a worker-local
  spatial index over the resulting paths for `waterVoid`, `landcoverVoid`,
  `openLandVoid` and `urbanVoid`.
- Store each path's scaled-coordinate bounding box and original ordinal. A
  simple fixed grid is sufficient; no dependency or general-purpose R-tree.
- For an intersection, compute one bounding box covering every subject ring,
  query only index cells it overlaps, deduplicate candidates, then restore
  original ordinal order before adding paths to Clipper. Use inclusive overlap
  with a one-integer-unit conservative pad so touching/rounding cases are never
  excluded.
- If the index returns no candidates, return area zero without constructing a
  Clipper instance.
- Preserve oriented outer/hole rings individually. Filtering must never alter
  winding, coordinates, fill rule or path order. An enclosing outer and any
  relevant hole naturally overlap the subject bounds and must both be returned.
- Update `intersectArea` to accept an indexed global void while retaining a raw
  path route for one-off calls such as the per-element overlap work in
  `mergeGreenRemainder`.
- Compute each subject's bounds once where practical. Do not combine this task
  with threshold changes, approximate/raster classification, worker pools or
  cached-result refactors; those are separate follow-ups.

### PERF-02 acceptance

- For all validation cities, block kinds/counts, countryside/hamlet names,
  fallback counts, culled-landcover indices and green-ground merges match the
  pre-change baseline. Prefer exact serialized worker-result comparison.
- Finished SVGs remain byte-identical apart from filename/timestamp text.
- The geometric coverage check reports zero new significant gaps and rendered
  coverage remains 0.000% bare with zero new blobs.
- Profile evidence shows materially less time below `intersectArea` /
  `isUrbanPiece`; report median-of-three warm Tilburg timings. Do not claim a
  win from one run.

## Tests and measurement

Before implementation, add or extend a benchmark-only harness that records at
least: face construction, countryside preclassification, hamlet morphology,
classification intersections, and total worker time. It must not change normal
production messages or make timing thresholds part of the smoke suite.

Run after each task:

```text
node --check engine-v2.js
OFFLINE_ONLY=1 bash tests/smoke.sh
node tests/real-export.mjs tilburg --engine=v2
```

After PERF-01 also run Nièvre. After PERF-02 run the seven validation cities
sequentially from warm cache. Follow the repository's existing Tilburg-first
visual gate; do not deploy, push, record new expectations or approve changed
allowances. Add a concise top-of-Unreleased changelog entry because export
runtime is user-visible behaviour.

## Return to orchestrator

Return a short diff summary, before/after median timings and phase breakdown,
exact-output comparison results, test commands/results, and any city whose
worker output changed. If output changes, stop and explain the first differing
face/path; do not normalize it away or update expectations.
