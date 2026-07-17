# Active checkpoint

- **Updated:** 2026-07-17
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-03c — bebouwd/verhard/werkland — `DONE` (2026-07-17). Daarmee
  is AF-03 offline compleet (a+b+c); de cached-exportgate van AF-03 schuift
  net als bij AF-02 door naar AF-08/netwerksessie. AF-01 (`6b835c2`), AF-02a
  (`9c52015`), AF-02b (`cc65317`), AF-03a (`abf50bd`), AF-03b (`2cbcdca`)
  waren al `DONE`.
- **Owner/route:** AF-03c door O geïmplementeerd (E2-route; O-contract vooraf
  vastgelegd: signaal-tags, drempels ongewijzigd, drie fallback-families);
  onafhankelijke reviewer-pass vóór commit: ACCEPT-WITH-NITS, beide nits
  (verouderde comments) direct verwerkt.
- **Completed checkpoint:** AF-03c af: urban-signaal → benoemd
  `isUrbanSignalElement`-predicaat, uitgebreid met
  `landuse=institutional|education|religious` (drempels/veto's ongewijzigd;
  industrial + werkland-familie uitgesloten, testgeborgd); fallback-editor-
  families "Working land"/"Railway grounds"/"Paved areas" (pure
  paneelorganisatie, verf/labels ongewijzigd); `tests/area-binding.mjs`
  50→85 checks; ENGINE-V2.md §3/§5/§7.
- **Next action:** AF-04 (zichtbare landelijke place-labels; O definieert
  hiërarchie, E1 implementeert labelbuilder + fixtures).
- **Changed for current unit:** engine-v2.js, tests/area-binding.mjs,
  ENGINE-V2.md, CHANGELOG.md, plans/.
- **Latest checks:** `node --check engine-v2.js` groen;
  `node tests/area-binding.mjs` 85/85; `OFFLINE_ONLY=1 bash tests/smoke.sh`
  volledig groen (2026-07-17, na AF-03c incl. review-nits).
- **Decisions/blockers:** **Netwerkblokkade:** deze remote-omgeving blokkeert
  alle drie Overpass-endpoints (HTTP 403 via agent proxy). Alle visuele
  cached/live-exportgates (AF-02 t/m AF-06, AF-08-sweep) schuiven door naar
  een sessie met netwerktoegang of lokale cache; offline tests blijven de
  primaire lus. Reviewer-restrisico AF-03c (groene campussen bij
  education/religious) is begrensd door het ongewijzigde open-land-veto en de
  green-dominance-demotie, maar alleen kwantificeerbaar in de
  real-export-sweep — expliciet meenemen in AF-08. Metro-tunnel (AF-05d) en
  Countryside/Parks (AF-07c) blijven Coen-gates.
