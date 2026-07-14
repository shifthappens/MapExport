# Active maintenance checkpoint

- **Updated:** 2026-07-14
- **Roadmap:** `plans/2026-07-14_codebase-maintenance-priorities.md`
- **Sprint:** Sprint 2 — Robuuste data-infrastructuur (`ACTIVE`; Sprint 1
  `COMPLETE` met Coens visuele sign-off, reviewblok in de roadmap).
- **Unit:** ME-04 `DONE` (04a validatie/limieten + 04b atomische writes +
  04c authorisatiebesluit/rate limit/size-cap-sweep; checkbox afgevinkt).
  Volgende unit: ME-05 (Overpass-failover/time-outs) `READY`, nog niet
  gestart.
- **Owner/route:** O voerde ME-04 volledig rechtstreeks uit; Coen nam het
  04c-Beslispunt (browser writes + rate limit; 2 GiB cap oudste-eerst).
- **Completed checkpoint:** `cache.php` POST-pad begrensd (8 MiB ontvangen /
  80 MiB gedecomprimeerd; methode/key/contenttype/gzip-stream/JSON-
  hoofdstructuur → 405/413/415/400 vóór diskwrite), atomair (tempfile+rename,
  stale-.tmp-reaper), per-IP schrijflimiet 300/10 min (429+Retry-After,
  fail-open, alleen POST) en sweep tijdens writes (proactieve TTL-opruiming +
  oudste-eerst-pruning boven 2 GiB; `MAPEXPORT_CACHE_*`-env-knoppen voor
  tests). GET/`?exists=`/legacy/TTL-leesgedrag byte-compatibel. Besluit
  gedocumenteerd in roadmap-Beslispunt en README-cachesectie.
- **Next action:** ME-05 starten: één fetch-helper met AbortController, harde
  pogingstime-out, endpointrotatie, begrensde backoff en gestructureerde
  foutinfo, gedeeld door v1/v2 op het ME-01-foutcontract; gemockte
  netwerkfouttests zonder live netwerk. Startpunten: `OVERPASS_ENDPOINTS`,
  `endpointBackoff`, `fetchLayer` en de endpoint-race in `script.js`.
- **Changed for current unit:** `cache.php`, `tests/cache-php.mjs`,
  `tests/smoke.sh`, `tests/README.md`, `README.md` (cachesectie),
  `AGENTS.md` (testlijst), roadmap (ME-04 afgevinkt, besluit, baselinelijst),
  `CHANGELOG.md` (2 entries), dit checkpoint.
- **Latest checks:** `node tests/cache-php.mjs` groen (38 checks, incl.
  rate-limit- en sweep-instanties); `OFFLINE_ONLY=1 bash tests/smoke.sh`,
  `sea-sign`, `hamlet-grounding` groen; `php -l cache.php`, `node --check
  script.js`/`engine-v2.js`, `bash -n` hook/minify/smoke groen. Geen live
  export gedraaid (GET-pad ongewijzigd; POST-gedrag met echte HTTP-requests
  tegen `php -S` bewezen).
- **Decisions/blockers:** rate limit telt pogingen (ook afgewezen), leest
  alleen `REMOTE_ADDR` (geen proxy-headers) en faalt open — een kapotte
  limiter mag exports nooit breken. Sweep max 1×/5 min achter non-blocking
  lock. Geen blockers; sprint-eindpoort wacht op ME-05.
