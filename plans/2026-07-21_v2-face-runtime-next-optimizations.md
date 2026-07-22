# Plan: v2 face-runtime optimizations — localized occlusion and remainder work

**Status: IMPLEMENTED (2026-07-22).** Two ordered, output-preserving
performance changes for `engine-v2.js`. Both landed exactly as designed:
PERF-03's spatial index for the occlusion cull and PERF-04's spatial index +
verdict reuse for green-remainder merging. Warm Tilburg worker time: 38.8 s
(PERF-01/02 baseline) → 3.1 s median (92% further reduction). Exact
optimized/reference byte parity confirmed on all seven validation cities plus
the real Tilburg/Nièvre exports, not just the synthetic benchmark fixture.
PERF-04's own contribution was smaller than the ~1-2 s estimate below (see
"Return to orchestrator" section for why) — reported honestly per this plan's
own instruction rather than chased further.

## Objective and evidence

Warm-cache Tilburg after PERF-01/PERF-02 (2026-07-21 median): **38.8 s** worker,
down from 97.6 s, with a byte-identical SVG. A representative 38.736 s run
reported:

- face construction: 0.394 s;
- countryside preclassification and hamlet morphology: 0 s (correctly skipped);
- classification/intersections: 2.691 s;
- unlabelled remainder: about 35.65 s.

The CPU profile places nearly all of that remainder in direct
`Clipper.Execute` work in the landcover occlusion cull: 733 landcover elements
are individually differenced against the complete city-wide covering geometry.
After that, the next useful target is classification/remainder geometry,
especially `mergeGreenRemainder`; repeated signal measurements themselves are
now cheap because PERF-02 spatially filtered them.

Implement in order:

1. Localize exact landcover occlusion differences with a spatial index.
2. Localize green-remainder work and reuse classification measurements.

Do not change output, thresholds, tolerances, paint order, coverage rules or
Clipper version. Timing targets below are evidence goals, not test thresholds.

## Scope

Allowed: `engine-v2.js`, the existing face-runtime benchmark/harness,
`tests/README.md` if its usage changes, and `CHANGELOG.md`.

Do not change: `script.js`/v1 behaviour, Overpass queries or cache keys,
`SCALE`/`CULL_SCALE`, classification constants, geometry rounding, SVG path
format, deployment files, or validation allowances. Do not add a dependency,
approximate/raster test, worker pool, or Clipper replacement in this unit.

## PERF-03 — spatially localize the landcover occlusion cull

### Required design

- First split benchmark timing into at least `occlusionCoverBuild` and
  `occlusionElementDifferences`; keep `totalWorker`. Confirm the latter owns the
  observed cost before changing the algorithm.
- Preserve construction of the authoritative `covering` union exactly,
  including oriented holes and the existing opaque-layer set.
- Build a worker-local fixed-grid index over the resulting `covering` paths at
  `CULL_SCALE`. Store each path unchanged with its bounding box and original
  ordinal.
- While scaling each landcover element, compute its combined subject bounds
  once. Query only covering paths whose bounds can overlap it, deduplicate them,
  and restore original ordinal order before adding them to Clipper. Use
  inclusive overlap with a conservative one-integer-unit pad.
- If no covering candidate overlaps, keep the landcover element without
  constructing a difference Clipper. Otherwise run the existing exact
  difference and unchanged `< 1px²` remainder test.
- Preserve the `mergedLandcover` exemption. Do not replace the exact difference
  with bbox containment, point sampling or an area estimate.
- Extend the benchmark-only retained-reference route so the original global
  cull and optimized cull can run on identical worker input and compare exact
  `culledLandcover` indices and serialized worker output.

### PERF-03 acceptance

- Tilburg optimized/reference worker results and finished SVG are byte-identical
  apart from unavoidable filename/timestamp text. The cull remains 733 -> 420
  elements unless the accepted baseline says otherwise.
- All seven validation cities have identical cull indices, block output and
  green-ground merges; coverage and rendered-coverage results do not regress.
- Report median of three warm Tilburg runs plus the new cull phase split.
  Expected range: save roughly 25–32 s, bringing total worker time to about
  7–14 s. A smaller result is not a correctness failure; profile it and report
  whether giant covering paths or cover-union construction dominate.

## PERF-04 — localize green remainders and reuse piece measurements

Reprofile after PERF-03 before editing. If classification/remainder time is no
longer material, report that honestly and stop rather than adding complexity.

### Required design

- Split `classificationIntersections` into enough benchmark-only subphases to
  distinguish signal measurement, `subtractVoid`/piece splitting,
  `mergeGreenRemainder`, and standalone-building clipping.
- Pre-scale each `landcoverElements` ring once for worker geometry use and store
  per-element bounds. Build a fixed-grid element index using the same
  conservative overlap rules as PERF-02/PERF-03.
- In `mergeGreenRemainder`, query only landcover elements that can overlap the
  piece. Preserve original element order, calculate the winner with the same
  exact intersection areas and strict `area > bestArea` tie behaviour, and keep
  the current union/mutation semantics for an element grown by multiple pieces.
- Within one face/piece classification, compute bounds, net land area and each
  requested signal intersection at most once. Return/reuse a structured verdict
  so a failed `isUrbanPiece` followed by `isGreenOpenPiece` does not repeat
  water or landcover measurements. Keep lazy evaluation and the current branch
  order so unnecessary open-land/urban tests stay skipped.
- Reuse an already-created exact subtraction tree only where subject, clip
  paths, fill rule and scale are identical. Do not share merely similar
  `blockVoid` and `fallbackVoid` results.

### PERF-04 acceptance

- Exact optimized/reference parity for serialized worker results and SVGs in
  Tilburg, Nièvre and every city that exercises green-ground merges.
- Largest-overlap landcover ownership, merge order, emitted paths and standalone
  buildings are unchanged, including ties and repeated merges into one element.
- Report median-of-three Tilburg phase timings. Expected saving is about 1–2 s;
  do not claim the old 18 s intersection opportunity because PERF-02 already
  removed it.

## Checks and measurement

After each task run:

```text
node --check engine-v2.js
node tests/v2-face-runtime-benchmark.mjs
OFFLINE_ONLY=1 bash tests/smoke.sh
node tests/real-export.mjs tilburg --engine=v2
```

After PERF-03, run the seven cached validation cities sequentially. After
PERF-04, at minimum rerun Tilburg, Nièvre and every validation export with a
non-empty `greenGroundMerges` result; run the full sweep if output comparison is
not performed directly at worker level. Follow the Tilburg-first visual gate.
Do not deploy, push, record expectations or loosen tests. Add a concise entry at
the top of `CHANGELOG.md` because export runtime is user-visible behaviour.

## Return to orchestrator

Return a concise diff summary, median timings and phase breakdown before/after
each task, exact parity evidence, commands/results, and any changed city. If any
worker field, cull index or SVG geometry differs, stop at the first difference
and explain it; do not normalize output or update expectations to accept it.

## Result (2026-07-22)

### PERF-03
- Design implemented exactly as specified: `indexVoid`/`indexedCandidates`
  (the same PERF-01/02 helpers) reused over the `covering` union; each
  landcover element differences only against covering paths whose bounds can
  touch its own bounds (1-unit pad); a bounds-only miss skips constructing a
  Clipper difference entirely; the reference route
  (`runtimeOptimizations:false`) still hands every covering path to every
  element for exact parity.
- Median of 3 warm Tilburg runs: `occlusionCoverBuild` 140 ms +
  `occlusionElementDifferences` 73 ms = 213 ms, down from ~35.65 s unlabelled
  remainder before. Cull remains 733 → 420 elements. `totalWorker` fell to
  ~3.48 s median — beyond the plan's 7–14 s expectation.

### PERF-04
- Design implemented exactly as specified: `isUrbanPiece` now returns a
  `{urban, landArea, landcoverShare}` verdict so `isGreenOpenPiece` reuses the
  water/landcover measurements instead of repeating them; a fixed-grid index
  (same conservative overlap rule) over pre-scaled `landcoverElements`
  geometry, rebuilt only when a merge grows an element (so a later piece's
  query is always exact, never stale); `classificationIntersections` split
  into `classificationSignal`/`classificationSubtract`/
  `classificationGreenMerge`/`classificationBuildings` benchmark subphases.
- Median of 3 warm Tilburg runs after PERF-03+PERF-04:
  `classificationSignal` ~63 ms, `classificationSubtract` ~1076 ms,
  `classificationGreenMerge` ~1036 ms, `classificationBuildings` ~79 ms,
  `classificationIntersections` ~2350 ms (was ~2697 ms after PERF-03 alone —
  about 350 ms saved, smaller than the "about 1–2 s" estimate).
  `totalWorker` ~3.14 s median.
- Honest accounting for the shortfall against the estimate: `mergeGreenRemainder`
  was only called ~16 times on Tilburg (matching "16 element(s) grown"), so
  even eliminating its full 733-element rescan bounded the achievable saving.
  The now-dominant residual costs (`classificationSubtract` ~1.08 s,
  the `subtractVoid(pieceSubject, fallbackVoid)` call inside
  `classificationGreenMerge`) are plain `subtractVoid` calls against the full
  city-wide `blockVoid`/`fallbackVoid` — genuinely necessary Clipper work with
  no redundant computation to eliminate, and out of this plan's designed
  scope (indexing `subtractVoid` itself was never part of PERF-03/04's
  design). Reported per the plan's own instruction rather than chased with
  unplanned complexity.

### Combined result
- Warm Tilburg `totalWorker`: 97.6 s (pre-PERF-01) → 38.8 s (PERF-01/02) →
  ~3.1 s median (PERF-03+PERF-04), a 96.8% reduction end to end.
- Exact optimized/reference parity confirmed two ways: (1) the extended
  `tests/v2-face-runtime-benchmark.mjs` synthetic fixture (occlusion cull with
  culled/exposed/isolated elements; a green-open piece that exercises the
  mergeGreenRemainder spatial index end to end); (2) real exports —
  `FACE_RUNTIME_OPTIMIZATIONS=0` vs default — compared byte-for-byte
  (SHA-256/`diff`) for all seven validation cities (Tilburg, Ghent, Paris,
  Bremerhaven, Oulu, Nièvre, Erfurt). Every city's committed trail SVG differs
  from the pre-session (PERF-01/02) committed version by exactly the
  export-date metadata line — geometry, classification and paint order are
  byte-identical.
- Checks run: `node --check engine-v2.js`; `node tests/v2-face-runtime-benchmark.mjs`;
  `OFFLINE_ONLY=1 bash tests/smoke.sh` (full suite, exit 0); `node
  tests/real-export.mjs <city> --engine=v2` for all seven cities (export/lint/
  coverage gates all pass, 0.000% bare pixels, 0 allowances); reference-vs-
  optimized SVG diff for all seven cities.
- Independent Opus review (reviewer subagent, read-only, high effort): found
  one CONFIRMED reliability defect and no others. PERF-03's zero-candidate
  fast path (an element whose bounds overlap no covering path) unconditionally
  kept the element instead of testing its own area against the ~1px² `EMPTY`
  cull floor — the reference route still culls a sub-1px² uncovered element
  regardless of coverage, so the two routes could diverge on data the seven
  validation cities and the original synthetic fixture didn't happen to
  contain (no sub-1px² uncovered landcover element in that corpus). Fixed by
  computing the element's own scaled area in the zero-candidate branch and
  culling it exactly when that area is below `EMPTY`, matching what a
  difference against an empty clip list would have produced. Added two
  targeted regression checks to `tests/v2-face-runtime-benchmark.mjs`
  (element 5: 0.25px², zero candidates, must still be culled; element 1:
  1600px², zero candidates, must be kept) — both pass, and reference/optimized
  parity holds with the fix. Re-ran `node --check`, the full offline smoke
  suite (exit 0) and a Tilburg re-export to confirm the fix does not change
  output for the seven validated cities (none exercised the edge case).
  Everything else the reviewer traced (mergeGreenRemainder's index
  invalidation, both `runtimeOptimizations:false` fallbacks, the
  `isUrbanPiece` verdict refactor, benchmark instrumentation, ENGINE-V2.md
  invariants) was confirmed correct with no defect. Per Coen's instruction,
  only this blocking/reliability finding was acted on — no stylistic or
  scope-expansion suggestions were incorporated.
