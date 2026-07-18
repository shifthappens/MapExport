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
  tautologische assert; hersteld en uitgebreid naar 26 checks (incl. siding,
  expliciete non-mutatie en stabiele publiekslijnkleur). De eerste cached
  Paris-before/after bracht nog een paletverschuiving aan het licht doordat
  verwijderde groepen de sequentiële kleurindex opschoven; hersteld door kleuren
  tegen de originele groepssleutels vast te zetten. Contract, changelog,
  tests/README en smoke-integratie bijgewerkt.
- **Next action:** hervat na Overpass-cooldown eerst de volledige Paris-export
  uit de nu aangevulde cache; ontbrekende `street_labels` faalde op
  429/504/timeout. Alleen na Paris-succes Oulu sequentieel uitvoeren. Verwerk de
  context-crops; daarna blijft AF-05d `NEEDS_COEN`.
- **Changed for current unit:** engine-v2.js, tests/metro-dedup.mjs (nieuw),
  tests/smoke.sh, tests/README.md, ENGINE-V2.md, CHANGELOG.md en beide actieve
  planbestanden.
- **Latest checks:** `node --check` script.js/engine-v2.js/test groen;
  `tests/metro-dedup.mjs` 26/26; offline smoke groen t/m
  v2-cutterless-worker; `tests/cache-php.mjs` volledig groen buiten sandbox
  (sandbox blokkeerde alleen de tijdelijke localhostserver); reviewer ACCEPT
  (2026-07-19). Na paletfix opnieuw groen: metro-dedup 26/26,
  svg-id-uniqueness, pipeline-equivalence en rail-service; tweede reviewer
  ACCEPT.
- **Decisions/blockers:** Cachebestanden van de 7 testgebieden zijn op
  2026-07-18 ge-touch't (TTL-klok gereset, houdbaar t/m 2026-07-25) én
  gekopieerd naar `cache/pinned/` — die submap valt buiten cache.php's
  sweep/expiry; herstel na TTL-verval: `cp cache/pinned/*.json.gz cache/`
  (zie `cache/pinned/README.md`). Lokale lamp-stack + cache aanwezig, maar de
  cachekeys van vóór de sprint dekken de huidige queries niet overal meer:
  één Oulu-exportpoging (2026-07-18) raakte live Overpass en kreeg
  429/504/timeout over de failoverketen — gestopt zonder retry conform
  beleid. Paris (2026-07-19) vulde roads/rail/tram/metro aan (metro: 167 ways),
  maar de volledige export stopte daarna bij `street_labels`: 429 + 504 +
  timeout; Oulu daarom niet gestart. Focused cached Paris-metro-before/after is
  wel PASS: 63 service-ways weg, één naamfragment samengevoegd, 11→7 groepen,
  nul kleurwijzigingen op overlevende groepen en depotblobs visueel weg. De
  tijdelijke replaybestanden zijn verwijderd. De volledige contextgate blijft
  gebundeld: AF-05b+c samen (Oulu/Paris),
  rest in AF-08. Paris' hoofdsporenbundel blijft bewust vol gestileerd;
  AF-08 herbeoordeelt. Metro-tunnel (AF-05d) en Countryside/Parks (AF-07c)
  blijven Coen-gates.
