# Active checkpoint

- **Updated:** 2026-07-19
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-07a — editorstructuur — `IN_PROGRESS`. AF-01 t/m AF-05b/c zijn
  `DONE` (zie roadmapmatrix); AF-05d blijft `NEEDS_COEN`.
- **Owner/route:** O direct (kleine structurele editorwijziging; delegatie zou
  meer kosten dan het werk).
- **Completed checkpoint:** tram-deel van AF-07a: `tram_casing`/`tram_fill`
  dragen nu `inkscape:label` "Tram casings"/"Tram fills" (consistent met
  "Road casings"/"Road fills"); beide engines, geen visuele wijziging.
- **Next action:** tweede deel AF-07a — in `renderCityBlocks` (engine-v2.js)
  hamletblobs en losse gebouwen in eigen subgroepen "Hamlets"
  (`city_blocks_hamlets`) en "Standalone buildings" (`city_blocks_buildings`)
  zetten, urban blocks blijven direct in de laag; die twee ids in
  `RESERVED_SVG_IDS` seeden; offline fixturetest (tram-labels +
  city-blocks-structuur) toevoegen aan smoke.sh; ENGINE-V2.md §7 amenderen.
  **Wacht op Coens go** — Coen onderbrak de sessie met de vraag wat er werd
  opgepakt; het voorstel (AF-07a nu, AF-07b als alternatief) ligt in de chat.
- **Changed for current unit:** script.js (alleen de twee
  tram-groepslabels), CHANGELOG.md, plans/ACTIVE.md.
- **Latest checks:** `node --check script.js` groen; `svg-id-uniqueness`,
  `pipeline-equivalence` en `rail-service` groen na de tram-labeledit
  (2026-07-19).
- **Decisions/blockers:** deze omgeving heeft geen live Overpass/visuele
  check nodig voor AF-07a/b; AF-06 en AF-08 (crops/sweep) en AF-05d/AF-07c
  (Coen-beslissingen) blijven hier buiten bereik. Cache-corpus (63/63 keys)
  staat gepind in `cache/pinned/` (herstel: `cp cache/pinned/*.json.gz
  cache/`, zie `cache/pinned/README.md`; TTL-klok gereset t/m 2026-07-25).
  Metro-tunnel (AF-05d) en Countryside/Parks (AF-07c) blijven Coen-gates.
