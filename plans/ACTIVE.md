# Active checkpoint

- **Updated:** 2026-07-17
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-02b — Squares/Plazas-groep — `IN_PROGRESS` (E1 gedelegeerd).
  AF-01 en AF-02a zijn `DONE` en geaccepteerd; ME-06c gesynchroniseerd.
  O-ontwerp AF-02b: v2 rendert de synthetische pleinnodes als eigen
  `square_labels`-groep ("Squares & plazas") via een tweede
  buildFeatureLabelsLayer-aanroep + groepstag-rewrite (relabel-patroon), zelfde
  ctx.labelGrid/ctx.uid; street-labels-tak filtert isSquareElement; ENGINE-V2.md
  §2/§7 in dezelfde commit geamendeerd. Geen script.js-wijziging (§9).
- **Owner/route:** O orchestreert; `scoped-implementer` (E1) implementeert per
  letter-subunit; `reviewer` doet read-only controle bij acceptatierisico.
- **Completed checkpoint:** AF-01 af (commit `6b835c2`, reviewer ACCEPT) en
  AF-02a af (commit `9c52015`): feature-labels dedupen op genormaliseerde
  naam binnen 1000×sf px, grootste kandidaat eerst, onderdrukte labels
  claimen geen gridruimte; tests `svg-id-uniqueness.mjs` en
  `feature-label-dedup.mjs` in smoke.sh.
- **Next action:** AF-02b-oplevering reviewen (O): diff engine-v2.js +
  ENGINE-V2.md-amendement + tests/square-labels.mjs inspecteren, checks
  herdraaien, committen; daarna AF-02c (rand/collision-restgevallen) met als
  gate één cached Ghent- of Erfurt-export.
- **Changed for current unit:** (verwacht) engine-v2.js, ENGINE-V2.md,
  tests/square-labels.mjs, tests/smoke.sh, tests/README.md, CHANGELOG.md.
- **Latest checks:** na AF-02a: `OFFLINE_ONLY=1 bash tests/smoke.sh` volledig
  groen (incl. svg-id-uniqueness en feature-label-dedup); `node --check
  script.js` groen. Geen live export gedraaid (gate hoort bij AF-02c).
- **Decisions/blockers:** offline-first en één exportproces tegelijk; bij 429/
  timeout/cachemiss geen retry-matrix maar checkpoint/hervatting. Metro-
  tunnelpresentatie (AF-05d) en Countryside/Parks-merge (AF-07c) blijven
  expliciete Coen-gates. Geen blockers.
