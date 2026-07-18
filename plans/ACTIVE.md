# Active checkpoint

- **Updated:** 2026-07-18
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-05a — railontwerp vastleggen — `DONE` (2026-07-18, read-only
  spike, besluit in roadmap). AF-01 t/m AF-04 waren al offline `DONE`
  (visuele gates → AF-08).
- **Owner/route:** AF-05a door O zelf (read-only meting + besluit; geen
  delegatie nodig). Meting draaide op de lokale gecachte Overpass-raillagen
  van Oulu en Paris; geen live Overpass-verkeer gebruikt.
- **Completed checkpoint:** AF-05a-besluit: één algemene tweeklassenregel —
  ways met `service=*` (yard/siding/spur/crossover) verliezen casing+sleepers
  en renderen als één dunne gedempte track-stroke in een eigen subgroep
  `rail_service` (vóór/onder de main-casings); ways zonder `service` behouden
  de volledige signatuur. Onderbouwing en afgewezen alternatieven staan in de
  roadmap onder AF-05a. Cutter/coverage wijzigt niet.
- **Next action:** AF-05b (railregel implementeren, E2 + fixtures voor normaal
  dubbelspoor, yard en roundhouse; O stelt exacte service-stijlwaarden vast op
  de fixtures; casing-vóór-fills blijft intact). Daarna AF-05c.
- **Changed for current unit:** alleen plans/ (roadmap AF-05a + matrix,
  ACTIVE.md). Geen code, dus geen CHANGELOG-entry en geen testrun nodig.
- **Latest checks:** geen (docs-only unit); laatste volledige groene run was
  na AF-04 (2026-07-17): place-labels 27/27, svg-id-uniqueness, square-labels,
  pipeline-equivalence, `OFFLINE_ONLY=1 bash tests/smoke.sh` alle groen.
- **Decisions/blockers:** Deze sessie heeft netwerk- en Overpass-toegang plus
  de lokale lamp-stack met warme cache (Oulu/Paris/alle zeven steden gecachet
  t/m 2026-07-12) — de uitgestelde visuele gates (AF-02 t/m AF-06, AF-08) zijn
  hier dus wél uitvoerbaar; bundel ze conform het rate-limit-beleid (één
  representatieve export per unit, volle sweep alleen bij AF-08). Paris'
  hoofdsporenbundel (tot 19 parallelle `usage=main`) blijft bewust vol
  gestileerd; AF-08 herbeoordeelt visueel. Metro-tunnel (AF-05d) en
  Countryside/Parks (AF-07c) blijven Coen-gates.
