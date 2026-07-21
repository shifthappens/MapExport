# Active checkpoint

- **Updated:** 2026-07-21
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-06 — park- en begraafplaatspaden generaliseren — `DONE`
  (2026-07-21).
- **Owner/route:** O direct; geen agentdelegatie (kleine gedeelde rendererwijziging,
  visueel besluit al lokaal vastgesteld).
- **Completed checkpoint:** AF-06 voltooid. De gedeelde wegenrenderer heeft nu
  aparte water- en groenclips: op water blijven alle kleine paden wit voor
  contrast; op groen blijven alleen cycleways en benoemde paden wit. Naamloze
  footways, paths en steps krijgen daar een parkkleurige maskerstrook, zodat
  hun gewone stijl buiten groen onveranderd blijft maar ze geen technische
  hatching vormen. `tests/park-paths.mjs` dekt beide clips en alle drie
  beleidsgevallen; `tests/area-binding.mjs` houdt recreation gekoppeld aan de
  groenclip.
- **Next action:** AF-08 blijft de volgende uitvoerbare sweep zodra Coen de
  open keuzes AF-05d (metro-tunnel) en AF-07c (Countryside/Parks & green)
  heeft beslist; geen verdere lokale AF-06-actie nodig.
- **Changed for current unit:** `script.js`, `engine-v2.js`,
  `tests/park-paths.mjs`, `tests/area-binding.mjs`, `tests/svg-id-uniqueness.mjs`,
  `tests/smoke.sh`, CHANGELOG, roadmap en de drie nieuwste v2-trails.
- **Latest checks:** cache-inventaris 63/63 v2-keys lokaal aanwezig (geen
  Overpass); cache-only v2-exports voor Oulu, Bremerhaven en Ghent hadden elk
  9 cache-hits, 0 misses/writes/Overpass, SVG-lint 0 en renderdekking 0.000%.
  Lokale browsercrops van Oulu cemetery, Bürgerpark en Citadelpark tonen geen
  technische hatch meer, met geselecteerde oriëntatieroutes leesbaar.
  `OFFLINE_ONLY=1 bash tests/smoke.sh` is groen (PHP-cachetest via localhost).
- **Decisions/blockers:** AF-06 beleid: nooit een gewone path/footway buiten
  groene vlakken wijzigen; water houdt zijn volledige witte contrast. Op
  parks/cemetery/recreation behouden cycleways en benoemde paden de witte
  oriëntatie-overlay, gewone naamloze trails niet. Metro-tunnel (AF-05d) en
  Countryside/Parks (AF-07c) blijven Coen-gates.
