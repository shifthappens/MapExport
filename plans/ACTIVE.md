# Active checkpoint

- **Updated:** 2026-07-22
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** v2 face-runtime optimizations — PERF-03 + PERF-04 — `COMPLETE`
  (2026-07-22; implemented, independently reviewed, one confirmed reliability
  finding fixed and re-verified — see plan's Result section).
- **Owner/route:** O direct; geometry/classification invariants require the
  engine-v2 contract to remain exact.
- **Completed checkpoint:** PERF-03 (spatial index over the occlusion-cull
  covering union) and PERF-04 (spatial index + verdict reuse for
  mergeGreenRemainder/isUrbanPiece/isGreenOpenPiece) are implemented per
  `plans/2026-07-21_v2-face-runtime-next-optimizations.md`. Warm Tilburg
  worker time: 38.8 s (PERF-01/02 baseline) → ~3.1 s median (96.8% reduction
  from the original 97.6 s pre-PERF-01 baseline). Reference-vs-optimized
  parity confirmed by SHA-256/diff on real exports for all seven validation
  cities (Tilburg, Ghent, Paris, Bremerhaven, Oulu, Nièvre, Erfurt) — every
  trail SVG differs from the pre-session committed version by exactly the
  export-date metadata line. PERF-04's measured saving (~350 ms) was smaller
  than the plan's ~1–2 s estimate; reported honestly per the plan's own
  instruction rather than chased with unplanned `subtractVoid` indexing (see
  the plan's "Result" section for the full accounting). Full details, phase
  timings and command evidence: see the "Result (2026-07-22)" section
  appended to the plan.
- **Next action:** Resume the roadmap task selected by Coen.
- **Changed for current unit:** `engine-v2.js`, `tests/v2-face-runtime-benchmark.mjs`,
  `CHANGELOG.md`, the implementation plan and `plans/ACTIVE.md`, plus the
  newest validation SVG per city (all seven, date-stamp-only diff).
- **Latest checks:** `node --check engine-v2.js`; `node
  tests/v2-face-runtime-benchmark.mjs` (extended fixture: occlusion cull +
  mergeGreenRemainder spatial-index scenarios, exact reference parity);
  `OFFLINE_ONLY=1 bash tests/smoke.sh` (full suite, exit 0); `node
  tests/real-export.mjs <city> --engine=v2` for all seven cities (all pass
  export/lint/coverage gates, 0.000% bare pixels); `FACE_RUNTIME_OPTIMIZATIONS=0`
  vs default byte-for-byte SVG comparison for all seven cities.
- **Decisions/blockers:** none open. The unrelated cache rate-limit marker
  remains modified (pre-existing, untouched by this unit).
