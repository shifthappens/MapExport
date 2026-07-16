# Active maintenance checkpoint

- **Updated:** 2026-07-14
- **Roadmap:** `plans/2026-07-14_codebase-maintenance-priorities.md`
- **Sprint:** Sprint 2 `COMPLETE` (eindpoort gehaald, reviewblok in de
  roadmap; Sprint 1 eveneens `COMPLETE`). Sprint 3 — Correctheid aantoonbaar
  maken — is de volgende, nog niet gestart (`PLANNED`).
- **Unit:** geen actieve unit. Eerstvolgende: ME-06a (v2 place-node padding)
  `READY`.
- **Owner/route:** O voerde ME-04 en ME-05 rechtstreeks uit; Coen nam het
  ME-04c-Beslispunt (browser writes + per-IP rate limit; 2 GiB cap
  oudste-eerst).
- **Completed checkpoint:** ME-05 af: alle Overpass-requests van beide engines
  lopen door één contract in `script.js` — `overpassAttempt` (harde
  per-poging-timeout, getypeerde fouten: timeout/rate-limited/http/network/
  parse/aborted, envelopcheck zodat een 2xx-proxypagina geen lege tile kan
  spelen), `overpassFetch` (rotatie + korte backoff na iedere mislukte
  poging, begrensde Retry-After ≤15 s) en `overpassFetchRace` (verliezers
  direct geabort). `runExportLifecycle` draagt een export-brede
  AbortController: een definitieve fout annuleert alle nog lopende requests;
  `sleep` is abort-aware. Foutmeldingen noemen soort uitval + mislukte tile;
  cache-leesfouten worden één keer per export gemeld i.p.v. stil als miss.
  `fetchTileCombined`/`fetchTileCombinedRace` zijn dunne wrappers; v2 deelt
  alles via `fetchLayer`.
- **Next action:** Sprint 3 starten met ME-06a: de 1000 m-padding van de v2
  place-nodequery toetsen aan labelplaatsing/tilegrenzen en de marge
  consistent maken (startpunt: place-nodequery in `engine-v2.js`).
- **Changed for current unit:** `script.js` (fetch-contract, lifecycle-abort,
  cache-diagnostiek), `tests/overpass-fetch.mjs` (nieuw, 17 gemockte checks),
  `tests/smoke.sh`, `tests/README.md`, `AGENTS.md`, roadmap (ME-05 afgevinkt,
  Sprint 2 COMPLETE + review), `CHANGELOG.md`, dit checkpoint.
- **Latest checks:** `node tests/overpass-fetch.mjs` groen (17 checks);
  `OFFLINE_ONLY=1 bash tests/smoke.sh` volledig groen (incl. export-failures,
  preview-state, cache-php); `sea-sign`, `hamlet-grounding` groen;
  `node --check script.js`/`engine-v2.js`, `php -l cache.php` groen. Geen
  live export gedraaid (geen render-/SVG-gedrag gewijzigd; netwerkpaden met
  gemockte fetch bewezen).
- **Decisions/blockers:** backoff-op-elke-mislukte-poging (500 ms→4 s,
  bestaand mechanisme) is de rotatiemotor — zonder die zou een hangend eerste
  endpoint elke retry opnieuw gekozen worden. `AbortSignal.any` vereist een
  2023+-browser, in lijn met het al gebruikte `AbortSignal.timeout`. Geen
  blockers.
