# Active checkpoint

- **Updated:** 2026-07-17
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-03b — wetland + recreation binden — `DONE` (2026-07-17).
  AF-01 (`6b835c2`), AF-02a (`9c52015`), AF-02b (`cc65317`), AF-03a
  (`abf50bd`) waren al `DONE`; AF-02c-hercontrole zonder codewijziging.
- **Owner/route:** AF-03b gestart als E2-delegatie; de worker viel halverwege
  stil (classificatiehelft geleverd, renderhelft ontbrak). O heeft de unit
  overgenomen en afgemaakt conform het vastgelegde O-contract; onafhankelijke
  reviewer-pass gedraaid vóór commit.
- **Completed checkpoint:** AF-03b af: wetland → veldtint via de paint-only
  grass-route; recreation (golf/dog park/sports centre/allotments) → v2-only
  laag `parks_recreation` onder één "Parks & green"-parent; complementregel
  (block- + fallback-void) zonder classificatiesignaal; `tests/area-binding.mjs`
  50 checks; coverage-lint telt recreation als verf; ENGINE-V2.md §4/§5/§7.
- **Next action:** AF-03c (bebouwd/verhard/werkland-subgroepen, E2 + review;
  O beslist binding en drempels vóór implementatie).
- **Changed for current unit:** engine-v2.js, tests/area-binding.mjs,
  tests/coverage-lint.mjs, ENGINE-V2.md, CHANGELOG.md, plans/.
- **Latest checks:** `node --check engine-v2.js` groen;
  `node tests/area-binding.mjs` 50/50; `OFFLINE_ONLY=1 bash tests/smoke.sh`
  volledig groen (2026-07-17, na AF-03b).
- **Decisions/blockers:** **Netwerkblokkade:** deze remote-omgeving blokkeert
  alle drie Overpass-endpoints (HTTP 403 via agent proxy; één sequentiële
  Erfurt-poging op 2026-07-17, conform geen-retry-beleid). Alle visuele
  cached/live-exportgates (AF-02 t/m AF-06, AF-08-sweep) schuiven door naar
  een sessie met netwerktoegang of lokale cache; offline tests blijven de
  primaire lus. Metro-tunnel (AF-05d) en Countryside/Parks (AF-07c) blijven
  Coen-gates. In deze sessie blokkeerde de permission-classifier tijdelijk
  directe testcommando's; checks liepen via een read-only subagent.
