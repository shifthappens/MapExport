# Active checkpoint

- **Updated:** 2026-07-19
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-07b — technische namen — offline `DONE` (2026-07-19).
  Onafhankelijke reviewer-pass: **ACCEPT zonder defects** (⚠ alleen in
  `inkscape:label`, alle zes emit-sites gedekt, escaping en beide
  Illustrator-pipelines geverifieerd). Genoteerde restpunten (by design,
  geen actie): regex 2 markeert ook een legitieme kale code-naam als "O2";
  het curved-label-basispad in `<defs>` houdt bewust de rauwe naam — de
  zichtbare tekst zelf draagt de ⚠. AF-07a blijft compleet met
  reviewer-ACCEPT (restpunt AF-08-sweep: blob-randje op gedeelde randen).
- **Owner/route:** O direct (inventaris + kleine gedeelde helperwijziging);
  reviewer (read-only) als onafhankelijke pass conform sprintprotocol.
- **Completed checkpoint:** AF-07b compleet: inventaris tegen de gepinde
  zeven-stedencache (29.613 benoemde elementen, 140 verdachte) wees uit dat
  alleen Parijse kadastrale werknamen ("Voie FI/13", "Place FO/13" — mét
  wikidata/`source:name=cadastre`, dus legitiem) en kale refcodes ("BAD 2")
  gerenderde labels bereiken; rest zit in nooit-gelabelde data. Keuze:
  editorwaarschuwing, geen filter — `isTechnicalName`/`editorPanelName`
  (script.js, na parksNamedGate) prefixt de `inkscape:label`-paneelnaam met
  "⚠ " op de drie labeloppervlakken (street ×4 emit-sites, feature/square,
  v2 place); kaarttekst, ids en Illustrator-uitvoer (stript `inkscape:*`)
  ongewijzigd. `tests/technical-names.mjs` (33 checks) in smoke.sh;
  ENGINE-V2.md §7, CHANGELOG en roadmapmatrix/checkbox bijgewerkt.
- **Next action:** geen offline unit meer beschikbaar in deze omgeving:
  AF-06/AF-08 vereisen crops/sweep (visueel, live Overpass); AF-05d/AF-07c
  blijven Coen-beslissingen. Eerstvolgende zinvolle sessie: AF-08-sweep in
  een omgeving mét netwerk, of Coens besluiten op AF-05d/AF-07c.
- **Changed for current unit:** script.js (isTechnicalName/editorPanelName +
  labelemitters), engine-v2.js (place-labelemitter),
  tests/technical-names.mjs (nieuw), tests/smoke.sh, ENGINE-V2.md,
  CHANGELOG.md, plans/.
- **Latest checks:** `node --check` script.js/engine-v2.js groen;
  `tests/technical-names.mjs` 33/33; `OFFLINE_ONLY=1 bash tests/smoke.sh`
  volledig groen (v2-cutterless-worker SKIPt zonder ClipperLib-cache/netwerk,
  zoals bekend in deze sandbox) (2026-07-19).
- **Decisions/blockers:** AF-07b-keuze: waarschuwing, geen filter — de
  corpus-gevallen zijn legitieme OSM-namen (wikidata/kadaster), dus stil
  verwijderen is uitgesloten; patronen alleen verbreden op corpusbewijs,
  nooit een per-stadlijst. ⚠ mag alléén in `inkscape:label` leven (de
  Illustrator-wrapper stript die bij assemblage). Cache-corpus (63/63 keys)
  gepind in `cache/pinned/` (herstel: `cp cache/pinned/*.json.gz cache/`;
  TTL t/m 2026-07-25). Metro-tunnel (AF-05d) en Countryside/Parks (AF-07c)
  blijven Coen-gates.
