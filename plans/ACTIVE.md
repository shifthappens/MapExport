# Active checkpoint

- **Updated:** 2026-07-19
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-07a — editorstructuur — offline `DONE` (2026-07-19), visuele
  bevestiging → AF-08-sweep. Onafhankelijke reviewer-pass loopt nog op de
  commitdiff; verdict wordt hieronder bijgeschreven (defects → vervolgcommit).
- **Owner/route:** O direct (kleine structurele editorwijziging); reviewer
  (read-only) als onafhankelijke pass conform sprintprotocol.
- **Completed checkpoint:** AF-07a compleet: `tram_casing`/`tram_fill` dragen
  "Tram casings"/"Tram fills" (gedeelde builder, beide engines); v2's
  `renderCityBlocks` groepeert hamletblobs onder "Hamlets"
  (`city_blocks_hamlets`) en losse gebouwen onder "Standalone buildings"
  (`city_blocks_buildings`), urban blocks blijven directe kinderen, afwezige
  soort → geen lege subgroep; zelfde crème/ids/labels/strokes, geen
  paint-orderwijziging (disjuncte grond). Structurele groeps-ids letterlijk,
  beschermd via `RESERVED_SVG_IDS`-seed. `tests/editor-structure.mjs`
  (24 checks) in smoke.sh; ENGINE-V2.md §7 en roadmapmatrix/checkbox
  bijgewerkt.
- **Next action:** reviewer-verdict AF-07a verwerken (bij ACCEPT: alleen dit
  veld bijwerken); daarna AF-07b — inventariseer de bron van technische
  namen zoals `Place FO/13` tegen de gepinde cache (`cache/pinned/`,
  63/63 keys) en kies conservatief: algemene bewezen filter of
  editorwaarschuwing. AF-06/AF-08 vereisen crops/sweep (visueel);
  AF-05d/AF-07c blijven Coen-beslissingen.
- **Changed for current unit:** script.js (tram-groepslabels +
  RESERVED_SVG_IDS), engine-v2.js (renderCityBlocks-subgroepen),
  tests/editor-structure.mjs (nieuw), tests/smoke.sh, ENGINE-V2.md,
  CHANGELOG.md, plans/.
- **Latest checks:** `node --check` script.js/engine-v2.js groen;
  `tests/editor-structure.mjs` 24/24; `OFFLINE_ONLY=1 bash tests/smoke.sh`
  volledig groen (v2-cutterless-worker SKIPt zonder ClipperLib-cache/netwerk,
  zoals bekend in deze sandbox) (2026-07-19).
- **Decisions/blockers:** structurele groeps-ids worden letterlijk geëmit en
  via de `RESERVED_SVG_IDS`-seed beschermd — via `ctx.uid` alloceren zou de
  geseede base verbranden en `_2`-ids opleveren (tijdens implementatie
  gevonden en getest). Cache-corpus (63/63 keys) gepind in `cache/pinned/`
  (herstel: `cp cache/pinned/*.json.gz cache/`; TTL t/m 2026-07-25).
  Metro-tunnel (AF-05d) en Countryside/Parks (AF-07c) blijven Coen-gates.
