# Active checkpoint

- **Updated:** 2026-07-21
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** Persistent Overpass retry — v1/v2 export fetch — `DONE`
  (2026-07-21).
- **Owner/route:** O direct; shared Overpass orchestration affects both export
  engines and their cache misses.
- **Completed checkpoint:** Re-read ME-05 before changing it: its short limits
  protected against an unbounded frozen UI, while hard per-attempt timeouts,
  endpoint backoff, typed diagnostics and lifecycle aborts were the essential
  safeguards. Both fetch drivers now preserve those safeguards while retrying
  temporary 429/timeout/network/5xx/parse failures for up to one hour. A
  visible Cancel export control aborts immediately; permanent client errors
  still fail promptly. Mocked checks prove sequential recovery after a fourth
  try and raced recovery after a third round.
- **Next action:** AF-08 remains the next audit sweep once Coen decides the
  open AF-05d (metro tunnel) and AF-07c (Countryside/Parks & green) choices.
- **Changed for current unit:** `script.js`, `index.html`, `style.css`,
  `tests/overpass-fetch.mjs`, `tests/export-failures.mjs`, `tests/README.md`,
  `README.md`, `CHANGELOG.md`, `plans/ACTIVE.md`.
- **Latest checks:** `node --check script.js`, `node tests/overpass-fetch.mjs`,
  `node tests/export-failures.mjs`, `node tests/layer-selection.mjs`, and
  `git diff --check` pass.
- **Decisions/blockers:** The one-hour retry window is deliberately bounded
  and applies only to retryable temporary failures. It replaces the ME-05
  count cutoff without resurrecting an unbounded wait; Cancel export remains
  available throughout.
