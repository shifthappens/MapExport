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
4. **Geen retry-loop.** Bij HTTP 429, `Retry-After`, timeout of endpointuitval:
   stop na het bestaande begrensde fetchcontract, noteer stad/taak en fout in
   `ACTIVE.md`, en hervat later. Een ongewijzigde live fout is geen reden om in
   dezelfde sessie de volledige matrix opnieuw te draaien.
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
| Overdominante rail yards/roundhouse | OPEN | AF-05a–b |
| Metro member/service-duplicatie | OPEN | AF-05c |
| Ondergrondse metro als zichtbare overlay | NEEDS_COEN | AF-05d beslisgate; huidige keuze is bewust in de engine |
| Te dichte park-/cemeterypaden | OPEN | AF-06 |
| Tram-/city-blocksubgroepen en labels | OPEN | AF-07a |
| Technische OSM-namen zoals `Place FO/13` | OPEN | AF-07b; conservatieve filter/editorwaarschuwing |
| Countryside versus Parks & green | DEFERRED_DESIGN | Oud CF-03; AF-07c levert alleen beslissing, geen naïeve merge |

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

- [ ] **AF-05a — railontwerp vastleggen.** Read-only spike: meet raildichtheid
  en vergelijk drie begrensde strategieën op Oulu en Paris (servicefilter,
  schaalafhankelijke vereenvoudiging/bundeling, lichtere sleeper/casingstijl).
  O kiest één algemene regel; geen stadsspecifieke uitzonderingen.
- [ ] **AF-05b — railregel implementeren.** E2-implementatie met fixtures voor
  normaal dubbelspoor, yard en roundhouse. Casing-vóór-fills blijft intact.
- [ ] **AF-05c — metroduplicatie en servicegeometrie.** Voorkom dubbele
  relation/member-wayweergave en filter niet-publieksgerichte depot-/service-
  verbindingen met een algemene OSM-regel. Houd lijnsubgroepen en IDs stabiel.
- [ ] **AF-05d — metro-tunnelbesluit.** `NEEDS_COEN`: kies expliciet tussen
  (a) tunnels in de zichtbare Metro-laag behouden maar veel subtieler maken,
  (b) tunnels standaard verbergen en als editorlaag bewaren, of (c) alleen
  relevante route-/stationinformatie tonen. De huidige bewuste tunneluitzondering
  mag niet stilzwijgend als “bugfix” verdwijnen.

**Acceptatie:** Oulu/Paris-yards lezen als spoorinfrastructuur en niet als zwarte
moirémassa; een gewoon spoor blijft herkenbaar; metro heeft geen dubbele
memberlijnen of technische serviceblobs; tunnelpresentatie volgt het vastgelegde
Coen-besluit.

**Gate:** fixtures plus cached Oulu/Paris na AF-05b/c; AF-05d kan de sprint als
expliciet `NEEDS_COEN` verlaten zonder andere units te blokkeren.

### [ ] AF-06 — Park- en begraafplaatspaden generaliseren

**Route:** O kiest schaalregel op crops; E1 implementeert. Baselines: Oulu
cemetery, Bremerhaven Bürgerpark en Ghent Citadelpark.

**Scope:** pathdetail, opacity/dash/width of aantoonbare schaalfiltering. Geen
parkgeometrie, city-blockkleur of named-greenbeleid wijzigen.

**Acceptatie:** gebiedsvorm en hoofdroute blijven leesbaar; technische hatching
verdwijnt; paden blijven waar ze voor oriëntatie relevant zijn; normale
straten/footways buiten groene gebieden veranderen niet onbedoeld.

**Gate:** gerichte browsercrops op bestaande/cached exports; geen eigen
zeven-stedenrun.

### [ ] AF-07 — Editorstructuur en uitgestelde productkeuzes

- [ ] **AF-07a — laagnamen/subgroepen.** Geef tram casing/fill consistente
  `inkscape:label`s; scheid waar zinvol Hamlets/Standalone buildings zonder
  paint-order te veranderen. Alleen structurele/editorwijziging.
- [ ] **AF-07b — technische namen.** Inventariseer de bron van namen als
  `Place FO/13`. Kies conservatief: een algemene bewezen filter of een
  audit/editorwaarschuwing; geen blacklist per stad en geen legitieme OSM-namen
  stil verwijderen.
- [ ] **AF-07c — Countryside/Parks & green.** Neem het open CF-03-besluit over.
  O legt met Coen vast of dit één zichtbare editorgroep met twee paintposities
  blijft of werkelijk één renderlaag wordt. Zonder besluit geen implementatie.

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
