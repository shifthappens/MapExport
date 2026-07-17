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
| Herhaalde water-/parklabels | OPEN | AF-02a |
| Pleinen als park én straat | OPEN | AF-02b |
| Afgesneden randlabels/resterende botsingen | OPEN | AF-02c |
| Scrub/heath in fallback | OPEN | AF-03a |
| Golf/allotments/dog park/sports centre/wetland | OPEN | AF-03b |
| Residential/institutional/parking/rail/industrial fallback | OPEN | AF-03c; semantische groep zonder city-blockstijl te herontwerpen |
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
- [ ] **AF-02b — Squares/Plazas.** Verwijder de synthetische parkhack voor
  voetgangerspleinen. Maak één expliciete Squares/Plazas-groep en voorkom dat
  hetzelfde area nogmaals als straatlabel verschijnt. Baselines: Domplatz,
  Peterstraße, Markthof en Willy-Brandt-Platz.
- [ ] **AF-02c — rand en collision.** Hercontroleer de in de audit gevonden
  afgekapt geplaatste labels en echte botsingen tegen de bestaande unified
  collision-/canvas-clippingimplementatie. Repareer alleen reproduceerbare
  restgevallen; geen brede font-/stijlwijziging.

**Route:** E1 per letter; O stelt afstandsdrempel en plaza-editorstructuur vast.

**Acceptatie:** geen nabijgelegen letterlijke duplicaten; ieder plein precies
één logisch label in de juiste laag; geen nieuwe labelbotsingen; nuttige lange-
afstandherhaling blijft bestaan; unieke-ID-test blijft groen.

**Gate:** offline fixtures plus één cached Ghent- of Erfurt-export na AF-02c.

### [ ] AF-03 — Bekende fallbacksemantiek correct binden

Vóór deze unit `ENGINE-V2.md` volledig lezen. Coverage/complement is
acceptatie-invariant, niet een reparatiemiddel achteraf.

- [ ] **AF-03a — scrub/heath.** Bind de al gefetchte en door de renderer
  ondersteunde `natural=scrub|heath` aan Landcover/Countryside. Baselines:
  Ghent fallback 20/24 en Nièvre fallback 1.
- [ ] **AF-03b — groen/open land.** Bind `wetland` aan Landcover/Countryside en
  `golf_course`, allotments, dog parks en sports centres aan een passende
  Parks & green-subgroep. Behoud named-green/open-landregels waar nodig om
  stedelijke vlakken niet ongecontroleerd groen te schilderen.
- [ ] **AF-03c — bebouwd/verhard/werkland.** Institutional en echte residential
  polygons mogen het city-blocksignaal voeden wanneer de bestaande
  overlapdrempel dat draagt. Parking, railway grounds en industrial blijven
  desgewenst crème, maar krijgen herkenbare semantische subgroepen in plaats
  van `Uncategorized`; industrie wordt niet stilzwijgend tot residential
  gepromoveerd.

**Route:** AF-03a is E1 na O-contractcheck; AF-03b/c zijn E2 met onafhankelijke
review. O beslist exacte binding en drempels vóór implementatie.

**Acceptatie:** bekende tags staan niet meer als generiek Uncategorized; echte
ongetagde restvlakken blijven fallback; 0.000% bare; geen cream over water; geen
green-dominanceflip in Erfurt/Oulu; paint-order blijft conform contract.

**Gate:** offline face-/coveragefixtures plus cached Ghent, Bremerhaven en Oulu
sequentieel; geen volledige zeven-steden-sweep.

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
