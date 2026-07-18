# Active checkpoint

- **Updated:** 2026-07-18
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-05b — railregel implementeren — `DONE` (2026-07-18, reviewer
  ACCEPT). AF-01 t/m AF-04 en AF-05a waren al `DONE` (visuele gates → AF-08).
- **Owner/route:** AF-05b door O geïmplementeerd (klein, ontwerp lag al vast
  in AF-05a); onafhankelijke reviewer-pass vóór commit: ACCEPT zonder
  defects.
- **Completed checkpoint:** tweeklassenregel live in v2: rail-ways met
  `service=*` renderen als dunne gedempte stroke (1.8×sf, #555555, op. 0.5)
  in eigen `rail_service`-groep vóór de main-casings; main-signatuur en v1
  onaangetast; yard-only wrapper; geen labelgrid-stamp voor service;
  `tests/rail-service.mjs` (20 checks) in smoke.sh; ENGINE-V2.md §4/§7;
  before/after-render Oulu bevestigt de look.
- **Next action:** AF-05c (metroduplicatie en servicegeometrie: dubbele
  relation/member-ways voorkomen, depot-/serviceverbindingen filteren met een
  algemene OSM-regel; lijnsubgroepen en IDs stabiel houden). Daarna de
  gebundelde cached Oulu/Paris-exportgate voor AF-05b+c samen; AF-05d blijft
  `NEEDS_COEN`.
- **Changed for current unit:** engine-v2.js, script.js (alleen
  RESERVED_SVG_IDS), tests/rail-service.mjs (nieuw), tests/smoke.sh,
  ENGINE-V2.md, CHANGELOG.md, plans/.
- **Latest checks:** `node --check` beide engines groen;
  `tests/rail-service.mjs` 20/20; `OFFLINE_ONLY=1 bash tests/smoke.sh`
  exit 0 (2026-07-18, na AF-05b).
- **Decisions/blockers:** Cachebestanden van de 7 testgebieden zijn op
  2026-07-18 ge-touch't (TTL-klok gereset, houdbaar t/m 2026-07-25) én
  gekopieerd naar `cache/pinned/` — die submap valt buiten cache.php's
  sweep/expiry; herstel na TTL-verval: `cp cache/pinned/*.json.gz cache/`
  (zie `cache/pinned/README.md`). Lokale lamp-stack + cache aanwezig, maar de
  cachekeys van vóór de sprint dekken de huidige queries niet overal meer:
  één Oulu-exportpoging (2026-07-18) raakte live Overpass en kreeg
  429/504/timeout over de failoverketen — gestopt zonder retry conform
  beleid. De visuele gates blijven gebundeld: AF-05b+c samen (Oulu/Paris),
  rest in AF-08. Paris' hoofdsporenbundel blijft bewust vol gestileerd;
  AF-08 herbeoordeelt. Metro-tunnel (AF-05d) en Countryside/Parks (AF-07c)
  blijven Coen-gates.
