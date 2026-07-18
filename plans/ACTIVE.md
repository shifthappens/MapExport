# Active checkpoint

- **Updated:** 2026-07-19
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-05c — metroduplicatie en servicegeometrie — `DONE` (2026-07-19,
  reviewer `ACCEPT`).
- **Owner/route:** implementatie door Claude gestart; O hervatte de werkboom,
  repareerde/completeerde fixture, contract en integratie; onafhankelijke
  reviewer-pass: ACCEPT zonder defects.
- **Completed checkpoint:** v2 filtert elk `service=*`-metrospoor uit de
  publiekslaag; ref-loze ways met een exact eenduidig name→ref-signaal voegen
  zich bij de bestaande ref-lijngroep. Ambigue namen blijven apart; brondata,
  tunnels, schone groep/IDs en v1 blijven onaangetast. Overgenomen fixture had
  twee fout-negatieven door een niet-nestingbewuste `<g>`-extractor en één
  tautologische assert; hersteld en uitgebreid naar 25 checks (incl. siding en
  expliciete non-mutatie). Contract, changelog, tests/README en smoke-integratie
  bijgewerkt.
- **Next action:** voer de gebundelde cached Oulu/Paris-exportgate voor
  AF-05b+c uit (één proces tegelijk; stop op cachemiss/429/timeout volgens
  beleid). Verwerk de cropconclusie; daarna AF-05d blijft `NEEDS_COEN`.
- **Changed for current unit:** engine-v2.js, tests/metro-dedup.mjs (nieuw),
  tests/smoke.sh, tests/README.md, ENGINE-V2.md, CHANGELOG.md en beide actieve
  planbestanden.
- **Latest checks:** `node --check` script.js/engine-v2.js/test groen;
  `tests/metro-dedup.mjs` 25/25; offline smoke groen t/m
  v2-cutterless-worker; `tests/cache-php.mjs` volledig groen buiten sandbox
  (sandbox blokkeerde alleen de tijdelijke localhostserver); reviewer ACCEPT
  (2026-07-19).
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
