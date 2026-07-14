# Active maintenance checkpoint

- **Updated:** 2026-07-14
- **Roadmap:** `plans/2026-07-14_codebase-maintenance-priorities.md`
- **Sprint:** Sprint 2 — Robuuste data-infrastructuur (`ACTIVE`; Sprint 1
  `COMPLETE` met Coens visuele sign-off, reviewblok in de roadmap).
- **Unit:** ME-04a (validatie/limieten) `DONE` + ME-04b (atomische writes)
  `DONE` als één diff (zelfde POST-handler). ME-04c (authorisatiemodel +
  opruimbeleid) `WAITING_FOR_USER` — het roadmap-Beslispunt.
- **Owner/route:** O voerde 04a/04b rechtstreeks uit (security-gevoelig klein
  bestand; briefing+review zou meer kosten dan direct uitvoeren).
- **Completed checkpoint:** `cache.php` POST-pad begrensd en gevalideerd
  (8 MiB ontvangen / 80 MiB gedecomprimeerd, methode/key/contenttype/
  gzip-stream/JSON-hoofdstructuur; 405/413/415/400 vóór iedere diskwrite) en
  atomair gemaakt (tempfile in `cache/` + rename; stale-.tmp-reaper).
  GET/`?exists=`/legacy/TTL-gedrag byte-compatibel. Nieuwe requesttest
  `tests/cache-php.mjs` (eigen `php -S`, 31 checks) in smoke.sh en docs.
- **Next action:** Coen kiest het ME-04c-authorisatiemodel (Beslispunt in de
  roadmap): (a) browserclients blijven direct schrijven met misbruikbeperking
  (bv. rate-limit per IP en/of een door de server uitgegeven token), of
  (b) een server-side fetchroute waarbij cache.php zelf Overpass bevraagt en
  de POST-schrijfroute dichtgaat. Daarna ME-04c implementeren (authorisatie +
  maximale cacheleeftijd/-omvang) en ME-04 afvinken; dan ME-05.
- **Changed for current unit:** `cache.php` (herschreven POST-pad),
  `tests/cache-php.mjs` (nieuw), `tests/smoke.sh`, `tests/README.md`,
  `AGENTS.md` (testlijst), roadmap (baselinelijst), `CHANGELOG.md`, dit
  checkpoint.
- **Latest checks:** `OFFLINE_ONLY=1 bash tests/smoke.sh` groen incl. nieuwe
  cache-php-suite (31/31); `sea-sign`, `hamlet-grounding` groen; `php -l
  cache.php`, `node --check script.js`/`engine-v2.js`, `bash -n` op hook/
  minify/smoke groen. Geen live export gedraaid (cache.php-gedrag is met
  echte HTTP-requests tegen `php -S` getest; GET-pad ongewijzigd).
- **Decisions/blockers:** limieten gekozen op 8 MiB ontvangen (client gzipt
  juist om onder post_max_size 8M te blijven) en 80 MiB gedecomprimeerd
  (~10× typische gzip-ratio); structuurcheck is een head/tail-check op
  `"elements"`, geen volledige parse (geheugen). Blocker voor ME-04-afronding:
  de authorisatiekeuze hierboven ligt bij Coen.
