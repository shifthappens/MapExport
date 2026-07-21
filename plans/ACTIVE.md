# Active checkpoint

- **Updated:** 2026-07-22
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** v2 face-runtime optimizations — PERF-01 + PERF-02 — `COMPLETE`
  (2026-07-22; accepted output-preserving revision).
- **Owner/route:** O direct; geometry/classification invariants require the
  engine-v2 contract to remain exact.
- **Completed checkpoint:** PERF-01 + PERF-02 are implemented with an opt-in
  timing harness and retained reference route. Warm Tilburg reference: 97.606 s
  worker; optimized runs: 41.284/38.778/38.842 s (median 38.842 s, 60.2%
  faster). Tilburg reference/optimized SVG SHA-256 matches (267 urban / 17
  fallback / 0 countryside / 0 hamlet, 0.000% bare); morphology is skipped.
  Nièvre reference/optimized SVGs also match byte-for-byte with all 336 rural
  rings retained. Seven cached v2 city exports pass their export, lint and
  coverage gates. Independent Sol review found no safety, reliability or
  output-correctness defect.
- **Next action:** Resume the roadmap task selected by Coen.
- **Changed for current unit:** `engine-v2.js`, `tests/v2-face-runtime-benchmark.mjs`,
  `tests/real-export.mjs`, `tests/smoke.sh`, `tests/README.md`, `CHANGELOG.md`,
  the implementation plan and `plans/ACTIVE.md`, plus the newest validation
  SVG per city.
- **Latest checks:** `node --check engine-v2.js`, `node tests/v2-face-runtime-benchmark.mjs`,
  `OFFLINE_ONLY=1 bash tests/smoke.sh` (cache PHP temporary server could not
  start; standalone `node tests/cache-php.mjs` passes), `git diff --check`,
  warm-cache exports for Tilburg, Ghent, Paris, Bremerhaven, Oulu, Nièvre and
  Erfurt (all pass export/lint/coverage gates), exact optimized/reference SVG
  comparison for Tilburg and Nièvre, and final independent Sol-level review.
- **Decisions/blockers:** Tilburg visual gate approved. With filtered Nièvre
  input, `hamlet_23` moves by 0.1px despite equal counts/coverage. The user
  accepted the output-preserving revision: retain all 336 rings whenever rural
  morphology is needed, and skip it only for urban-only exports. The unrelated
  cache rate-limit marker remains modified.
