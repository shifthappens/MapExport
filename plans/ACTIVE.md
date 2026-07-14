# Active maintenance checkpoint

- **Updated:** 2026-07-14
- **Roadmap:** `plans/2026-07-14_codebase-maintenance-priorities.md`
- **Sprint:** Sprint 2 — Robuuste data-infrastructuur (`ACTIVE`; Sprint 1 is
  `COMPLETE` met Coens visuele sign-off van 2026-07-14, reviewblok staat in de
  roadmap).
- **Unit:** ME-04a (validatie/limieten) + ME-04b (atomische writes) `IN_PROGRESS`
  als één diff — beide raken dezelfde POST-handler in `cache.php`. ME-04c
  (authorisatiemodel + opruiming) is `WAITING_FOR_USER` (roadmap-Beslispunt).
- **Owner/route:** O voert 04a/04b rechtstreeks uit (security-gevoelig klein
  bestand; briefing+review zou meer kosten dan direct uitvoeren).
- **Completed checkpoint:** Sprint 1-afsluiting gecommit; ME-04 gestart.
- **Next action:** `cache.php` POST-pad begrenzen (harde compressed/decompressed
  limieten, methode/key/contenttype/gzip/JSON-structuurvalidatie) en atomair
  maken (tempfile+rename); `tests/cache-php.mjs` requesttests tegen `php -S`
  schrijven; changelog; checks draaien.
- **Changed for current unit:** `cache.php`, `tests/cache-php.mjs` (nieuw),
  `CHANGELOG.md`, dit checkpoint.
- **Latest checks:** nog geen voor deze unit.
- **Decisions/blockers:** ME-04c-authorisatiemodel vergt één menselijke keuze
  (browserclients direct laten schrijven + misbruikbeperking, of een
  server-side fetchroute); validatie/limieten/atomiciteit staan daar per
  roadmap los van en gaan alvast door. GET-semantiek (hit/miss/`null`, gzip
  passthrough, `?exists=`-batch) blijft byte-compatibel.
