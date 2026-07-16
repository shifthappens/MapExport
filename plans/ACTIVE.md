# Active maintenance checkpoint

- **Updated:** 2026-07-14
- **Roadmap:** `plans/2026-07-14_v2-cartografische-feedback.md` (actief);
  maintenance-roadmap `plans/2026-07-14_codebase-maintenance-priorities.md`
  Sprint 1 = `COMPLETE`, staat geparkeerd op Sprint 2 (ME-04).
- **Sprint:** v2 cartografische feedback (Coens sign-off-ronde) — `ACTIVE`.
- **Unit:** CF-01 (Sand-naamgeving) + CF-02 (groen ontrommelen) `DONE` en
  geverifieerd; CF-03 (countryside/parks samenvoegen) = `BACKLOG`, ontwerpbesluit
  vereist, niet implementeren. Resteert: Coens visuele akkoord op CF-01/02 en
  besluit over commit + eventueel volledige zeven-area sweep (`WAITING_FOR_USER`).
- **Owner/route:** O implementeerde CF-01/CF-02 direct (CF-02 is E2:
  coverage-machinerie). Geen agentdelegatie.
- **Completed checkpoint:** CF-01 + CF-02 in `engine-v2.js` geïmplementeerd en
  geverifieerd. CF-01: laag "Beaches" → "Sand", per-element label uit OSM
  (beach/dune/sandbox/sand), `dune` toegevoegd aan fetch + classify. CF-02:
  `GRASS_MIN_PAINT_M2 = 80` filter in `classifyAreaFeatures` (bij de bron, zodat
  render-array én worker-void dezelfde set zien). Tilburg v2: 5 "Sand"-vlakken,
  ~1700 confetti → 0, 0.000% bare, park intact (visueel). Erfurt v2: 0.000% bare,
  blok-classificatie identiek (141/0/0) → Gera green-dominant.
- **Next action:** Coens visuele akkoord op de twee bijgewerkte v2-exports
  (`exports/map-useit-tilburg-v2-2026-07-14.svg`, `...-erfurt-...`). Bij akkoord:
  besluit (a) committen van deze CF-diff + newest-per-city exports, en (b) of de
  overige vijf steden ook opnieuw gesweept + gecommit worden. Niets is nog
  gecommit (geen commit-verzoek gegeven).
- **Changed for current unit:** `engine-v2.js` (CF-01 + CF-02), `CHANGELOG.md`,
  plan `2026-07-14_v2-cartografische-feedback.md`, dit checkpoint. Twee
  v2-export-SVG's (Tilburg, Erfurt) in-place herschreven door de verificatie.
- **Latest checks:** `node --check engine-v2.js` groen; offline v2-set
  (`v2-cutterless-coverage`, `sea-sign`, `hamlet-grounding`) groen; Tilburg +
  Erfurt v2 real-export render-coverage 0.000% bare / 0 significante gaps.
- **Decisions/blockers:** CF-02 filtert bij de bron (`classified.grass`), niet
  bij de render, anders komt een block-hole bloot. Drempel 80 m² afgesteld op
  Tilburg. CF-03 bewust geparkeerd (paint-order/void/green-dominance verweven).
  Geen commit zonder expliciet verzoek.
