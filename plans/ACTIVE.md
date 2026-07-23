# Active checkpoint

- **Updated:** 2026-07-23
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-07c — Countryside/Parks & green tot één renderlaag — `COMPLETE`
  incl. tweede + derde ChatGPT-reviewronde (2026-07-23, lokaal geverifieerd;
  NIET gecommit, wacht op externe ChatGPT-hercontrole per Coens instructie).
- **Owner/route:** O direct; coverage/geometry-invarianten uit `ENGINE-V2.md`
  bindend gehouden. Geen Claude-reviewer gespawned.
- **Wat is gedaan (optie b — clip-and-move, rasterisatie-identiek):**
  1. Face-worker occlusion-pass knipt nu elk landcover-element tot element −
     dekkingsunie C (blocks ∪ named parks ∪ recreation ∪ water ∪ waterway-
     strokes; waterways NIEUW toegevoegd) en geeft de geknipte rest terug
     (`clippedLandcover`); volledig bedekte elementen → `culledLandcover`; niet-
     bedekte → onveranderde ruwe geometrie. Zero-candidate multi-ring
     normalisatie-cull behouden (reference-pariteit).
  2. `_mergedRings` (green-remainder grow) worden nu OOK geknipt tegen C en
     shippen hun geknipte gegroeide rings via `greenGroundMerges` (seam
     behouden). Dit verhelpt een regressie: ongeknipte merged-green
     overschilderde standalone buildings in de nieuwe hoge paintpositie (Oulu).
  3. `renderLandcover` schildert `_clippedRings`/`_mergedRings`.
  4. `layerOrder`: `landcover` van index 0 → vlak vóór `parks`; `buildSVG` nest
     `landcover` als eerste kind van de `parks_green`-parent (Countryside →
     Named parks → Recreation grounds).
  5. `tests/real-export.mjs` doorlust `clippedLandcover` (eigen post-worker glue).
  6. `landcoverLayer`/`parksLayer`/`recreationLayer` op de EngineV2-API voor het
     testharnas; `tests/editor-structure.mjs` + 7 nestchecks.
  7. ENGINE-V2 §4/§5/§7 + CHANGELOG bijgewerkt; roadmap-matrix/checkbox → FIXED.
- **Tweede reviewronde — 3 bevindingen + checkbox-merge (allemaal verwerkt):**
  - P1 (clip oversla­gen bij City blocks uit): clip-behoefte nu onafhankelijk
    van de City-blockcheckbox gepland. `planLayers` bepaalt `coverPaints`
    (alleen daadwerkelijk geschilderde lagen) + `needsLandcoverClip`; met City
    blocks uit + water/waterways aan draait een nieuwe worker-`clipOnly`-pass
    (skipt face-pipeline, draait enkel `computeOcclusion`) zodat Countryside
    niet meer over water schildert. `computeOcclusion` losgetrokken als
    hoisted functie; dekkingsregio's gegate op `coverPaints`.
  - P2a (tests bewaakten de risicovolste logica niet): `tests/landcover-clip.mjs`
    NIEUW — draait de echte FACE_WORKER_SRC, 16 checks: partieel/volledig/niet-
    bedekt clip+cull, waterway-overlap, painted-only covering (water uit →
    niet geknipt), en merged-clip Oulu-fix (gegroeide green geknipt van een
    building). In `smoke.sh` + `layer-selection.mjs` uitgebreid met
    `needsLandcoverClip`/`coverPaints`-asserts.
  - P2b (contract sprak implementatie tegen): ENGINE-V2 §4/§5/§7 herschreven —
    landcover niet meer "onderste laag", waterways NIET uitgesloten, merged
    WORDT geknipt, painted-only covering + clipOnly-pass gedocumenteerd.
  - Checkbox-merge (Coens directe instructie): "Parks & green"-checkbox stuurt
    nu ook Countryside + Sand (`isSelectedRenderLayer` volgt `parksLayer`); de
    losse "Countryside"-checkbox is vestigiaal in v2. CHANGELOG bijgewerkt.
- **Derde reviewronde — 2 bevindingen (beide verwerkt):**
  - P1 (clip-only liet culled landcover vallen): de `clipOnly`-tak destructureerde
    alleen `clippedLandcover`/`greenGroundMerges`, niet `culledLandcover`, dus
    volledig door water bedekte Countryside bleef schilderen. Root cause was
    duplicatie: `doExportV2` én `real-export.mjs` hadden elk hun eigen post-worker
    glue. Opgelost door die glue te extraheren naar één gedeelde
    `applyLandcoverOcclusion(elements, {culled,clipped,merged})` (merge → clip →
    cull, cull reindexeert dus laatst), die beide paden nu aanroepen — geen drift
    meer. `landcover-clip.mjs` Part C bewaakt dat de helper culled-indices dropt.
  - P1 (UI-eis: Countryside geen checkbox meer): opgelost zónder de bevroren
    v1 `script.js` te raken (§9) en zónder productie te wijzigen (het hele
    engine-v2.js-bestand wordt door deploy uit de productie-index gestript). Een
    nieuwe `applyMergedCountrysideVisibility` in `engine-v2.js` verbergt de
    `#lyr-landcover`-rij zolang v2 de actieve engine is (en toont hem weer voor
    v1); de input blijft in de DOM zodat `getSelectedLayers` +
    `isSelectedRenderLayer` de fold behouden. Live in de browser geverifieerd
    (v2 aan → rij verborgen, v2 uit → rij zichtbaar). `landcover-clip.mjs` Part D
    bewaakt het met een fake document. `layer-selection.mjs`-commentaar
    geherformuleerd (model-fold + verborgen rij i.p.v. "vestigiale checkbox").
    ENGINE-V2 §7 + CHANGELOG bijgewerkt.
- **Latest checks (allemaal groen):** `node --check engine-v2.js`;
  `OFFLINE_ONLY=1 bash tests/smoke.sh` incl. nieuwe `landcover-clip` (16/16) +
  `v2-face-runtime-benchmark` reference-pariteit + editor-structure nestchecks;
  7-steden cache-only v2-sweep (tilburg/ghent/paris/bremerhaven/oulu/nievre/
  erfurt) allemaal 0.000% bare, nul Overpass; before/after raster-diff Tilburg
  0 blobs ≥ 3×3mm-drempel, Oulu 4 dunne outline-blobs + visueel bevestigd.
- **Changed files (uncommitted):** `engine-v2.js`, `tests/real-export.mjs`,
  `tests/editor-structure.mjs`, `tests/layer-selection.mjs`,
  `tests/landcover-clip.mjs` (nieuw), `tests/smoke.sh`, `ENGINE-V2.md`,
  `CHANGELOG.md`, `plans/2026-07-17_cartographic-audit-followup.md`,
  `plans/ACTIVE.md`, plus 7 ververste `exports/map-useit-<city>-v2-2026-07-23.svg`
  trail-bestanden. De pre-existing cache rate-limit marker blijft ongemoeid.
- **Vierde reviewronde — resterend P2-testgat (verwerkt):** de destructuring van
  het worker-resultaat bleef de kwetsbare naad (veld eruit slopen → Part A en C
  blijven groen, bug terug). Structureel opgelost i.p.v. alleen getest: het hele
  workerresultaat wordt nu als één object bewaard en rechtstreeks aan
  `applyLandcoverOcclusion` doorgegeven — `doExportV2` houdt `faceResult` vast
  (geen per-veld locals meer) en `computeFacesAsync` resolvet met de payload
  gespread i.p.v. een handmatige veldenlijst. Er valt dus geen veld meer te
  vergeten. Daarbovenop `landcover-clip.mjs` Part E: een echte orchestratietest
  die `computeFacesAsync` met een fake worker draait en bewijst dat
  `culledLandcover` de hand-off overleeft, plus de end-to-end door naar de glue.
  Mutatietest gedaan: bug bewust teruggezet → Part E faalt op 2 checks; na
  terugdraaien weer groen. ENGINE-V2 §5 legt de object-hand-off vast als
  invariant. Geen CHANGELOG-entry: gedrag ongewijzigd, puur robuustheid.
- **Latest checks (ronde 3):** `node --check engine-v2.js`;
  `OFFLINE_ONLY=1 bash tests/smoke.sh` exit 0, `landcover-clip` nu 21 checks
  (incl. Part C cull-glue + Part D UI-hide), benchmark reference-pariteit +
  editor-structure/layer-selection groen. UI-hide live geverifieerd in de
  browser. Live city-blocks-off export in de preview-browser lukt niet (die
  browser heeft geen extern netwerk voor de geocode/Overpass-eerste-stap); de
  clip-only integratie is in plaats daarvan per naad afgedekt door unit tests.
- **Next action:** wacht op externe ChatGPT-hercontrole van AF-07c (derde
  ronde). Daarna: open roadmap-items AF-02/03/04 cached-exportgate (nu lokaal
  draaibaar), AF-07d (parkgrond boven city blocks) en AF-08 (zeven-steden-
  eindpoort). Niet committen/pushen/deployen zonder Coens verzoek.
- **Decisions/blockers:** geen open blockers. Checkbox-ontwerpvraag is
  opgelost: "Parks & green" stuurt nu Countryside + Sand mee (Coens keuze).
