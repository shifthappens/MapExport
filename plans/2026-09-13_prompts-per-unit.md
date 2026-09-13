# Prompts per unit, met minimale modelklasse

Hoort bij `plans/2026-09-13_af08-eindpoort-en-sprint3-start.md`. P2 en P3
zijn overgeslagen (Coen, 2026-09-13). Elke prompt is zelfstandig: plak hem in
een nieuwe sessie in de repo-root. De modelklasse is het laagste niveau dat
de unit betrouwbaar haalt; hoger mag altijd.

| unit | wat | klasse | Claude | Codex |
|---|---|---|---|---|
| P1 | werkboom bijwerken | E0 | Haiku 4.5 | luna, low |
| P4-prep | PNG's en crops voor Coen | E1 | Sonnet 5, medium | terra, medium |
| P5 | AF-08 administratief sluiten | E1 | Sonnet 5, medium | terra, medium |
| P10 | AF-04 fix: place nodes bereiken buildSVG | E1 | Sonnet 5, medium | terra, medium |
| P6 | ME-06b road sort fallback | E1 | Sonnet 5, medium | terra, medium |
| P7 | ME-06a place-node padding | E2 | Sonnet 5, high | terra, high |
| P8 | ME-06d te kleine selectie | E1 | Sonnet 5, medium | terra, medium |

Volgorde na 2026-09-13: P10, dan P6, P7, P8 (P6 en P7 opnieuw: de eerste
sessies lieten niets achter). P4 zelf (het oordeel) is van Coen. P9 (ME-07) krijgt pas een prompt nadat de
orchestrator hem heeft gedecomponeerd.

Waarom deze klassen: P1 is puur commando's met vaste verwachte uitvoer. P4-prep,
P5, P6 en P8 hebben één vaste uitkomst maar vragen het lezen van bestaande
code of het interpreteren van Coens antwoorden. P7 begint met een meting
waarvan de uitkomst bepaalt welke van twee fixes geldt; dat is een
beslissing, dus een hogere klasse.

---

## P1 — werkboom bijwerken (E0: Haiku 4.5 / luna low)

```text
Je werkt in de repository /Users/coen/Sites/mapexport (git, branch main).
Doel: de lokale checkout gelijk maken aan origin/main zonder lokaal werk te
verliezen. Voer exact deze stappen uit, in deze volgorde, en stop bij de
eerste afwijking van de verwachting.

Stap 1:
  git status --short
Er staan lokale, nog niet gecommitte wijzigingen van Coen in de boom
(fonts verplaatst naar "references/MapExport Design System/", index.html,
style.css, README.md, deploy.yml, presentations/, plans/). Die laat je
allemaal staan. Stop alleen, en rapporteer de uitvoer letterlijk, als er
een regel bij staat die begint met "UU", "AA", "DU" of "UD" (conflict), of
als een gewijzigd bestand in exports/ ligt (daar raakt de pull aan).

Stap 2:
  git pull --ff-only origin main
Verwacht: "Fast-forward" of "Already up to date". Bij elke andere uitvoer
(conflict, "Not possible to fast-forward", netwerkfout): stop en rapporteer
de uitvoer letterlijk. Los niets op met merge, rebase of reset.

Stap 3:
  git status -sb | head -1
Verwacht: "## main...origin/main" zonder "[behind" of "[ahead".

Stap 4:
  ls exports/ | grep -c '2026-07-22'
Verwacht: 0. Is het niet 0, rapporteer het getal. Verwijder niets.

Stap 5:
  ls exports/ | grep -c 'v2-2026-08-07.svg'
Verwacht: 7.

Regels: geen git push, geen git commit, geen git stash, geen wijzigingen
aan bestanden, geen deploy. Rapporteer aan het eind de vier uitkomsten
(stap 2 tot 5) in vier regels, en of alles klopte.
```

---

## P4-prep — PNG's en crops voor Coens visuele sign-off (E1: Sonnet 5 medium / terra medium)

```text
Je werkt in /Users/coen/Sites/mapexport. Doel: zeven PNG's en drie crops
maken van de bestaande v2-exports, zodat Coen ze visueel kan beoordelen.
Je wijzigt niets in de repository; alle uitvoer gaat naar een map buiten
de repo: /tmp/mapexport-review-2026-09-13/ (maak die aan).

Bronbestanden, alle zeven verplicht:
  exports/map-useit-bremerhaven-v2-2026-08-07.svg
  exports/map-useit-erfurt-v2-2026-08-07.svg
  exports/map-useit-ghent-v2-2026-08-07.svg
  exports/map-useit-nievre-v2-2026-08-07.svg
  exports/map-useit-oulu-v2-2026-08-07.svg
  exports/map-useit-paris-v2-2026-08-07.svg
  exports/map-useit-tilburg-v2-2026-08-07.svg

Rasterizer: gebruik dezelfde headless Chrome die tests/render-coverage.mjs
vindt (lees daar de functie findChrome, regel 27 en verder, voor de
binaire namen en paden). Gebruik géén nieuwe npm-dependency. Render elke
SVG met bijvoorbeeld:
  "<chrome>" --headless --disable-gpu --hide-scrollbars \
    --window-size=<breedte>,<hoogte> \
    --screenshot=/tmp/mapexport-review-2026-09-13/<stad>.png \
    "file://$PWD/exports/<bestand>.svg"
Neem breedte en hoogte uit de width/height (of viewBox) van de SVG, zodat
de hele plaat op 1:1 pixels staat. Als Chrome de breedte begrenst, halveer
dan breedte en hoogte samen; noteer welke schaal je gebruikte.

Crops, met sips (macOS, aanwezig) of een gelijkwaardige tool:
1. tilburg-cobbenhagen.png: het gebied van de Tilburg-plaat dat overeenkomt
   met de bbox lat 51.55311..51.55912, lon 5.04277..5.06375. Reken de
   pixelpositie uit met de bbox van de export
   (51.545,5.07,51.562,5.1 is zuid,west,noord,oost) en de PNG-afmetingen.
   Let op: die bbox ligt deels buiten de plaat aan de westkant; knip wat er
   wel binnen valt en zeg dat erbij.
2. tilburg-korvel.png: een vierkant van ongeveer 1200x1200 px rond het
   OSM-element way/220614168. Zoek in de SVG naar een path of groep met
   "220614168" in zijn id of inkscape:label om het middelpunt te vinden;
   staat het er niet in, meld dat en sla deze crop over.
3. nievre-full.png: de hele Nièvre-plaat, geen crop nodig, maar maak ook
   een lijst van alle teksten in de groep met de place-name-labels (zoek
   in de SVG naar de groep met inkscape:label "Place names" of naar de
   subgroepen Villages/Hamlets/Farms/Localities) en tel ze per subgroep.

Lever op:
- de tien PNG's in /tmp/mapexport-review-2026-09-13/
- een kort tekstbestand README.txt daar met: gebruikte Chrome-binary,
  schaal per PNG, de drie crops en hun pixelvensters, de telling van de
  Nièvre-labels per subgroep, en of "Franvache", "Villars" en
  "Les Jardis" erin voorkomen.

Regels: niets in de repo wijzigen, geen git-commando's die iets veranderen,
geen netwerk, geen tests/real-export.mjs draaien.
```

---

## P5 — AF-08 administratief sluiten (E1: Sonnet 5 medium / terra medium)

Draai dit pas nadat Coen zijn P4-antwoorden heeft gegeven. Vul de drie
plaatsen met `<...>` in vóór je de prompt plakt.

```text
Je werkt in /Users/coen/Sites/mapexport. Doel: de eindpoort van unit AF-08
uit plans/2026-07-17_cartographic-audit-followup.md administratief afronden
en de overdracht naar maintenance Sprint 3 vastleggen. Lees eerst
AGENTS.md volledig, dan plans/ACTIVE.md, dan in
plans/2026-09-13_af08-eindpoort-en-sprint3-start.md alleen de sectie P5.

Coens besluiten die je verwerkt (letterlijk, niet interpreteren):
- AF-07f (groenmassa): <JA akkoord | NEE, met zijn tekst>
- AF-04 (place-labels Nièvre): <JA akkoord | NEE, met zijn tekst>
- Regressies op de zeven 2026-08-07-platen: <GEEN | zijn tekst>
- Coen heeft op 2026-09-13 de 2026-08-07-exports als de AF-08-sweep
  geaccepteerd, hoewel zes van de zeven de corridor-lintregel van
  tests/svg-lint.mjs niet halen (erfurt 11, ghent 8, oulu 8, nievre 5,
  tilburg 5, paris 4 errors; bremerhaven 0).

Stappen:
1. Draai en noteer de uitkomst (exitcode en laatste regel):
     OFFLINE_ONLY=1 bash tests/smoke.sh
     node --check script.js
     node --check engine-v2.js
   Faalt iets, stop en rapporteer; verander geen code.
2. Voortgangsmatrix in plans/2026-07-17_cartographic-audit-followup.md
   (de tabel onder "## Voortgangsmatrix"):
   - Bij JA op AF-07f: de drie regels "Parken verdwijnen onder city
     blocks", "Te veel naamloos groen" en "Ongetagd stedelijk groencomplex"
     krijgen status FIXED en de toevoeging "visuele sign-off Coen
     <datum>". Bij NEE: status blijft NEEDS_COEN en je zet zijn tekst erbij.
   - Bij JA op AF-04: regel "Zichtbare place-labels ontbreken in Nièvre"
     wordt FIXED met "AF-04, visuele sign-off Coen <datum>". Bij NEE: OPEN
     met zijn tekst.
   - Bij GEEN regressies: haal in alle regels de tekst "; visuele
     bevestiging in AF-08-sweep" weg en zet er "; bevestigd 2026-08-07-sweep"
     voor in de plaats. Anders: laat staan en zet zijn bevinding erbij.
   - Voeg één nieuwe regel toe onderaan de tabel:
     "Corridor-lint op 2026-08-07-exports | ACCEPTED_STYLE | zes van zeven
     exports zijn vóór 3e782e6 gemaakt en falen de lintregel uit die commit;
     Coen accepteert de sweep zonder herexport (2026-09-13)".
3. Checkboxes in hetzelfde bestand: bij JA op beide: "### [ ] AF-04" wordt
   "### [x] AF-04", "- [ ] **AF-07f" wordt "- [x] **AF-07f", "### [ ] AF-07"
   wordt "### [x] AF-07", "### [ ] AF-08" wordt "### [x] AF-08". Bij een
   NEE: laat die checkbox open en ook AF-07/AF-08 open. Zet regel 3
   ("**Status: ACTIVE (2026-07-17).**") alleen op
   "**Status: COMPLETE (<datum>).**" als AF-08 dicht gaat.
4. Changelog-controle: vergelijk
     git log --oneline fe1efad..HEAD
   met de sectie "## Unreleased" in CHANGELOG.md. Elke commit die gedrag
   wijzigt moet een entry hebben. Ontbreekt er een, schrijf hem niet zelf;
   rapporteer de commit-hash.
5. Maintenance-roadmap plans/2026-07-14_codebase-maintenance-priorities.md,
   regel 3: vervang de statuszin door
   "**Status: IN PROGRESS (<datum>) — Sprint 1 en 2 COMPLETE, de
   cartografische tussen-sprint <COMPLETE|nog open op AF-...>, Sprint 3
   gestart met ME-06b.**" en laat de rest van die alinea staan.
6. Herschrijf plans/ACTIVE.md kort (maximaal 40 regels): Updated <datum>;
   Roadmap = maintenance-roadmap; Sprint 3; Unit = P6 (ME-06b) uit
   plans/2026-09-13_af08-eindpoort-en-sprint3-start.md; Next action = de
   prompt P6 uit plans/2026-09-13_prompts-per-unit.md draaien; onder
   "Besloten" de drie Coen-besluiten van hierboven en de bestaande
   standing rules (niet committen/pushen/deployen zonder verzoek,
   changelog verplicht, script.js niet wijzigen voor v2-features, pinned
   cache nooit ongevraagd verversen, palet-splitsing definitief niet).
7. git diff --check moet schoon zijn. Toon git diff --stat.

Regels: geen commit, geen push, geen deploy, geen code wijzigen, geen
exports maken. Rapporteer: de smoke-uitkomst, welke matrixregels en
checkboxes je hebt gewijzigd, ontbrekende changelog-entries (of "geen"),
en de diff-stat.
```

---

## P10 — AF-04 fix: place nodes bereiken buildSVG (E1: Sonnet 5 medium / terra medium)

```text
Je werkt in /Users/coen/Sites/mapexport. Lees eerst AGENTS.md volledig en
daarna ENGINE-V2.md volledig (verplicht vóór elke wijziging aan
engine-v2.js). Lees daarna in
plans/2026-09-13_af08-eindpoort-en-sprint3-start.md alleen de sectie P10.

Unit: P10 (AF-04 alsnog laten renderen).
Objective: de laag "Place names" verschijnt in echte v2-exports, niet alleen
in de offline fixture.

Het defect, met regelnummers van vandaag (controleer ze, ze kunnen iets
verschoven zijn):
- engine-v2.js regel 174: fetchOnlyIds bevat placeNodesLayer.id.
- engine-v2.js regel 3659 (in buildSVG): placeNodeEls wordt uit results
  gelezen met results.find(r => r.layer.id === placeNodesLayer.id).
- engine-v2.js regel 3742: de hook die buildPlaceLabelsLayer aanroept,
  alleen als placeNodeEls.length > 0.
- engine-v2.js regel 4005 (in doExportV2): renderableResults filtert alles
  uit fetchOnlyIds weg, dus ook place_nodes, vóór buildSVG.
- tests/real-export.mjs regel 313: hetzelfde filter, zelfde gevolg.
Resultaat: geen enkele echte export bevat id="place_labels".

Vastgesteld ontwerp, niet heroverwegen:
1. Voeg in engine-v2.js één functie toe, vlak boven doExportV2:
     function renderableResults(results, layerPlan) { ... }
   Regel: laat een result door als (a) zijn layer.id niet in fetchOnlyIds
   zit en in layerPlan.selectedIds zit, OF (b) zijn layer.id gelijk is aan
   placeNodesLayer.id. Zet er een why-comment boven van drie tot vijf
   regels: buildSVG leest place_nodes uit results voor de laag "Place names"
   en tekent voor fetch-only lagen zelf niets (verwijs naar de regel die ''
   teruggeeft voor fetchOnlyIds, nu 3438), dus place_nodes moet als enige
   fetch-only laag mee.
2. Gebruik die functie op regel 4005 in plaats van het inline filter.
3. Exporteer de functie in het publieke object (rond regel 4056, waar
   fetchOnlyIds ook geëxporteerd wordt).
4. Vervang in tests/real-export.mjs regel 313 het inline filter door
   X2.renderableResults(results, X2.planLayers(<dezelfde default-on ids die
   het harnas eerder al gebruikt voor fetchable, zie regel ~198>)).
   Let op: het harnas gebruikt "results" ook voor v1; raak alleen de
   v2-tak aan.
5. Nieuwe sectie onderaan tests/place-labels.mjs, in dezelfde stijl als de
   bestaande secties: bouw een results-array met de bestaande fixture plus
   drie extra entries {layer: X2.buildingsLayer, data:{elements:[]}},
   {layer: X2.areaFeaturesLayer, data:{elements:[]}} en de place_nodes
   entry die de fixture al heeft. Haal die door
   X2.renderableResults(results, X2.planLayers(<default-on ids>)) en
   assert: (a) X2.buildSVG(...) bevat id="place_labels"; (b) de uitvoer
   bevat geen groep met id van buildings of area_features; (c) als je het
   OUDE filter nabootst (alles uit fetchOnlyIds weg), ontbreekt
   id="place_labels". Assert (c) documenteert de regressie.
6. ENGINE-V2.md §7 (editor-facing contract): één alinea bij "Place names"
   die zegt dat place_nodes de enige fetch-only laag is die buildSVG in
   results moet zien, en dat renderableResults dat afdwingt voor app en
   harnas.
7. CHANGELOG.md, bovenaan "## Unreleased", nieuw kopje
   "### <datum> — Rural place names now appear on v2 exports" met deze
   regel: "Villages, hamlets, farms and localities are now labelled on v2
   exports. The layer existed since July, but the export step dropped its
   source data before building the SVG, so no real export ever showed a
   place name."

Do not change: buildPlaceLabelsLayer, PLACE_LABEL_TIERS, PLACE_NAME_GAP,
PLACE_LOCALITY_SPACING, fetchOnlyIds zelf, de hook op regel 3742,
script.js, andere tests.

Checks, alle moeten slagen:
  node --check engine-v2.js
  node tests/place-labels.mjs
  OFFLINE_ONLY=1 bash tests/smoke.sh      (exit 0)
  git diff --check                         (geen uitvoer)
Draai GEEN tests/real-export.mjs: de pinned cache mist keys en dat zou live
Overpass raken. Schrijf in je antwoord dat het echte Nièvre-bewijs naar de
volgende sweep schuift.

Return: git diff --stat; de uitvoer van tests/place-labels.mjs; de nieuwe
functie letterlijk; vragen of risico's (bijvoorbeeld als het harnas op
regel 313 anders in elkaar zit dan hier beschreven: dan stoppen en melden,
niet improviseren).

Regels: geen commit, push, deploy, exports of netwerk. Nooit
tools/pin-cache.sh refresh of pin draaien.
```

---

## P6 — ME-06b road sort fallback (E1: Sonnet 5 medium / terra medium)

```text
Je werkt in /Users/coen/Sites/mapexport. Lees eerst AGENTS.md volledig.

Unit: ME-06b (maintenance Sprint 3).
Objective: roadgroepen sorteren exact volgens ROAD_DRAW_ORDER, ook het
eerste item.

Bug: in script.js staat (nu op regel 1612, zoek op "ROAD_DRAW_ORDER.indexOf"):
  const types=[...byType.keys()].sort((a,b)=>(ROAD_DRAW_ORDER.indexOf(a)||50)-(ROAD_DRAW_ORDER.indexOf(b)||50));
indexOf geeft 0 voor het eerste item van ROAD_DRAW_ORDER; 0||50 maakt daar
50 van, dus dat item wordt als "onbekend" achteraan gesorteerd.

Allowed scope:
- script.js: alleen deze regel, plus één kleine helper er direct boven:
    const roadOrderRank = (type) => { const i = ROAD_DRAW_ORDER.indexOf(type); return i === -1 ? 50 : i; };
    const types=[...byType.keys()].sort((a,b)=>roadOrderRank(a)-roadOrderRank(b));
  Als er elders in script.js of engine-v2.js nog een "indexOf(...)||50"
  op ROAD_DRAW_ORDER staat, meld dat, maar wijzig het niet.
- Nieuw bestand tests/road-order.mjs. Volg de opzet van tests/road-merge.mjs
  (hoe die script.js laadt en assert). De test bouwt een byType-map (of
  roept de functie aan die de sortering doet) met drie typen: het EERSTE
  item van ROAD_DRAW_ORDER, een item uit het midden, en de string
  "zz_unknown". Assert dat de uitvoervolgorde is: eerste item, midden,
  zz_unknown. Voeg een tweede assert toe dat twee onbekende typen hun
  alfabetische volgorde houden als de bestaande code dat al doet;
  anders laat je die weg en zeg je dat.
- tests/smoke.sh: voeg tests/road-order.mjs toe op de plek waar
  tests/road-merge.mjs staat.
- AGENTS.md, sectie "## Testing", eerste bullet: voeg tests/road-order.mjs
  toe aan de opsomming van offline tests.
- CHANGELOG.md: bovenaan "## Unreleased" een nieuw kopje
  "### <datum> — Road classes follow their draw order exactly" met één
  regel: "The first road class in the configured draw order was sorted as
  unknown because of an index-zero fallback bug; it now sorts first, in
  both engines."

Do not change: ROAD_DRAW_ORDER zelf, de twee-passen casing/fill-regel, de
alfabetische ordening binnen een klasse, engine-v2.js, andere tests.

Checks, alle vier moeten slagen:
  node --check script.js
  node tests/road-order.mjs
  OFFLINE_ONLY=1 bash tests/smoke.sh      (exit 0)
  git diff --check                         (geen uitvoer)

Return: git diff --stat; de uitvoer van tests/road-order.mjs; of de
groepsvolgorde in exports/map-useit-tilburg-v2-2026-08-07.svg door deze fix
zou veranderen (kijk welk type het eerste item van ROAD_DRAW_ORDER is en of
dat type in die SVG voorkomt; alleen rapporteren, niet herexporteren);
eventuele vragen of risico's.

Regels: geen commit, geen push, geen deploy, geen exports draaien, geen
netwerk. Als de sorteerfunctie niet los aanroepbaar blijkt vanuit een
test, stop en rapporteer hoe hij wél bereikbaar is in plaats van script.js
verder te herstructureren.
```

---

## P7 — ME-06a place-node padding (E2: Sonnet 5 high / terra high)

```text
Je werkt in /Users/coen/Sites/mapexport. Lees eerst AGENTS.md volledig en
daarna ENGINE-V2.md volledig (verplicht vóór elke wijziging aan
engine-v2.js).

Unit: ME-06a (maintenance Sprint 3).
Objective: de marge waarmee engine-v2.js place nodes buiten het kader
ophaalt is aantoonbaar minstens zo groot als wat de lezers van die data
nodig hebben, en dat verband is vastgelegd in een test.

Fase 1, meting (alleen lezen, niets wijzigen):
- Zoek in engine-v2.js de laag placeNodesLayer (id 'place_nodes', rond
  regel 156) en de helper padBboxMeters (rond regel 57). Noteer welke marge
  in meters de query gebruikt.
- Zoek alle lezers van place_nodes:
  a. groundHamletContour (rond regel 1196): noteer settlementRadius en
     localityRadius en hoe die naar meters vertalen.
  b. buildPlaceLabelsLayer (rond regel 3287): noteer PLACE_NAME_GAP en
     PLACE_LOCALITY_SPACING en hoe die naar meters vertalen (ze staan in
     px maal sf; zoek de px-per-meter-schaal in dezelfde functie of in
     ENGINE-V2.md §2/§7).
  c. Elke andere plek die 'place_nodes' of placeEls leest.
- Bepaal per lezer de grootste afstand buiten het kader waarop een node
  nog de uitkomst kan beïnvloeden. De benodigde marge is het maximum.
- Schrijf een tabel: lezer, constante, waarde, meters, en de conclusie
  "huidige marge X m, benodigd Y m".

Fase 2, alleen als X >= Y (documentatiefix):
- Zet een why-comment boven placeNodesLayer die de tabel in twee of drie
  regels samenvat en zegt dat de marge niet onder Y mag.
- Voeg in tests/place-labels.mjs een assert toe die faalt als de marge
  van placeNodesLayer kleiner wordt dan het maximum van die constanten.
  Bereken het maximum in de test uit de geëxporteerde constanten; als ze
  niet geëxporteerd zijn, exporteer ze op dezelfde manier als de andere
  constanten die tests/place-labels.mjs al leest, en niets meer.
- Voeg in ENGINE-V2.md §2 bij de place-nodes-fetch één zin toe over de
  relatie.
- Geen changelog-entry: gedrag verandert niet.

Fase 2, alleen als X < Y (gedragsfix): STOP na fase 1 en rapporteer de
tabel. Verhoog de marge niet zelf. Reden: een grotere marge verandert de
cache-keys van de zeven validatiesteden en dat is Coens beslissing
(AGENTS.md, sectie over de pinned cache).

Do not change: de hiërarchie- en declutter-regels in buildPlaceLabelsLayer,
script.js, andere tests, de cache-tooling.

Checks bij een documentatiefix:
  node --check engine-v2.js
  node tests/place-labels.mjs
  OFFLINE_ONLY=1 bash tests/smoke.sh      (exit 0)
  bash tools/pin-cache.sh status | tail -1   (moet ongewijzigd "unpinned: 28" tonen; anders heb je een query geraakt: terugdraaien en melden)
  git diff --check

Return: de tabel uit fase 1; welke fase-2-route gold; git diff --stat;
testuitvoer; vragen of risico's.

Regels: geen commit, push, deploy, exports of netwerk. Nooit
tools/pin-cache.sh refresh of pin draaien.
```

---

## P8 — ME-06d te kleine selectie (E1: Sonnet 5 medium / terra medium)

```text
Je werkt in /Users/coen/Sites/mapexport. Lees eerst AGENTS.md volledig.

Unit: ME-06d (maintenance Sprint 3).
Objective: na een afgewezen te kleine kaartselectie kan de UI niet
doorgaan met de bbox of exportstatus van een eerdere, geldige selectie.

Startpunt: script.js, zoek op de string "Selection too small" (nu rond
regel 603). Lees de hele functie eromheen en beantwoord voor jezelf:
- waar wordt de laatst geaccepteerde bbox bewaard (variabele, state-object)?
- waar wordt de export-/previewstatus bewaard die een exportknop vrijgeeft?
- wat gebeurt er met beide bij de afwijzing? (Verwachting: niets, dat is
  de bug.)

Fix, zo klein mogelijk: bij de afwijzing de bewaarde bbox wissen (null of
de lege waarde die de rest van de code al herkent) en de exportstatus op
dezelfde manier terugzetten als bij een nog niet gemaakte selectie. Gebruik
bestaande helpers als die er zijn (zoek naar de functie die de status bij
een verse pagina of een reset zet). Geen nieuwe globale state.

Test: tests/preview-state.mjs bestaat al en laadt script.js; voeg daar een
scenario toe in dezelfde stijl: (1) een geldige selectie leidt tot een
gevulde bbox, (2) daarna een selectie met noord-zuid-verschil kleiner dan
0.001 graden, (3) assert dat de bewaarde bbox leeg is en de exportstatus
niet meer "klaar voor export" is. Als de statusvelden in die test niet
bereikbaar zijn, rapporteer welk minimale export-haakje nodig is en stop;
voeg het niet zelf toe zonder het te melden.

CHANGELOG.md: bovenaan "## Unreleased" een kopje
"### <datum> — A rejected selection no longer keeps the previous area" met
één regel: "Drawing an area that is too small used to leave the earlier
area and its export state in place, so the next export could silently use
old bounds; the rejection now clears both."

Do not change: de drempelwaarde 0.001, engine-v2.js, de foutmelding zelf,
andere tests.

Checks:
  node --check script.js
  node tests/preview-state.mjs
  OFFLINE_ONLY=1 bash tests/smoke.sh      (exit 0)
  git diff --check

Return: git diff --stat, de gewijzigde regels in script.js (kort), de
testuitvoer, vragen of risico's.

Regels: geen commit, push, deploy, exports of netwerk.
```
