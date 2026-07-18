# Active checkpoint

- **Updated:** 2026-07-17
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-04 — zichtbare landelijke place-labels — offline `DONE`
  (2026-07-17); de cached Nièvre-export + menselijke crop → AF-08. AF-01
  (`6b835c2`), AF-02a (`9c52015`), AF-02b (`cc65317`), AF-03a (`abf50bd`),
  AF-03b (`2cbcdca`), AF-03c (`c58d51c`) en de reviewfixes (`1c1d92e`) waren
  al `DONE`.
- **Owner/route:** AF-04 door O geïmplementeerd (E1-route; de vorige sessie
  viel vóór commit stil met de implementatie compleet in de working tree —
  deze sessie heeft de diff geverifieerd, alle suites gedraaid en de
  onafhankelijke reviewer-pass alsnog uitgevoerd: ACCEPT zonder defects).
- **Completed checkpoint:** AF-04 offline af: `buildPlaceLabelsLayer` →
  "Place names"-laag met tier-subgroepen (Villages/Hamlets/Farms &
  dwellings/Localities) uit de bestaande place_nodes-fetch; hiërarchie
  village > hamlet > dwelling/farm > locality; locality-declutter 600×sf px;
  naamdedup 1000×sf px (settlement wint); hoofdwegen-korridorcheck alleen
  voor place-labels; gedeeld collision-grid vóór street labels; beide
  pipelines; `tests/place-labels.mjs` 27 checks in smoke.sh; ENGINE-V2.md
  §2/§7; RESERVED_SVG_IDS aangevuld.
- **Next action:** AF-05a (railontwerp vastleggen — read-only spike over
  raildichtheid Oulu/Paris; O kiest één generale regel). NB: de spike heeft
  cached/live exports nodig — in deze omgeving geblokkeerd; zonder
  netwerk/cache is AF-06 (paddichtheid) of AF-07a/b het beste alternatieve
  vervolg, óf overdracht aan een sessie met netwerktoegang.
- **Changed for current unit:** engine-v2.js, script.js (alleen
  RESERVED_SVG_IDS), tests/place-labels.mjs (nieuw), tests/smoke.sh,
  ENGINE-V2.md, CHANGELOG.md, plans/.
- **Latest checks:** `node --check` beide bestanden groen;
  `tests/place-labels.mjs` 27/27; `svg-id-uniqueness`, `square-labels`,
  `pipeline-equivalence` en `OFFLINE_ONLY=1 bash tests/smoke.sh` volledig
  groen (2026-07-17, na AF-04).
- **Decisions/blockers:** **Netwerkblokkade:** deze remote-omgeving blokkeert
  Overpass én de ClipperLib-CDN (HTTP 403/geen route via agent proxy). Alle
  visuele cached/live-exportgates (AF-02 t/m AF-06, AF-08-sweep) en het
  real-worker-complementfixture voor AF-03b schuiven door naar een sessie met
  netwerktoegang of lokale cache. Reviewer-aandachtspunten AF-04 voor de
  Nièvre-crop: willekeurige locality-selectie binnen clusters; mogelijke
  naamdedup-oversuppressie bij veel voorkomende Franse toponiemen; stijl-/
  afstandsconstanten provisorisch (zie roadmapnotitie AF-04). Metro-tunnel
  (AF-05d) en Countryside/Parks (AF-07c) blijven Coen-gates.
