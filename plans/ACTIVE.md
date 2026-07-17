# Active checkpoint

- **Updated:** 2026-07-17
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-03a — scrub/heath aan Landcover/Countryside binden — `READY`.
  AF-01 (`6b835c2`), AF-02a (`9c52015`), AF-02b (`cc65317`) zijn `DONE`;
  AF-02c-hercontrole afgerond zonder codewijziging (geen reproduceerbaar
  restgeval; bewijs in het planbestand). ME-06c gesynchroniseerd.
- **Owner/route:** O orchestreert; AF-03a is E1 (`scoped-implementer`) na
  O-contractcheck; AF-03b/c zijn E2 met onafhankelijke `reviewer`-pass.
- **Completed checkpoint:** AF-02 offline volledig af: feature-labeldedup
  (naam+1000×sf, grootste eerst), eigen `square_labels`-groep + geen
  street-labelduplicaat, ENGINE-V2.md §2/§7 geamendeerd; tests
  `svg-id-uniqueness`/`feature-label-dedup`/`square-labels` in smoke.sh,
  volledige offline suite groen.
- **Next action:** AF-03a: bind `natural=scrub|heath` in engine v2 aan de
  Landcover/Countryside-rendering (AREA_FEATURES-tabel, één rij + querycheck +
  presetkleur conform ENGINE-V2.md §5; coverage/complement is
  acceptatie-invariant). Baselines: Ghent fallback 20/24 en Nièvre fallback 1.
  O checkt eerst het §5-contract en de bestaande scrub-fetch/renderpaden.
- **Changed for current unit:** nog niets (AF-03a niet gestart).
- **Latest checks:** `OFFLINE_ONLY=1 bash tests/smoke.sh` volledig groen na
  AF-02b; `node --check script.js`/`engine-v2.js` groen; svg-lint op alle
  zeven audit-exports: 0 errors/0 warnings.
- **Decisions/blockers:** **Netwerkblokkade:** deze remote-omgeving blokkeert
  alle drie Overpass-endpoints (HTTP 403 via agent proxy; één sequentiële
  Erfurt-poging op 2026-07-17, conform geen-retry-beleid). Alle visuele
  cached/live-exportgates (AF-02 t/m AF-06, AF-08-sweep) schuiven door naar
  een sessie met netwerktoegang of lokale cache; offline tests blijven de
  primaire lus. Metro-tunnel (AF-05d) en Countryside/Parks (AF-07c) blijven
  Coen-gates.
