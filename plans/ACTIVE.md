# Active checkpoint

- **Updated:** 2026-07-17
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-03b — wetland + recreation binden — `IN_PROGRESS` (E2
  gedelegeerd). AF-01 (`6b835c2`), AF-02a (`9c52015`), AF-02b (`cc65317`),
  AF-03a (`abf50bd`) zijn `DONE`; AF-02c-hercontrole zonder codewijziging.
- **Owner/route:** O orchestreert; AF-03b loopt als E2 (algemene agent,
  Opus) met daarna onafhankelijke `reviewer`-pass; O-contract: wetland →
  paint-only grass-route (veldtint); nieuwe categorie 'recreation'
  (golf_course|dog_park|sports_centre|allotments) → parkgroen als eigen
  subgroep in de Parks & green-band, subtract per complementregel uit
  dezelfde voids als groen, maar búiten het ≥35%-open-land-signaal; alleen
  bestaande presetkleuren; escalatie terug naar O als void/signaal niet te
  scheiden is.
- **Completed checkpoint:** AF-03a af: scrub/heath schildert veldtint via de
  paint-only grass-route; `tests/area-binding.mjs` nieuw in smoke.sh.
- **Next action:** AF-03b-oplevering reviewen (O + onafhankelijke reviewer),
  checks herdraaien, committen; daarna AF-03c (bebouwd/verhard/werkland-
  subgroepen, eveneens E2 + review).
- **Changed for current unit:** (verwacht) engine-v2.js, ENGINE-V2.md,
  tests/area-binding.mjs, CHANGELOG.md.
- **Latest checks:** na AF-03a: `OFFLINE_ONLY=1 bash tests/smoke.sh` volledig
  groen; `node --check engine-v2.js` groen.
- **Decisions/blockers:** **Netwerkblokkade:** deze remote-omgeving blokkeert
  alle drie Overpass-endpoints (HTTP 403 via agent proxy; één sequentiële
  Erfurt-poging op 2026-07-17, conform geen-retry-beleid). Alle visuele
  cached/live-exportgates (AF-02 t/m AF-06, AF-08-sweep) schuiven door naar
  een sessie met netwerktoegang of lokale cache; offline tests blijven de
  primaire lus. Metro-tunnel (AF-05d) en Countryside/Parks (AF-07c) blijven
  Coen-gates.
