# Tussen-sprint: cartografische audit verwerken

**Status: ACTIVE (2026-07-17).** Deze tussen-sprint is door Coen expliciet
ingevoegd na maintenance Sprint 2 en vóór Sprint 3. De maintenance-roadmap blijft
de bron voor ME-06–ME-12, maar Sprint 3 start pas nadat deze tussen-sprint haar
eindpoort heeft gehaald of resterende productbesluiten bewust zijn uitgesteld.

**Audit en bewijs:**
[`reports/cartographic-audit-2026-07-17/README.md`](../reports/cartographic-audit-2026-07-17/README.md)
met screenshots in dezelfde map. De USE-IT Ghent-reference staat in
[`references/2021_ghent/`](../references/2021_ghent/).

## Doel

Alle bevindingen uit de zeven-steden-audit krijgen een expliciete bestemming:

- gerepareerd en met een regressietest geborgd;
- vastgelegd als bewuste cartografische stijl;
- herleid tot OSM-brondata en dus niet door de renderer “gerepareerd”;
- of als concreet productbesluit uitgesteld met eigenaar en beslisvraag.

De sprint is pas klaar wanneer geen auditpunt nog impliciet of alleen in prose
bestaat. “Alles verwerken” betekent niet dat iedere OSM-onvolkomenheid in code
wordt gemaskeerd en ook niet dat een model zelfstandig een nieuwe kaartstijl
mag verzinnen.

## Vaststaande stijl- en contractbesluiten

Deze punten zijn geen open werk en mogen niet opnieuw als defect worden
behandeld:

1. **City blocks zijn bewust grote crèmekleurige abstracties.** Meer
   gebouwtextuur toevoegen is geen doel van deze sprint. Crème is alleen een
   probleem wanneer een vlak aantoonbaar semantisch in een andere laag hoort.
2. **De v2-coverage promise blijft bindend:** 0.000% bare land, complementregel
   en paint-order uit `ENGINE-V2.md` blijven intact.
3. **Fallback blijft bestaan** als auditeerbare deklaag voor echte restvlakken.
   Alleen bekende semantiek hoort uit `Uncategorized` te worden gehaald.
4. **Nièvre bevat echte OSM-relation holes.** Die blijven als brondata-issue in
   het auditrapport staan; de renderer mag ze niet stilzwijgend als bos/weide
   invullen zonder algemene, bewezen regel.
5. **Lange landelijke straatnamen mogen functioneel worden herhaald.** Alleen
   nabijgelegen duplicaten en botsingen zijn in scope.
6. Geen deploy, push, default-enginewijziging of v2-cutover binnen deze sprint.

## Uitvoeringsprotocol voor Claude/Codex

Een nieuwe sessie leest alleen `AGENTS.md`, `plans/ACTIVE.md`, deze inleiding en
de actieve unit. Vóór iedere wijziging aan `engine-v2.js` moet de volledige
`ENGINE-V2.md` worden gelezen. Het volledige maintenance-roadmapbestand hoeft
niet opnieuw te worden geladen.

- Werk **één unit of letter-subunit per sessie/diff** af. Geen opportunistische
  aangrenzende fixes.
- De primaire agent is orchestrator (O). In Claude runtimes: gebruik
  `scoped-implementer` voor afgebakende E1-code, `reviewer` voor onafhankelijke
  read-only review van coverage/geometry/structuur en `mechanical-executor` voor
  inventories, fixtures en testmatrices. Schrijfscopes mogen niet overlappen.
- O bezit alle drempel-, laag- en productkeuzes en inspecteert diff plus
  testbewijs vóór acceptatie.
- Iedere gedragswijziging krijgt bovenaan `Unreleased` in `CHANGELOG.md` een
  korte, gebruikersgerichte entry. Audit-, test- en plandocumentatie alleen is
  daarvan uitgezonderd.
- Start en materiële checkpoints worden kort in `plans/ACTIVE.md` gezet. Bij
  een model-/usage-limit: stop op een groene of duidelijk falende grens, noteer
  exact de volgende actie en laat geen half ontworpen alternatief achter.
- Markeer een checkbox hier pas na de genoemde acceptatie. Alleen O wijzigt
  normaal deze matrix en `ACTIVE.md`.

## Rate-limit- en exportbeleid

Dit beleid begrenst zowel modelgebruik als Overpass-/exportverkeer:

1. **Offline eerst.** Iedere subunit begint met gerichte unit-/fixturetests en
   syntaxchecks. De bestaande SVG's en auditscreenshots zijn de baseline; live
   OSM hoeft niet opnieuw te worden bekeken tenzij een concrete bronmismatch
   onopgelost blijft.
2. **Geen zeven-steden-export per kleine fix.** Gebruik de minimale stadsmatrix
   bij de unit. Een volledige zeven-steden-sweep gebeurt alleen bij AF-08.
3. **Cache vóór netwerk.** Gebruik de lokale cache wanneer een zichtbare export
   nodig is. Als een cachemiss live Overpass zou raken, doe dat sequentieel met
   maximaal één exportproces; start geen parallelle stadsexports.
4. **Cachewarming op de achtergrond (beleid gewijzigd 2026-07-19).** Bij
   cachemissen, 429, timeout of endpointuitval delegeert O één sequentiële,
   cache-only prefetchjob aan een goedkope agent via
   `tools/prefetch-validation-cache.mjs`: maximaal 30 s per live poging, 10 s
   cooldown, endpointrotatie en round-robin over mislukte keys tot alles binnen
   is of 60 minuten zijn verstreken. Eén request tegelijk; nooit parallelle
   stadworkers en geen full-export-retryloop. Een eerste live fout is hiermee
   achtergrondstatus, geen blocker. Alleen de eindset ontbrekende keys komt in
   `ACTIVE.md`.
5. **Visuele gates bundelen.** AF-02, AF-03, AF-04 en AF-05 krijgen elk hooguit
   één kleine representatieve cached-exportgate. AF-08 doet daarna één volledige
   sequentiële sweep. Zo betalen we niet voor zeven keer dezelfde renderlus per
   subunit.
6. **Bewijs compact houden.** Bewaar per bevinding alleen baseline, nieuwe crop
   en conclusie; geen batches tussentijdse exports. Bij de eindsweep geldt de
   bestaande newest-per-city policy voor `exports/`.

## Voortgangsmatrix

| Auditbevinding | Status | Uitvoering/besluit |
|---|---|---|
| Geen magenta dekkingsgaten | PASS | Regressie-invariant; opnieuw bewijzen in AF-08 |
| Crèmekleurige city blocks | ACCEPTED_STYLE | Bewuste abstractie; niet wijzigen |
| Niet-unieke SVG-ID's | FIXED | AF-01 (2026-07-17); documentbrede allocator, regressietest `tests/svg-id-uniqueness.mjs`; ME-06c gesynchroniseerd |
| Herhaalde water-/parklabels | FIXED | AF-02a (2026-07-17); dedup op naam+afstand, `tests/feature-label-dedup.mjs`; visuele bevestiging in AF-08-sweep |
| Pleinen als park én straat | FIXED | AF-02b (2026-07-17); eigen `square_labels`-groep, `tests/square-labels.mjs`; visuele bevestiging in AF-08-sweep |
| Afgesneden randlabels/resterende botsingen | PASS | AF-02c-hercontrole: geen reproduceerbaar restgeval (svg-lint 0/0 op alle zeven exports); rest herleid naar AF-05/AF-06 |
| Scrub/heath in fallback | FIXED | AF-03a (2026-07-17); paint-only binding, `tests/area-binding.mjs`; visuele bevestiging in AF-08-sweep |
| Golf/allotments/dog park/sports centre/wetland | FIXED | AF-03b (2026-07-17); wetland → veldtint via grass-route, recreation → eigen `parks_recreation`-laag onder "Parks & green"; `tests/area-binding.mjs` uitgebreid; visuele bevestiging in AF-08-sweep |
| Residential/institutional/parking/rail/industrial fallback | FIXED | AF-03c (2026-07-17); institutional/education/religious → urban-signaal (drempels ongewijzigd, industrial blijft uitgesloten), fallback-families "Working land"/"Railway grounds"/"Paved areas"; `tests/area-binding.mjs` uitgebreid; visuele bevestiging in AF-08-sweep |
| Echte Uncategorized/OSM-holes Nièvre | SOURCE_DATA | Niet automatisch invullen; AF-08 controleert alleen stabiliteit |
| Zichtbare place-labels ontbreken in Nièvre | OPEN | AF-04 |
| Overdominante rail yards/roundhouse | FIXED | AF-05a/b (2026-07-18): tweeklassenregel op `service=*`, `tests/rail-service.mjs`; visuele bevestiging in AF-08-sweep |
| Metro member/service-duplicatie | FIXED | AF-05c (2026-07-19): `service=*` weg; eenduidige ref-loze naamfragmenten voegen bij bestaande lijngroep; cached Paris-gate nog gebundeld met AF-05b |
| Ondergrondse metro als zichtbare overlay | FIXED | AF-05d (2026-07-23): Coen koos "zichtbaar maar subtieler"; geen casing, gestreepte lijn, lagere opacity, lijnkleur behouden; `tests/metro-tunnel.mjs` |
| Te dichte park-/cemeterypaden | FIXED | AF-06 (2026-07-21): aparte water-/groenclips; water houdt alle paden wit, groen alleen cycleways/benoemde paden; naamloze trails worden op groen gemaskeerd, `tests/park-paths.mjs`; lokale Oulu/Bremerhaven/Ghent-crops bevestigd |
| Tram-/city-blocksubgroepen en labels | FIXED | AF-07a (2026-07-19): tram casing/fill-groepslabels + Hamlets/Standalone buildings-subgroepen in city_blocks, `tests/editor-structure.mjs`; visuele bevestiging in AF-08-sweep |
| Technische OSM-namen zoals `Place FO/13` | FIXED | AF-07b (2026-07-19): editorwaarschuwing (⚠-prefix op `inkscape:label`), geen filter — corpusbewijs: alleen Parijse kadastrale namen + kale refcodes bereiken gerenderde labels en zijn legitiem (wikidata/kadaster); `tests/technical-names.mjs` |
| Countryside versus Parks & green | FIXED | AF-07c (2026-07-23): Coen koos optie (b); Countryside geknipt tot zichtbare rest (worker occlusion-clip) en genest onder "Parks & green" als eerste kind — één renderlaag, één paintpositie, rasterisatie-identiek; merged green ook geknipt (Oulu-gebouwenregressie gevonden+verholpen); `tests/editor-structure.mjs` uitgebreid; 7-steden cache-only sweep 0.000% bare |
| Parken en stedelijk groen verdwijnen onder city blocks | OPEN | AF-07d: aparte diagnose en contract voor Piushaven en Cobbenhagenpark |

Statuswaarden: `OPEN`, `IN_PROGRESS`, `FIXED`, `PASS`, `ACCEPTED_STYLE`,
`SOURCE_DATA`, `NEEDS_COEN`, `DEFERRED_DESIGN`.

## Units

### [x] AF-01 — Documentbrede, deterministische SVG-ID's

**Afgerond 2026-07-17.** Eén documentbrede allocator per `buildSVGContext`
(`ctx.uid`); `makeUidGen` reserveert companion-suffixen (`_casing`,
`_sleepers`, `_green`, `_halo`, `_fill`) atomair; metro-per-lijn-reset en
ongededuplicieerde `feat_`-labels gerepareerd. Offline bewijs:
`tests/svg-id-uniqueness.mjs` (12 checks, beide engines, beide modi) +
volledige offline suite groen; onafhankelijke reviewer-pass: ACCEPT zonder
defects. Bekende bewuste uitzondering: `lp<N>`-textPath-baseline-defs blijven
een lokale teller (svg-lint-contract), botsingsklasse verwaarloosbaar en
gedocumenteerd.

**Route:** O bepaalt namespace; E1 implementeert; onafhankelijke reviewer
controleert selectors/editorcontract. **Maintenance-overlap:** dit vervult
ME-06c; vink ME-06c pas af wanneer AF-01 geaccepteerd is.

**Scope:** alle path-/groep-/label-ID-generatie in de gedeelde SVG-builders en
de v2-output. Geen labelplaatsing, kleur of geometrie wijzigen.

**Aanpak:** één documentbrede allocator of aantoonbaar equivalente namespace;
laag-/typeprefixen waar zij editorselectie verduidelijken; deterministische
suffixen voor herhaalde namen. IDs mogen niet uitsluitend uit `safeName(name)`
komen en een UID-generator mag niet per metro-/tram-/wegsubgroep resetten.

**Acceptatie:** iedere gegenereerde SVG heeft unieke IDs; dezelfde input geeft
dezelfde IDs; Ghent, Paris, Oulu, Erfurt en Bremerhaven reproduceren geen
auditduplicaten; Nièvre/Tilburg blijven stabiel. Voeg een offline
`svg-id-uniqueness`-regressietest toe die dubbele IDs met context meldt.

**Checks:** gerichte nieuwe test, `pipeline-equivalence`, relevante labeltests,
`node --check script.js` en `node --check engine-v2.js`. Geen live export nodig
vóór offline groen; daarna hooguit één cached Ghent-export als editorbewijs.

**Startbrief voor de eerste Claude-sessie:**

```text
Unit: AF-01
Objective: maak alle uitgegeven SVG-id's documentbreed uniek en deterministisch.
Allowed scope: script.js; engine-v2.js alleen als de ID-doorvoer dat vereist;
  een nieuwe/gerichte test in tests/; CHANGELOG.md; plans/ACTIVE.md.
Do not change: zichtbare geometrie, labels/plaatsing, kleuren, laagvolgorde,
  coverage- of classificatiegedrag; geen exports herschrijven vóór de test groen is.
Acceptance: nul dubbele id's; stabiele id's bij gelijke input; auditgevallen uit
  Ghent/Paris/Oulu/Erfurt/Bremerhaven afgedekt; Nièvre/Tilburg blijven stabiel.
Checks: node tests/svg-id-uniqueness.mjs; node tests/pipeline-equivalence.mjs;
  node --check script.js; node --check engine-v2.js;
  OFFLINE_ONLY=1 bash tests/smoke.sh.
Return: diffsummary, gekozen namespacecontract, checkresultaten en open risico's;
  wijzig roadmapcheckboxen niet zelf buiten de expliciete AF-01/ME-06c-sync.
```

### [ ] AF-02 — Feature- en pleinlabels cartografisch uniek maken

Voer sequentieel uit; elke letter is een afzonderlijke diff.

- [x] **AF-02a — featurededuplicatie.** Dedupliceer named water/parkfeatures op
  genormaliseerde naam plus verbonden/geografische cluster. Houd nuttige, ver
  uit elkaar liggende herhaling mogelijk. Baselines: Ghent
  Nederschelde/Leie/Lieve/Robert Hoozeepark, Erfurt Bergstrom en Bremerhaven
  Geeste. *Af 2026-07-17 (commit `9c52015`): dedup op genormaliseerde naam
  binnen 1000×sf px, grootste kandidaat eerst (waylengte/bbox-oppervlak),
  onderdrukte labels claimen geen gridruimte; regressietest
  `tests/feature-label-dedup.mjs` (10 checks) in smoke.sh.*
- [x] **AF-02b — Squares/Plazas.** Verwijder de synthetische parkhack voor
  voetgangerspleinen. Maak één expliciete Squares/Plazas-groep en voorkom dat
  hetzelfde area nogmaals als straatlabel verschijnt. Baselines: Domplatz,
  Peterstraße, Markthof en Willy-Brandt-Platz. *Af 2026-07-17 (commit
  `cc65317`): eigen `square_labels`-groep "Squares & plazas" direct na
  water_labels (zelfde collision grid + id-allocator), street-labels filteren
  squares; ENGINE-V2.md §2/§7 geamendeerd; regressietest
  `tests/square-labels.mjs` (15 checks) in smoke.sh.*
- [x] **AF-02c — rand en collision.** Hercontroleer de in de audit gevonden
  afgekapt geplaatste labels en echte botsingen tegen de bestaande unified
  collision-/canvas-clippingimplementatie. Repareer alleen reproduceerbare
  restgevallen; geen brede font-/stijlwijziging. *Hercontrole 2026-07-17: geen
  reproduceerbaar restgeval — `tests/svg-lint.mjs` meldt op alle zeven
  audit-exports 0 overlaps en 0 buiten-/geclipte-canvaswaarschuwingen; het
  genoemde Périphérique/Quai d'Ivry-paar ligt gemeten ~180 px uit elkaar; alle
  concrete duplicaatgevallen zijn door AF-02a/b met tests gedekt. Resterende
  visuele drukte herleidt naar rail/metro (AF-05) en paddichtheid (AF-06).
  Geen codewijziging.*

**Route:** E1 per letter; O stelt afstandsdrempel en plaza-editorstructuur vast.

**Acceptatie:** geen nabijgelegen letterlijke duplicaten; ieder plein precies
één logisch label in de juiste laag; geen nieuwe labelbotsingen; nuttige lange-
afstandherhaling blijft bestaan; unieke-ID-test blijft groen.

**Gate:** offline fixtures plus één cached Ghent- of Erfurt-export na AF-02c.
*Status 2026-07-17: offline fixtures groen; de exportgate is in de huidige
remote-omgeving niet uitvoerbaar (netwerkpolicy blokkeert alle
Overpass-endpoints met HTTP 403 via de agent proxy; geprobeerd met één
sequentiële Erfurt-run, geen retry-loop). De visuele bevestiging schuift
expliciet door naar de AF-08-sweep of een sessie met netwerktoegang/lokale
cache. AF-02 blijft daarom als geheel open tot die gate gedraaid is.*

### [ ] AF-03 — Bekende fallbacksemantiek correct binden

Vóór deze unit `ENGINE-V2.md` volledig lezen. Coverage/complement is
acceptatie-invariant, niet een reparatiemiddel achteraf.

- [x] **AF-03a — scrub/heath.** Bind de al gefetchte en door de renderer
  ondersteunde `natural=scrub|heath` aan Landcover/Countryside. Baselines:
  Ghent fallback 20/24 en Nièvre fallback 1. *Af 2026-07-17 (commit
  `abf50bd`): één AREA_FEATURES-rij via de paint-only grass-route (veldtint +
  fallback-void-subtractie, bewust buiten het open-land-signaal — geen
  classificatieflip mogelijk); regressietest `tests/area-binding.mjs`
  (22 checks) in smoke.sh; ENGINE-V2.md §5 bijgewerkt. Visuele bevestiging op
  echte steden volgt in de AF-08-sweep (netwerk hier geblokkeerd).*
- [x] **AF-03b — groen/open land.** Bind `wetland` aan Landcover/Countryside en
  `golf_course`, allotments, dog parks en sports centres aan een passende
  Parks & green-subgroep. Behoud named-green/open-landregels waar nodig om
  stedelijke vlakken niet ongecontroleerd groen te schilderen. *Af 2026-07-17:
  wetland via de paint-only grass-route (veldtint, buiten het
  open-land-signaal); nieuwe categorie 'recreation' → v2-only laag
  `parks_recreation` ("Recreation grounds", preset.park) direct boven named
  parks, samen genest onder één "Parks & green"-parent; recreatiepolygonen
  subtracten per complementregel uit block- én fallback-void maar zitten in
  géén classificatiesignaal; named allotments blijven via de green gate;
  pitch/stadium/unnamed nature_reserve blijven label-only.
  `tests/area-binding.mjs` 50 checks; coverage-lint telt `parks_recreation`
  als verf; ENGINE-V2.md §4/§5/§7 geamendeerd. Gestart als E2-delegatie, door
  O afgemaakt nadat de worker halverwege stilviel; onafhankelijke
  reviewer-pass conform route. Visuele gate → AF-08-sweep (netwerk hier
  geblokkeerd).*
- [x] **AF-03c — bebouwd/verhard/werkland.** Institutional en echte residential
  polygons mogen het city-blocksignaal voeden wanneer de bestaande
  overlapdrempel dat draagt. Parking, railway grounds en industrial blijven
  desgewenst crème, maar krijgen herkenbare semantische subgroepen in plaats
  van `Uncategorized`; industrie wordt niet stilzwijgend tot residential
  gepromoveerd. *Af 2026-07-17: urban-signaal gehesen naar benoemd
  `isUrbanSignalElement`-predicaat en uitgebreid met
  `landuse=institutional|education|religious` (zelfde ≥50%-overlapdrempel,
  zelfde open-land-veto — geen drempel gewijzigd; residential/commercial/
  retail/parking ongewijzigd); industrial + werkland-familie expliciet
  uitgesloten en met tests geborgd. Fallback-patches van bekend
  bebouwd/verhard/werkland groeperen in de editor onder drie semantische
  families — "Working land" (industrial/brownfield/construction/depot/
  landfill/quarry), "Railway grounds" (landuse=railway of railway=*-area) en
  "Paved areas" (parking/garages) — pure paneelorganisatie: verf, geometrie
  en per-patch-labels ongewijzigd. `tests/area-binding.mjs` 50→85 checks;
  ENGINE-V2.md §3/§5/§7 geamendeerd. Door O geïmplementeerd conform het
  vastgelegde O-contract; onafhankelijke reviewer-pass: ACCEPT-WITH-NITS
  (twee verouderde comments, direct verwerkt). Visuele gate → AF-08-sweep
  (netwerk hier geblokkeerd).*

**Route:** AF-03a is E1 na O-contractcheck; AF-03b/c zijn E2 met onafhankelijke
review. O beslist exacte binding en drempels vóór implementatie.

**Acceptatie:** bekende tags staan niet meer als generiek Uncategorized; echte
ongetagde restvlakken blijven fallback; 0.000% bare; geen cream over water; geen
green-dominanceflip in Erfurt/Oulu; paint-order blijft conform contract.

**Gate:** offline face-/coveragefixtures plus cached Ghent, Bremerhaven en Oulu
sequentieel; geen volledige zeven-steden-sweep. *Status 2026-07-17: het
real-worker-deel van de offline fixtures (echte complement-geometrie van de
AF-03b-recreatiesubtractie in de face worker) is in deze sandbox niet
uitvoerbaar — ClipperLib-CDN én Overpass zijn door de netwerkpolicy
geblokkeerd en er is geen warme cache. Expliciet open verificatiepunt,
samen met de cached-exportgate op te pakken in AF-08 of een sessie met
netwerk/cache (`tests/v2-cutterless-worker.mjs` draait daar wél).*

### Reviewfixes 2026-07-17 (post-AF-03c, externe reviewronde)

Vier bevestigde bevindingen op eerder afgeronde units, dezelfde dag verholpen
(zie CHANGELOG "Review fixes"):

1. **AF-01-rest:** structurele ids ("roads", "water", "greenblue_clip", …)
   zaten niet in de uid-allocatornamespace; een straat met zo'n letterlijke
   naam dupliceerde het structurele id. Fix: `RESERVED_SVG_IDS`-seed in
   `makeUidGen`; reserved-name-fixtures in `tests/svg-id-uniqueness.mjs`.
2. **AF-03b-rest:** `renderRecreation` voedde `ctx.areaClipDs` niet, dus
   paden over recreatiegroen kregen geen witte overlay zoals over parken.
   Fix: zelfde push als parks/water; checks in `tests/area-binding.mjs`.
3. **AF-02b-rest:** pleinen met alléén `place=square` (zonder highway-tag)
   werden nooit gefetcht (roads-query vereist highway). Fix: v2-only
   label-only fetchregel + square-scan over roads én labelElements met
   id-dedup; fixtures in `tests/square-labels.mjs`.
4. **AF-02a-rest:** de globale prioriteitssort vergeleek rivierlengte (px)
   met ruwe polygon-bbox-oppervlakte (px²); een klein park kon zo het label
   van een lange rivier verdringen. Fix: polygonen ranken op √oppervlakte
   (px-schaal, vergelijkbaar), input-orde-onafhankelijkheid behouden;
   regressiecheck in `tests/feature-label-dedup.mjs`.

### [ ] AF-04 — Zichtbare landelijke place-labels

**Probleem:** Nièvre haalt place nodes op en gebruikt namen alleen als
`inkscape:label` op hamletblobs. De kaart toont geen bestemming-/gehuchtnaam.

**Route:** O definieert hiërarchie; E1 implementeert labelbuilder en fixtures.

**Ontwerpgrens:** maak een aparte `place_labels`-groep. Prioriteer OSM
place-hiërarchie; hamlet/isolated dwelling mogen zichtbaar zijn, locality alleen
met lagere prioriteit en sterke declutter. Dedupliceer gelijknamige node/blob-
informatie. Geen POI- of landmarkproject in deze unit.

**Acceptatie:** representatieve namen als Franvache, Villars en Les Jardis zijn
bruikbaar zichtbaar zonder 52 localitylabels tegelijk te tonen; labels liggen
binnen het kader, botsen niet met hoofdwegen en zijn editorselecteerbaar met
unieke IDs.

**Gate:** offline placefixture plus één cached Nièvre-export en menselijke crop.
*Status 2026-07-17: offline af. Nieuwe v2-laag "Place names"
(`buildPlaceLabelsLayer`) met tier-subgroepen Villages/Hamlets/Farms &
dwellings/Localities uit dezelfde place_nodes-fetch die hamletblobs grondt;
O-hiërarchie village > hamlet > isolated_dwelling/farm > locality;
locality-declutter via minimale afstand (`PLACE_LOCALITY_SPACING`, 600×sf px)
tot elk ander place-label plus laagste rang; gelijknamige node-duplicaten
dedupen binnen `PLACE_NAME_GAP` (1000×sf px, settlement-tier wint); gedeeld
collision-grid (claimvolgorde water/parks → squares → places → streets) plus
een lokale hoofdwegen-korridorcheck (motorway/trunk/primary/secondary, alleen
place-labels raadplegen die); vaste ankers — geheel binnen het kader of
overgeslagen. Blob-`inkscape:label` blijft editor-only, dus één zichtbare naam
per nederzetting. Fixture `tests/place-labels.mjs` in smoke.sh; ENGINE-V2.md
§2/§7. Door O geïmplementeerd (E1-route; ontwerp was het merendeel van de
unit), onafhankelijke reviewer-pass vóór commit: ACCEPT zonder defects.
Reviewer-aandachtspunten voor de Nièvre-crop (AF-08): (1) locality-selectie
binnen een cluster is id-volgorde, geen prominentiemaat — beoordeel of de
overlevende selectie leesbaar/representatief is; (2) `PLACE_NAME_GAP`
(1000×sf) kan veel voorkomende Franse toponiemen (La Croix, Le Moulin, …)
oversuppresseren wanneer twee échte gehuchten dezelfde naam dragen;
(3) stijl-/afstandsconstanten zijn bewust provisorisch. De cached
Nièvre-export + menselijke crop schuift net als bij AF-02/AF-03 door naar
AF-08/netwerksessie; AF-04 blijft open tot die gate.*

### [ ] AF-05 — Rail- en metro-overbelasting reduceren

- [x] **AF-05a — railontwerp vastleggen.** Read-only spike: meet raildichtheid
  en vergelijk drie begrensde strategieën op Oulu en Paris (servicefilter,
  schaalafhankelijke vereenvoudiging/bundeling, lichtere sleeper/casingstijl).
  O kiest één algemene regel; geen stadsspecifieke uitzonderingen.
  *Af 2026-07-18. Meting op de gecachte Overpass-raillagen (tunnels
  uitgesloten, zoals v2 rendert): Oulu 236 ways/53 km waarvan 89% van de ways
  en 90% van de lengte `service=yard|siding`; Paris 744 ways/137 km waarvan
  61% van de lengte `service=yard|crossover|siding`. Parallelle-dichtheid
  (25m-cellen met ≥4 ways): Oulu 117 (max 20 parallel), Paris 500 (max 22).
  Alleen service-ways weglaten reduceert dat tot Oulu 1 en Paris 153 — de
  Oulu-moiré en de roundhouse-waaier zijn dus vrijwel volledig service-spoor;
  het Paris-restant is het stationsemplacement (tot 19 parallelle
  `usage=main`-sporen), echte hoofdinfrastructuur. **Besluit (O): één
  algemene tweeklassenregel op OSM-semantiek — ways mét `service=*`
  (yard/siding/spur/crossover) verliezen casing én sleepers en renderen als
  één dunne, gedempte track-stroke in een eigen editorsubgroep
  (`rail_service`, geschilderd vóór/onder de main-casings); ways zonder
  `service` behouden de volledige casing+sleepers+track-signatuur
  ongewijzigd.** Volledig verbergen is afgewezen (yards moeten als
  infrastructuur leesbaar blijven), bundeling afgewezen (geometrie-chirurgie
  zonder algemene OSM-regel, hoog risico), alleen-lichtere-stijl afgewezen
  (lost de waaier niet op en degradeert normaal spoor overal). Het zware
  Paris-hoofdsporenbundel blijft bewust staan als principal infrastructure;
  AF-08-sweep herbeoordeelt visueel. Cutter-/coveragegedrag wijzigt niet
  (service-ways blijven gewoon cutter-input). Exacte stijlwaarden (breedte/
  kleur/opacity van de service-stroke) stelt O vast bij AF-05b op de
  fixtures.*
- [x] **AF-05b — railregel implementeren.** E2-implementatie met fixtures voor
  normaal dubbelspoor, yard en roundhouse. Casing-vóór-fills blijft intact.
  *Af 2026-07-18. v2-only conform §9: engine-v2.js splitst railways op
  `service=*`; alleen main-ways gaan door v1's `buildRailLayer` (signatuur en
  labelgrid-stamp ongewijzigd), service-ways renderen als één dunne gedempte
  stroke (1.8×sf, #555555, opacity 0.5 per pad) in een eigen
  `rail_service`-groep ("Service tracks"), gesplitst als eerste kind van de
  raillaag; yard-only frames krijgen een gesynthetiseerde laagwrapper.
  Service-ways stampen het labelgrid bewust niet meer (hairline is
  grondtextuur). `rail_service` in RESERVED_SVG_IDS; v1 bevroren
  (regressiecheck in de fixture). `tests/rail-service.mjs` 20 checks in
  smoke.sh; volledige offline suite groen; ENGINE-V2.md §4/§7 geamendeerd;
  stijlwaarden door O vastgesteld op een before/after-render van de gecachte
  Oulu-raillaag (moiréwand → leesbare waaier, hoofdlijn onaangetast).
  Onafhankelijke reviewer-pass: ACCEPT zonder defects. Cached
  Oulu/Paris-exportgate is na AF-05c cache-only geslaagd: beide exports 9/9
  hits, nul misses/writes/Overpass en volledig groen; Oulu-crop leest als
  dunne yardinfrastructuur naast herkenbaar hoofdspoor, zonder moirémassa.*
- [x] **AF-05c — metroduplicatie en servicegeometrie.** Voorkom dubbele
  relation/member-wayweergave en filter niet-publieksgerichte depot-/service-
  verbindingen met een algemene OSM-regel. Houd lijnsubgroepen en IDs stabiel.
  *Af 2026-07-19. v2 filtert metro-ways met elk `service=*` vóór rendering;
  yard/siding/spur/crossover krijgen dus geen dikke publiekslijn en geen eigen
  technische blob. Onder de overlevende ways bouwt een conservatieve exacte
  name→ref-pass alleen bij precies één ref een shallow copy: Paris' ref-loze
  `name=Métro 5`-fragmenten voegen zo bij de bestaande `metro_5`-groep;
  meervoudige refs blijven bewust gescheiden. Brondata wordt niet gemuteerd,
  bestaande schone output blijft byte-identiek, tunnels blijven conform AF-05d
  zichtbaar en v1 blijft bevroren. De palettoewijzing wordt vóór filtering op
  de originele groepssleutels vastgezet, zodat overlevende publiekslijnen niet
  van kleur verschuiven. `tests/metro-dedup.mjs` (26 checks) in
  smoke.sh; syntax, volledige offline suite (cache-php buiten sandbox wegens
  localhostbinding) groen; ENGINE-V2.md §4/§7; onafhankelijke reviewer-pass:
  ACCEPT zonder defects. De eerste cached Paris-before/after toonde dat
  verwijderde groepen de sequentiële fallbackkleuren opschoven; opgelost met
  de stabiele palettoewijzing hierboven en opnieuw onafhankelijk gereviewd:
  ACCEPT. Focused real-data replay: 167 ways → 63 service-ways weg, één
  naamfragment samengevoegd, 11→7 groepen, nul kleurwijzigingen bij de zeven
  overlevende groepen; visueel verdwijnen de depotblobs. De volledige
  Paris-export stopte later bij `street_labels` op 429/504/timeout; geen Oulu-
  retry onder het toenmalige beleid. Nieuw achtergrondbeleid vulde op
  2026-07-19 in 59m33s 32 van 35 gaps; een tweede begrensde run vulde in 5m10s
  ook Tilburg/roads, Ghent/street_labels en Ghent/area_features. Eind-dry-run:
  63/63 huidige keys bevestigd, nul gaps, volledige corpus gepind. De volledige
  contextgate draaide daarna sequentieel en cache-only voor Paris en Oulu:
  beide 9/9 hits, nul misses/writes/Overpass, nul lintfouten/-waarschuwingen en
  nul significante kale renderdekking. De Paris-crop toont geen technische
  serviceblobs of dubbele memberlijnen; overlevende publiekslijnen blijven
  visueel onderscheiden. Gate `PASS`.*
- [x] **AF-05d — metro-tunnelbesluit.** `NEEDS_COEN`: kies expliciet tussen
  (a) tunnels in de zichtbare Metro-laag behouden maar veel subtieler maken,
  (b) tunnels standaard verbergen en als editorlaag bewaren, of (c) alleen
  relevante route-/stationinformatie tonen. De huidige bewuste tunneluitzondering
  mag niet stilzwijgend als “bugfix” verdwijnen. *Besluit (Coen, 2026-07-23):
  optie (a). Afgerond dezelfde dag: v2 splitst metro-tunnelways na de
  AF-05c-service-/refpas eruit en rendert ze via een nieuwe v2-only functie in
  plaats van v1's `buildMetroLayer` — geen witte casing-halo, één 7×sf
  gestreepte stroke (dash = gangbare transitkaart-conventie voor "ondergronds")
  op opacity 0.4, lijnkleur behouden (niet grijs zoals `rail_service`, want een
  tunnel IS de publiekslijn). Per lijn gegroepeerd als sibling van de bestaande
  `metro_<lijn>`-groep (`metro_<lijn>_tunnel`), teruggespliced in dezelfde
  buitenste Metro-laagwrapper; een frame zonder tunnels blijft byte-identiek
  aan v1. Offline bewijs: nieuwe `tests/metro-tunnel.mjs` (18 checks: gemengde
  lijn met zowel oppervlak- als tunnelsegment, volledig ondergrondse lijn,
  synthese-pad zonder oppervlaktemetro, byte-identiek zonder tunnels,
  determinisme); twee bestaande `tests/metro-dedup.mjs`-checks aangepast aan de
  nieuwe groepsnaam/structuur (waren stilzwijgend achterhaald, niet gebroken).
  Cached Paris-vergelijking (dezelfde crop, cache-only, 10/10 hits, 0.000% bare,
  0 lintfouten) bevestigt het audit-beeld direct: bij Place de Rungis toont de
  vóór-versie metrolijn 6's korte tunnellus als dikke ononderbroken lijn die de
  rotonde/het park volledig overtekent; de ná-versie toont dezelfde lus als
  dunne gestreepte lijn, terwijl het echte verhoogde spoor elders in de crop
  onveranderd dik/vol blijft. ENGINE-V2.md §4/§7 geamendeerd. Door O
  geïmplementeerd; externe ChatGPT-agentreview volgt buiten deze sessie (geen
  Claude-reviewer gespawned, op Coens instructie).*

**Acceptatie:** Oulu/Paris-yards lezen als spoorinfrastructuur en niet als zwarte
moirémassa; een gewoon spoor blijft herkenbaar; metro heeft geen dubbele
memberlijnen of technische serviceblobs; tunnelpresentatie volgt het vastgelegde
Coen-besluit.

**Gate:** fixtures plus cached Oulu/Paris na AF-05b/c; AF-05d kan de sprint als
expliciet `NEEDS_COEN` verlaten zonder andere units te blokkeren.

### [x] AF-06 — Park- en begraafplaatspaden generaliseren

**Route:** O kiest schaalregel op crops; E1 implementeert. Baselines: Oulu
cemetery, Bremerhaven Bürgerpark en Ghent Citadelpark.

**Scope:** pathdetail, opacity/dash/width of aantoonbare schaalfiltering. Geen
parkgeometrie, city-blockkleur of named-greenbeleid wijzigen.

**Acceptatie:** gebiedsvorm en hoofdroute blijven leesbaar; technische hatching
verdwijnt; paden blijven waar ze voor oriëntatie relevant zijn; normale
straten/footways buiten groene gebieden veranderen niet onbedoeld.

**Gate:** gerichte browsercrops op bestaande/cached exports; geen eigen
zeven-stedenrun.

*Afgerond 2026-07-21: de gedeelde wegenrenderer gebruikt nu aparte clips voor
water en groen. Alle kleine paden blijven wit op water; op park-, cemetery- en
recreationgroen blijven alleen cycleways en benoemde paden wit voor oriëntatie.
Naamloze footways, paths en steps worden daar in parkkleur gemaskeerd en buiten
groen niet gewijzigd. `tests/park-paths.mjs` dekt de drie beleidsgevallen;
cache-only v2-herexports en lokale browsercrops van Oulu cemetery, Bremerhaven
Bürgerpark en Ghent Citadelpark bevestigen dat de technische hatching weg is.*

### [ ] AF-07 — Editorstructuur en uitgestelde productkeuzes

- [x] **AF-07a — laagnamen/subgroepen.** Geef tram casing/fill consistente
  `inkscape:label`s; scheid waar zinvol Hamlets/Standalone buildings zonder
  paint-order te veranderen. Alleen structurele/editorwijziging. *Af
  2026-07-19: `tram_casing`/`tram_fill` dragen "Tram casings"/"Tram fills"
  (gedeelde builder, beide engines, conform "Road casings"/"Road fills");
  v2's `renderCityBlocks` groepeert hamletblobs onder "Hamlets"
  (`city_blocks_hamlets`) en losse gebouwen onder "Standalone buildings"
  (`city_blocks_buildings`), urban blocks blijven directe kinderen, een
  afwezige soort krijgt geen lege subgroep; zelfde crème/ids/labels, geen
  paint-orderwijziging (disjuncte grond). Structurele groeps-ids blijven
  letterlijk en zijn via `RESERVED_SVG_IDS` beschermd. Regressietest
  `tests/editor-structure.mjs` (24 checks) in smoke.sh; ENGINE-V2.md §7
  geamendeerd. Door O geïmplementeerd; visuele bevestiging → AF-08-sweep.*
- [x] **AF-07b — technische namen.** Inventariseer de bron van namen als
  `Place FO/13`. Kies conservatief: een algemene bewezen filter of een
  audit/editorwaarschuwing; geen blacklist per stad en geen legitieme OSM-namen
  stil verwijderen. *Afgerond 2026-07-19: inventaris tegen de gepinde
  zeven-stedencache (29.613 benoemde elementen, 140 verdachte) wees uit dat
  alleen de Parijse kadastrale werknamen ("Voie FI/13", "Place FO/13" — mét
  wikidata/`source:name=cadastre`, dus legitiem) plus kale refcodes ("BAD 2")
  gerenderde labels bereiken; al het andere zit in nooit-gelabelde data
  (gebouwnamen, parkeerrefs). Keuze: editorwaarschuwing, geen filter —
  `isTechnicalName` (script.js, gedeeld door street-/feature-/place-labels,
  beide engines) geeft de paneelnaam een "⚠ "-prefix; kaarttekst en
  Illustrator-uitvoer ongewijzigd. `tests/technical-names.mjs` (33 checks) in
  smoke.sh; ENGINE-V2.md §7 geamendeerd. Door O direct geïmplementeerd.*
- [x] **AF-07c — Countryside/Parks & green.** Neem het open CF-03-besluit over.
  O legt met Coen vast of dit één zichtbare editorgroep met twee paintposities
  blijft of werkelijk één renderlaag wordt. Zonder besluit geen implementatie.
  *Besluit 2026-07-23: Coen koos optie (b) — werkelijk één renderlaag met één
  paintpositie, niet enkel een editor-groepering. Implementatie moet dus de
  paint-order (Countryside onderaan vs. Parks & green als block-hole bovenaan),
  de void-/hole-rol en de coverage-belofte herontwerpen, niet alleen labels
  samenvoegen. Implementatie nog te doen.*

  **Implementatie-ontwerp (O, 2026-07-23) — clip-and-move, pixel-identiek.**
  De enige haalbare gemeenschappelijke paintpositie is de parks-band: named
  parks MOETEN boven city blocks blijven (named-green-bovenaan-regel, §4), dus
  Countryside gaat OMHOOG naar die band, niet parks omlaag. Om `landcover` naar
  boven te verplaatsen zonder één zichtbare pixel te veranderen, wordt elk
  landcover-element **geknipt tot zijn zichtbare rest** = element − de opake
  dekkingsunie C, met C = city blocks ∪ named parks ∪ recreation ∪ water bodies
  ∪ **waterway-strokes**. De occlusion-cull (face worker, ENGINE-V2 §5) berekent
  die difference vandaag al per element (`element − covering` op CULL_SCALE=100)
  maar gebruikt hem alleen om volledig verborgen elementen te droppen; de
  wijziging is de geknipte geometrie te BEWAREN als de te schilderen vorm.
  Waterway-strokes zitten NIET in de huidige cull-C en moeten worden toegevoegd:
  in de nieuwe positie schildert Countryside boven de Waterways-laag, dus zonder
  die subtractie zou een beek/rivier door een bos onder de bostint verdwijnen
  (complement-regel §3 — subtracteer de stroke exact zoals hij geverfd wordt,
  `waterwayStrokePaths`, zodat de blauwe lijn doorloopt).

  Omdat Countryside al onzichtbaar was onder blocks, is het eindresultaat
  **rasterisatie-identiek**: acceptatiecriterium is dat de v2-SVG vóór/ná alleen
  in laagstructuur + geknipte landcover-paden verschilt en op een magenta pagina
  0.000% bare blijft. Geen classificatie, geen void/coverage-berekening en geen
  block-hole-rol van named parks/recreation verandert — alleen z-positie +
  clip van de landcover-PAINT.

  Decompositie (elk offline testbaar):
  - **Inc. 1 (geometrie, gedrag-behoudend):** worker geeft per landcover-element
    de geknipte rest (element − C incl. waterways) terug i.p.v. alleen een
    cull-boolean; `renderLandcover` schildert die rest. Nog steeds op de
    bodempositie → pixel-identiek (weggeknipte delen worden toch al door C
    overschilderd). Dit isoleert het geometrie-/complement-risico.
  - **Inc. 2 (verplaatsing, structureel):** `landcover` in `layerOrder` vlak
    vóór `parks` zetten en in `buildSVG` als eerste kind van de bestaande
    `parks_green`-parent nesten (naast "Named parks"/"Recreation grounds").
    Omdat de paint na Inc. 1 disjunct is van C, is de move pixel-identiek.
  - `_mergedRings`-elementen (green-remainder merge): hun gegroeide vorm ligt in
    ONgedekte rest (daarom gegroeid), dus element − C laat hem intact; clip ook
    op merged toepassen of merged bewust overslaan — bewijzen dat er geen gat
    heropent. Grass-rijen (category 'grass') volgen dezelfde behandeling.
  - Checkbox/selectie: `landcover` blijft een eigen child-checkbox onder de
    "Parks & green"-parent (zoals recreation nu al onder parks nest); Sand blijft
    `landcover` erven. Geen selectie-semantiek wijzigen — nog te bevestigen door
    Coen of de checkbox óók moet samensmelten.
  - Docs: ENGINE-V2 §4 (paint-order-lijst + load-bearing relaties), §5 (cull →
    clip) en §7 ("Parks & green"-parent bevat nu Countryside) amenderen;
    CHANGELOG-entry; offline structuurtest uitbreiden.
  - **Gate:** verplichte AF-08-stijl cached render-coverage sweep op de zeven
    steden — 0.000% bare, nul dubbele IDs, geen water/paint-order-regressie.

  **Afgerond 2026-07-23 (lokaal geverifieerd).** Beide increments geïmplementeerd
  in `engine-v2.js`; `tests/real-export.mjs` (eigen post-worker glue) doorlust
  `clippedLandcover`. Belangrijke vondst tijdens verificatie: `_mergedRings`
  (green-remainder grow) mochten NIET worden overgeslagen bij het knippen — de
  gegroeide vorm subtraheert alleen de block-VOID (water/green), niet de
  cream-blocks/standalone buildings, dus op de nieuwe positie overschilderde
  ongeknipte merged-green de gebouwen (zichtbaar in Oulu). Fix: merged-elementen
  worden nu óók tegen de dekkingsunie geknipt en shippen hun geknipte gegroeide
  rings via `greenGroundMerges` (seam behouden). Bewijs: 7-steden cache-only
  v2-sweep allemaal 0.000% bare (10/10 cache-hits, nul Overpass); offline suite
  10/10 PASS incl. nieuwe `editor-structure`-nestchecks en benchmark
  reference-pariteit; before/after raster-diff Tilburg (5249px) 0 diff-blobs ≥
  3×3mm-drempel (alleen 1px-AA-randen), Oulu 4 dunne outline-blobs (<2%
  fill-ratio, geen compacte regio) + visueel bevestigd dat de gebouwen terug
  zijn. ENGINE-V2 §4/§5/§7 + CHANGELOG bijgewerkt. Externe ChatGPT-review volgt.
- [ ] **AF-07d — Parkgrond zichtbaar boven city blocks.** Isoleer de
  selectie- en bindregel voor echte stedelijke parken van de algemene
  countryside/green-laag. Reproduceer met de lokale Tilburg-cache: het
  naamloze `leisure=park` bij Piushaven (`way/138166896`) verdwijnt in v1 door
  de named-green-gate; Cobbenhagenpark bestaat uit samenhangende `forest`,
  `grass` en `scrub`-vlakken die in v2 wel worden getekend maar onder de later
  geschilderde city blocks verdwijnen. Bepaal en implementeer een contract
  waarin expliciet `leisure=park` de block-void snijdt ongeacht `name` of
  `access` (dus ook een privaat landgoed of themapark), en waarin overig
  grondgroen alleen als samenhangend, stedelijk parkcomplex kan doorwerken.
  Geen algemene naamregel, access-filter of minimum-breedte; voorkom losse
  grasconfetti met een aantoonbare cluster-/kaartschaleregel. Leg cached
  Piushaven- en Cobbenhagen-fixtures vast, inclusief een negatieve
  confetti-case, en bewijs de v2 complement-/coverage-invariant en paint order
  opnieuw.

**Acceptatie:** editorlagen hebben consistente namen; technische namen hebben
een reproduceerbaar beleid; CF-03 heeft een vastgelegde keuze of blijft bewust
`DEFERRED_DESIGN` met concrete beslisvraag.

### [ ] AF-08 — Zeven-steden-eindpoort en overdracht

**Route:** E0 genereert/inventariseert sequentieel; O beoordeelt; reviewer doet
onafhankelijke contractcheck. Coen blijft eigenaar van visuele sign-off.

**Aanpak:** draai na alle uitvoerbare units één volledige cached/live-begrensde
sweep voor Bremerhaven, Erfurt, Ghent, Nièvre, Oulu, Paris en Tilburg. Vergelijk
tegen de auditbaseline; actualiseer alleen de newest-per-city exporttrail. Werk
de voortgangsmatrix bij met `FIXED`, `ACCEPTED_STYLE`, `SOURCE_DATA` of een
expliciete beslisstatus.

**Eindpoort:**

- volledige offline suite en syntaxchecks groen;
- alle zeven steden 0.000% bare en nul dubbele SVG-ID's;
- geen regressie in water/paint-order/casing-vóór-fills;
- iedere auditbevinding heeft een expliciete eindstatus en bewijslink;
- `CHANGELOG.md` bevat alle gedragswijzigingen;
- `plans/ACTIVE.md` wijst terug naar maintenance Sprint 3, eerstvolgend ME-06a
  (of het eerst nog open maintenance-item); ME-06c is gesynchroniseerd met
  AF-01;
- geen deploy, push of cutover als bijwerking.
