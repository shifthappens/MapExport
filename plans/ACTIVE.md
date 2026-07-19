# Active checkpoint

- **Updated:** 2026-07-19
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** zeven-steden cachewarmingbeleid + AF-05b/c contextdata — `DONE`
  (63/63 huidige v2-keys bevestigd en gepind; AF-05c-code reviewers `ACCEPT`).
- **Owner/route:** O stelde beleid/toolcontract vast; E1 bouwde de cache-only
  prefetcher; E0-agenten vulden de corpus sequentieel op de achtergrond.
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
  tests/README en smoke-integratie bijgewerkt. Cache-only prefetcher nu ook
  gebouwd en onafhankelijk `ACCEPT`: 63 keys uit bron (7×9), cache-first,
  gevalideerde gzipwrites + HIT-confirmatie, strikt sequentieel, 30 s/10 s/
  60 min. Live dry-run: 28 hits, 35 gaps, nul writes/Overpass-verkeer.
- **Next action:** voer nu de volledig gecachete AF-05b/c contextgate uit:
  eerst Paris, daarna Oulu, één exportproces tegelijk; inspecteer de relevante
  rail-/metrocrops. Daarna blijft AF-05d `NEEDS_COEN`.
- **Changed for current unit:** alleen cache/pinned + roadmap/ACTIVE; beleid en
  tool staan in `e376bc9`, timerfix in `bc599fc`; appbron bleef onaangetast.
- **Latest checks:** `node --check` script.js/engine-v2.js/test groen;
  `tests/metro-dedup.mjs` 26/26; offline smoke groen t/m
  v2-cutterless-worker; `tests/cache-php.mjs` volledig groen buiten sandbox
  (sandbox blokkeerde alleen de tijdelijke localhostserver); reviewer ACCEPT
  (2026-07-19). Na paletfix opnieuw groen: metro-dedup 26/26,
  svg-id-uniqueness, pipeline-equivalence en rail-service; tweede reviewer
  ACCEPT. Cachewarmer: `node --check`, `--help`, live `--dry-run` (63 keys,
  28/35 hit/gap), `git diff --check`; onafhankelijke reviewer ACCEPT. Live run
  59m33s: 114 pogingen, 32 successen, 82 begrensde fouten, geen ongeldige
  response gecachet; eind-dry-run 60/63. Deadline-timerfix (`Math.floor`) daarna
  syntax/diff groen en follow-up reviewer ACCEPT. Hervatting: 5m10s,
  10 pogingen, 3 successen, 7 begrensde 504/timeouts; eind-dry-run 63 hits,
  0 gaps. De drie laatste keys zijn gepind.
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
  timeout; Oulu daarom niet gestart. Het oude stop-na-één-foutbeleid is op
  2026-07-19 vervangen: goedkope achtergrondagent blijft nu begrensd proberen
  (30 s/10 s/60 min), strikt sequentieel. Inventaris bij start: 35 huidige v2-
  cachegaten — Paris 2, Oulu 3, en Tilburg/Ghent/Bremerhaven/Nièvre/Erfurt elk
  6; `area_features` ontbreekt door de nieuwe queryhash in alle zeven. Focused
  cached Paris-metro-before/after is
  wel PASS: 63 service-ways weg, één naamfragment samengevoegd, 11→7 groepen,
  nul kleurwijzigingen op overlevende groepen en depotblobs visueel weg. De
  tijdelijke replaybestanden zijn verwijderd. De volledige contextgate blijft
  gebundeld: AF-05b+c samen (Oulu/Paris),
  rest in AF-08. Paris' hoofdsporenbundel blijft bewust vol gestileerd;
  AF-08 herbeoordeelt. Metro-tunnel (AF-05d) en Countryside/Parks (AF-07c)
  blijven Coen-gates.
  Eerste achtergrond-run (2026-07-19) vulde 32 van 35 gaps en pinnde de 60
  bevestigde huidige keys; alleen Tilburg/roads, Ghent/street_labels en
  Ghent/area_features resten. De run bereikte de uurgrens en onthulde alleen
  een fractionele-millisecondebug in de deadlinesleep; cachewrites bleven
  atomair/valide en de tool rondt timers nu neer op gehele milliseconden.
  Tweede achtergrond-run vulde Tilburg/roads, Ghent/street_labels en
  Ghent/area_features; de huidige zeven-steden-corpus is nu volledig (63/63)
  en gepind. Er is geen Overpass/cacheblocker meer voor de AF-05-contextgate.
