# AF-08 eindpoort afmaken en maintenance Sprint 3 starten

**Status: READY TO IMPLEMENT (2026-09-13).** Geschreven na een verificatie van
`plans/ACTIVE.md` en de audit-roadmap tegen de code, de tests en de
exporttrail. Dit plan vervangt niets: de audit-roadmap
(`plans/2026-07-17_cartographic-audit-followup.md`) blijft de bron voor scope
en acceptatie van AF-04/AF-07f/AF-08, en de maintenance-roadmap
(`plans/2026-07-14_codebase-maintenance-priorities.md`) voor ME-06/ME-07. Dit
plan zegt alleen, stap voor stap, wat er nog moet gebeuren en hoe je bewijst
dat het klaar is.

## Leesvolgorde voor een nieuwe sessie

1. `AGENTS.md` (volledig).
2. `plans/ACTIVE.md` (kort; wijst naar de actieve unit hieronder).
3. Dit bestand, alleen de actieve unit.
4. Alleen als je `engine-v2.js` gaat wijzigen: `ENGINE-V2.md` volledig.

Lees de twee roadmaps niet opnieuw tenzij een stap hieronder je er expliciet
naartoe stuurt.

## Wat op 2026-09-13 is vastgesteld

Alles hieronder is gecontroleerd, niet overgenomen uit oudere notities.

- `OFFLINE_ONLY=1 bash tests/smoke.sh` eindigt met exit 0 (29 testbestanden;
  alleen de online query-equivalence wordt overgeslagen).
- `engine-v2.js` bevat de groenmassatoets van AF-07f: `GREEN_MASS_MIN_M2` =
  2500 (regel 413), `GREEN_PIECE_MIN_M2` = 80 (419), `GREEN_MASS_BRIDGE_M` = 6
  (426), functies `elementOutlineRings` (433) en `surviveGreenMassGate` (486).
  `GRASS_MIN_PAINT_M2` bestaat niet meer.
- Commit `3e782e6` (2026-08-07 18:59) bracht werk dat in geen roadmap-unit
  staat: verplichte Natural/City blocks/Roads-lagen, 9pt-labelvloer
  (`MIN_LABEL_PT`, `script.js` regel 1428), Arial met Liberation Sans-fallback
  (`STANDARD_FONT_FAMILY`, regel 1882), straatlabels binnen hun eigen
  wegcorridor met veiligheidsmarge, samengevoegde railfragmenten. Dat werk
  staat in `CHANGELOG.md` (2026-08-07) en `ENGINE-V2.md` en de bijbehorende
  tests draaien groen. Het is dus af, alleen niet als unit geadministreerd.
- Dezelfde commit voegde aan `tests/svg-lint.mjs` de regel toe "label leaves
  its street's safety margin". `tests/real-export.mjs` rekent lint-errors mee
  in zijn PASS/FAIL (regels 388-390).
- **De zeven 2026-08-07-exports in `exports/` zijn NIET het bewijs voor die
  code.** Zes ervan zijn om 00:51-01:00 geschreven, achttien uur vóór de
  commit; alleen Bremerhaven (18:55) is met de eindcode gemaakt. Resultaat van
  `node tests/svg-lint.mjs <bestand>` vandaag:

  | stad | lint-errors | dubbele id's |
  |---|---|---|
  | bremerhaven | 0 | 0 |
  | erfurt | 11 | 0 |
  | ghent | 8 | 0 |
  | nievre | 5 | 0 |
  | oulu | 8 | 0 |
  | paris | 4 | 0 |
  | tilburg | 5 | 0 |

  De 2026-07-26-exports geven exact dezelfde aantallen, dus de fouten zitten
  in de oude labelplaatsing die de lintregel juist moest afvangen. Of de
  huidige code de regel haalt is alleen voor Bremerhaven bewezen.
- `tools/pin-cache.sh status`: 77 keys, 49 gepind, 28 niet gepind. Per stad
  ontbreken dezelfde vier keys (`roads`, `paths`, `water_labels`,
  `street_labels`), omdat hun query in `3e782e6` veranderde. In `cache/` staan
  nog maar 3 live entries (Bremerhaven, 2026-08-07, ouder dan de TTL van 7
  dagen). **Een verse zeven-steden-sweep kan daarom niet offline** en gaat
  ongeveer 28 live Overpass-requests kosten.
- Lokale `main` loopt 1 commit achter op `origin/main` (`98f5e60`, de
  dagelijkse prune naar 3 exports per stad). De lokale trail heeft nog 4
  SVG's per stad (07-22, 07-23, 07-26, 08-07).
- Sprint 3 van de maintenance-roadmap is niet gestart. ME-06b staat nog open:
  het patroon `ROAD_DRAW_ORDER.indexOf(a)||50` staat op `script.js` regel
  1612. ME-06a en ME-06d zijn onaangeroerd; ME-06c is via AF-01 gedaan.

## Units, in deze volgorde

Werk één unit per sessie af. Markeer een checkbox pas als de acceptatie
letterlijk gehaald is. Alleen de orchestrator (O) wijzigt checkboxes,
`plans/ACTIVE.md` en de voortgangsmatrix in de audit-roadmap.

### [x] P1 — Werkboom bijwerken (E0, mechanical)

*Gedaan 2026-09-13.*

**Doel:** de lokale checkout gelijk aan `origin/main`, zonder verlies van
lokaal werk.

**Stappen:**

```bash
git status --short
```

Verwacht: alleen `M cache/.ratelimit/rl_...` (een runtime-bestand, laten
staan). Staat er iets anders, stop en meld het.

```bash
git pull --ff-only origin main
```

Verwacht: fast-forward naar `98f5e60` of nieuwer. Lukt de fast-forward niet,
stop en meld het; los het niet zelf op met merge of rebase.

```bash
ls exports/ | grep -c '2026-07-22'
```

Verwacht: `0` (de prune-commit heeft de 07-22-bestanden verwijderd). Zo niet,
meld het; niets zelf verwijderen.

**Acceptatie:** `git status -sb` toont `## main...origin/main` zonder
`[behind ...]`.

**Niet doen:** geen `git push`, geen commits, geen wijzigingen aan `exports/`.

### [~] P2 — Pinned cache verversen (OVERGESLAGEN, Coen 2026-09-13)

*Coen heeft op 2026-09-13 besloten de AF-08-sweep als gedaan te beschouwen.
P2 en P3 worden nu niet uitgevoerd; de tekst blijft staan voor een latere
sweep. Twee feiten voor dan: `tools/pin-cache.sh refresh` haalt ALLE 77 keys
opnieuw op, niet alleen de 28 ontbrekende. Wie alleen de gaten wil vullen
draait eerst `node tools/prefetch-validation-cache.mjs` (haalt alleen wat de
cache niet kan beantwoorden) en daarna `bash tools/pin-cache.sh pin`. Beide
varianten blijven Coens beslissing.*

**Doel:** alle 77 keys van de zeven validatiesteden gepind, zodat P3 offline
en herhaalbaar is.

**Beslispunt voor Coen (verplicht):** `tools/pin-cache.sh refresh` haalt live
Overpass-data op voor de 28 ontbrekende keys. Volgens `AGENTS.md` mag een
agent dat nooit ongevraagd doen. Vraag Coen om één van deze twee zinnen:

- "Draai `tools/pin-cache.sh refresh`." Dan voert de agent uit:

```bash
bash tools/pin-cache.sh refresh
bash tools/pin-cache.sh status | tail -1
```

- "Ik draai de refresh zelf." Dan wacht de agent en controleert daarna alleen
  `status`.

Het script houdt zich zelf aan het rate-limit-beleid uit `AGENTS.md` (één
request tegelijk, 30 s timeout, 10 s cooldown, endpointrotatie, uiterlijk 60
minuten). Een 429 of timeout onderweg is normale achtergrondstatus; stop niet
na één fout. Meld alleen de eindset ontbrekende keys.

**Acceptatie:** de laatste regel van `bash tools/pin-cache.sh status` zegt
`unpinned: 0`.

**Niet doen:** geen `--record`, geen losse `curl`-fetches, geen parallelle
stadsprocessen, geen handmatige bestanden in `cache/pinned/`.

### [~] P3 — Zeven-steden-sweep met de huidige code (OVERGESLAGEN, Coen 2026-09-13)

*Zie P2. De 2026-08-07-exports gelden op Coens besluit als de AF-08-sweep.
De lint-afwijking van zes van de zeven blijft in de matrix vermeld als
`ACCEPTED_STYLE` met de datum van dit besluit, zodat niemand later denkt dat
het bewijs kwijt is.*

**Doel:** zeven verse v2-exports die de AF-08-eindpoort halen.

**Voorwaarden:** P1 en P2 zijn af (nu overgeslagen). De webserver draait:

```bash
lamp status
```

Verwacht: `httpd started`. Zo niet: `lamp start`.

**Stappen, strikt na elkaar, nooit parallel:**

```bash
for city in bremerhaven erfurt ghent nievre oulu paris tilburg; do
  node tests/real-export.mjs "$city" --engine=v2 2>&1 | tee "/tmp/sweep-$city.log" | tail -8
done
```

Per stad moet de log tonen: `render coverage: 0.000% bare pixels`, `0 error(s)`
van de lint, `0 Overpass request(s)` of een gelijkwaardige melding dat alles
uit de cache kwam, en een regel met `PASS`. Schrijf per stad die vier feiten
in een tabel in `plans/ACTIVE.md`.

Controleer daarna dubbele id's:

```bash
for f in exports/map-useit-*-v2-$(date +%F).svg; do
  echo "$f $(grep -o ' id="[^"]*"' "$f" | sort | uniq -d | wc -l | tr -d ' ')"
done
```

Verwacht: overal `0`.

**Als een stad lint-errors geeft** (bijvoorbeeld "label leaves its street's
safety margin"): dat is een echt defect in de labelplaatsing van
`script.js`/`engine-v2.js`, niet in de lint. Stop de sweep, noteer de stad en
de eerste tien foutregels in `plans/ACTIVE.md`, en escaleer naar O. O beslist
of het een E2-fix is of een bewuste allowance. **Nooit** de lintdrempel
versoepelen, nooit `--record` draaien om de fout te laten verdwijnen.

**Als een stad bare pixels geeft:** zelfde procedure. Dit raakt de
coverage-belofte uit `ENGINE-V2.md` §1 en is altijd E2/O-werk.

**Trail bijwerken (pas na zeven keer PASS):** de standing policy is 3 SVG's
per stad. Na deze sweep zijn dat per stad 07-26, 08-07 en vandaag. Verwijder
07-23:

```bash
git rm --quiet exports/map-useit-*-v2-2026-07-23.svg
git add exports/map-useit-*-v2-$(date +%F).svg
git status --short exports/
```

De Bremerhaven-`-illustrator`-variant van 08-07 is een bewuste
referentie; laat die staan.

**Acceptatie:** zeven regels in `plans/ACTIVE.md` met 0.000% bare, 0 lint, 0
dubbele id's, 0 live requests; `exports/` bevat exact 3 gedateerde v2-SVG's
per stad plus de ene illustrator-variant; niets is gecommit (dat is Coens
verzoek, zie P5).

### [x] P4 — Visuele sign-off door Coen (NEEDS_COEN)

*Gedaan 2026-09-13, met twee kanttekeningen uit de PNG-voorbereiding:
(1) de Nièvre-plaat bevat geen enkel plaatsnaamlabel; de oorzaak staat bij
P10 en de AF-04-sign-off is daarom ingetrokken. (2) De Cobbenhagen-crop kon
niet gemaakt worden: die bbox ligt geheel ten westen van de Tilburg-plaat.
AF-07f is afgetekend op Korvel plus de hele plaat.*

**Doel:** de bevindingen die in de voortgangsmatrix op "visuele bevestiging in
AF-08-sweep" of `NEEDS_COEN` staan, krijgen een eindstatus.

**Voorbereiding door de agent (E0):** maak van elke `exports/map-useit-*-v2-2026-08-07.svg` één PNG
op leesbare resolutie en zet die in de scratchpad, niet in de repo.
Gebruik de rasterizer die `tests/real-export.mjs` al gebruikt voor de
coverage-check (zie regel 439 en verder in dat bestand); voeg geen nieuwe
dependency toe. Stuur Coen de zeven PNG's en daarnaast drie crops:

1. Tilburg, Cobbenhagen-campus (`51.55311,5.04277,51.55912,5.06375`): is het
   park zichtbaar als groen (AF-07f)?
2. Tilburg, Korvel rond `way/220614168`: is dat groen zichtbaar en is de rest
   van de wijk rustiger dan op 07-23 (AF-07f)?
3. Nièvre, hele plaat: zijn Franvache, Villars en Les Jardis leesbaar en
   staan er niet tientallen locality-labels (AF-04)?

**Vragen aan Coen, één tegelijk:**

- AF-07f: akkoord met het groen zoals het nu staat? Ja: checkbox AF-07f
  dicht, matrixregels "Parken verdwijnen onder city blocks", "Te veel naamloos
  groen" en "Cobbenhagen" naar `FIXED`. Nee: noteer precies wat hij anders
  wil in `plans/ACTIVE.md` en stop; geen eigen aanpassing.
- AF-04: akkoord met de Nièvre-plaatsnamen? Ja: checkbox AF-04 dicht,
  matrixregel "Zichtbare place-labels ontbreken in Nièvre" naar `FIXED`. Nee:
  zelfde procedure als hierboven. Let op de drie reviewer-aandachtspunten in
  de AF-04-tekst van de audit-roadmap (locality-keuze op id-volgorde,
  `PLACE_NAME_GAP` versus veelvoorkomende Franse namen, provisorische
  constanten).
- Alle matrixregels met "visuele bevestiging in AF-08-sweep" (AF-02a, AF-02b,
  AF-03a/b/c, AF-05a/b, AF-07a): één vraag, "zie je regressies op deze
  zeven platen?" Nee: laat `FIXED` staan en haal de toevoeging "visuele
  bevestiging in AF-08-sweep" weg. Ja: noteer de bevinding, open geen nieuwe
  unit zonder O.

**Acceptatie:** elke regel in de voortgangsmatrix heeft een eindstatus zonder
"wacht op" of "visuele bevestiging"; AF-04 en AF-07f zijn afgevinkt of hebben
een concrete, door Coen geformuleerde restvraag.

### [x] P5 — AF-08 administratief sluiten (O, met E0 voor de mechanische edits)

*Gedaan 2026-09-13 en daarna door O gecorrigeerd: AF-04 terug naar open
(zie P10), de AF-08-statusalinea herschreven. Gecommit als planbestanden.*

**Doel:** de eindpoort uit de audit-roadmap (sectie AF-08, "Eindpoort") is
aantoonbaar gehaald en de overdracht naar Sprint 3 staat op papier.

**Checklist, in de volgorde van de eindpoort:**

- `OFFLINE_ONLY=1 bash tests/smoke.sh` exit 0 en `node --check script.js` en
  `node --check engine-v2.js` zonder output. Datum en resultaat in
  `plans/ACTIVE.md`.
- In `plans/ACTIVE.md` staat de lint-tabel van 2026-09-13 met de zin dat Coen
  de 2026-08-07-exports op 2026-09-13 als sweep heeft geaccepteerd.
- Paint order en casing-vóór-fills: `tests/editor-structure.mjs` en
  `tests/pipeline-equivalence.mjs` zitten in de smoke-run; noteer dat.
- Voortgangsmatrix: geen `NEEDS_COEN` of `OPEN` meer, behalve regels die Coen
  bewust open laat (dan `DEFERRED_DESIGN` met de beslisvraag erbij).
- `CHANGELOG.md`: controleer dat elke gedragswijziging sinds `fe1efad` een
  entry heeft. Controle: `git log --oneline fe1efad..HEAD` naast de
  Unreleased-sectie. Het niet-geadministreerde werk uit `3e782e6` heeft al een
  entry (2026-08-07).
- Zet in de audit-roadmap: checkbox AF-07 en AF-08 dicht, `**Status:**` in
  regel 3 op `COMPLETE (<datum>)`.
- Zet in de maintenance-roadmap regel 3 de status op Sprint 3 gestart.
- Herschrijf `plans/ACTIVE.md`: roadmap = maintenance, sprint = 3, unit =
  ME-06b (zie P6 voor waarom niet ME-06a eerst), next action = P6.

**Commit:** vraag Coen om toestemming voor één commit met de plan-/matrix-
wijzigingen en `plans/ACTIVE.md` (geen exports; de trail staat al in git).
Commitbericht: `chore: close AF-08 on the 2026-08-07 sweep; hand off to Sprint 3`.
Zonder zijn "ja" blijft alles in de werkboom.

**Acceptatie:** alle punten van de eindpoort in de audit-roadmap afgevinkt;
geen deploy, push of cutover gedaan.

### [ ] P10 — AF-04 alsnog laten renderen: place nodes moeten `buildSVG` bereiken (E1, scoped-implementer)

Gaat vóór P6. Dit is een echte, gebruikerszichtbare fout met een vastgesteld
ontwerp, gevonden op 2026-09-13.

**Wat er mis is.** `buildSVG` leest de place nodes uit `results` (regel 3659:
`results.find(r => r.layer.id === placeNodesLayer.id)`) en bouwt daaruit de
laag "Place names" (hook op regel 3742). Maar beide aanroepers gooien die
result weg vóór de aanroep, omdat `place_nodes` in `fetchOnlyIds` zit
(regel 174): `doExportV2` op regel 4005
(`results.filter(r => !fetchOnlyIds.has(r.layer.id) && layerPlan.selectedIds.has(r.layer.id))`)
en `tests/real-export.mjs` op regel 313
(`results.filter(r => !X2.fetchOnlyIds.has(r.layer.id))`). De offline fixture
`tests/place-labels.mjs` geeft `place_nodes` wél rechtstreeks aan `buildSVG`
en slaagt dus, terwijl geen enkele echte export (07-22 tot 08-07) ooit een
plaatsnaam heeft bevat. Gevolg: AF-04 is sinds `72ca037` (2026-07-18)
onzichtbaar geweest.

**Vastgesteld ontwerp (niet heroverwegen):** één geëxporteerde helper in
`engine-v2.js`, bijvoorbeeld `renderableResults(results, layerPlan)`, die de
regel bevat: fetch-only lagen vallen af, behalve `place_nodes`, dat
`buildSVG` nodig heeft voor de plaatsnamenlaag en waarvoor `buildSVG` zelf
al niets tekent (regel 3438 geeft `''` voor fetch-only lagen). `doExportV2`
en `tests/real-export.mjs` gebruiken allebei die helper in plaats van hun
eigen filter. Geen nieuw argument aan `buildSVG`, geen wijziging in de hook.

**Allowed scope:** `engine-v2.js` (de helper, de export ervan in het
publieke object rond regel 4056, en regel 4005), `tests/real-export.mjs`
(regel 313), `tests/place-labels.mjs` (nieuwe sectie), `ENGINE-V2.md` §7
(één alinea), `CHANGELOG.md`.

**Test:** nieuwe sectie in `tests/place-labels.mjs` die een results-array
bouwt mét `buildings`, `area_features` en `place_nodes`, die door de helper
haalt met `X2.planLayers(<default-on ids>)` als layerPlan, en asserteert:
(a) de uitvoer van `buildSVG` bevat `id="place_labels"`, (b) de uitvoer bevat
geen groep voor `buildings` of `area_features`, (c) zonder de helper (het
oude filter nagebootst) ontbreekt `place_labels`; die derde assert
documenteert de regressie.

**Changelog:** bovenaan Unreleased: "Rural place names (villages, hamlets,
farms, localities) now actually appear on v2 exports. The layer existed since
July but the export step dropped its source data before building the SVG,
so no real export ever showed a place name."

**Checks:** `node --check engine-v2.js`, `node tests/place-labels.mjs`,
`OFFLINE_ONLY=1 bash tests/smoke.sh` exit 0, `git diff --check`. De echte
Nièvre-export kan nu niet offline (pinned cache mist keys); dat bewijs
schuift naar de volgende sweep en wordt zo genoteerd in `plans/ACTIVE.md`.

**Do not change:** `buildPlaceLabelsLayer`, de tiers/afstanden van AF-04,
`fetchOnlyIds` zelf, `script.js`.

### [ ] P6 — ME-06b: road sort fallback (E1, scoped-implementer)

*2026-09-13: een P6-sessie is gedraaid maar heeft geen wijziging in de
werkboom achtergelaten (geen `tests/road-order.mjs`, regel 1612 ongewijzigd).
Opnieuw draaien.*

Dit is de tweede Sprint 3-unit omdat hij volledig bepaald is, geen ontwerp
vraagt en een bestaande, bekende bug repareert. ME-06a vraagt eerst een
meting (zie P7).

**Objective:** roadgroepen sorteren exact volgens `ROAD_DRAW_ORDER`, ook het
eerste item.

**Allowed scope:** `script.js`, alleen de sortregel op (nu) regel 1612:

```js
const types=[...byType.keys()].sort((a,b)=>(ROAD_DRAW_ORDER.indexOf(a)||50)-(ROAD_DRAW_ORDER.indexOf(b)||50));
```

Bug: `indexOf` geeft `0` voor het eerste item; `0||50` maakt daar `50` van,
dus het eerste item van `ROAD_DRAW_ORDER` wordt als onbekend gesorteerd.
Vervang beide kanten door een kleine helper die `-1` expliciet afhandelt,
bijvoorbeeld:

```js
const roadOrderRank = (type) => { const i = ROAD_DRAW_ORDER.indexOf(type); return i === -1 ? 50 : i; };
const types=[...byType.keys()].sort((a,b)=>roadOrderRank(a)-roadOrderRank(b));
```

Plus een nieuwe test `tests/road-order.mjs` naar het patroon van
`tests/road-merge.mjs`: bouw een `byType`-map met het eerste item van
`ROAD_DRAW_ORDER`, een middelste item en een onbekend type, en assert dat de
uitvoervolgorde eerst-item, middelste, onbekend is. Voeg de test toe aan
`tests/smoke.sh` en aan de offline-lijst in `AGENTS.md` (sectie Testing).

**Do not change:** `ROAD_DRAW_ORDER` zelf, de twee-passen casing/fill-regel,
alfabetische ordening binnen een klasse, `engine-v2.js`.

**Acceptance:** nieuwe test slaagt; `OFFLINE_ONLY=1 bash tests/smoke.sh` exit
0; `CHANGELOG.md` heeft bovenaan Unreleased een entry van één of twee
regels ("Road classes now follow the configured draw order exactly; the first
class was sorted as unknown"); `git diff --check` schoon.

**Checks:** `node tests/road-order.mjs`, `OFFLINE_ONLY=1 bash tests/smoke.sh`,
`node --check script.js`.

**Return:** diff-samenvatting, testuitvoer, en of de volgorde in een
bestaande export zichtbaar veranderde (vergelijk de groepsvolgorde in
`exports/map-useit-tilburg-v2-<datum>.svg` vóór en na; alleen rapporteren).

Let op `ENGINE-V2.md` §9: `script.js` wordt niet gewijzigd voor v2-features.
Dit is een v1-bugfix die v2 meeneemt, dus toegestaan; zeg dat in de
changelog-entry niet anders.

### [ ] P7 — ME-06a: place-node padding (O meet, dan E1)

*2026-09-13: een P7-sessie is gedraaid maar heeft geen meting of wijziging
achtergelaten. Opnieuw draaien; de meting hoort in het antwoord én in
`plans/ACTIVE.md`.*

**Objective:** de marge waarmee `placeNodesLayer` (`engine-v2.js` regel 156)
place nodes buiten het kader ophaalt, klopt aantoonbaar met wat de
labelplaatsing en de hamlet-grounding nodig hebben.

**Stap 1, meting (O of E0, read-only):** lees `placeNodesLayer` en
`padBboxMeters` (regel 57) en vind de gebruikte marge. Zoek daarna alle
lezers van `place_nodes`: `groundHamletContour` (regel 1196) en
`buildPlaceLabelsLayer` (regel 3287). Noteer welke afstand elke lezer
maximaal buiten het kader kijkt (`settlementRadius`, `localityRadius`,
`PLACE_NAME_GAP`, `PLACE_LOCALITY_SPACING`). De benodigde marge is het maximum
daarvan.

**Stap 2, besluit (O):** is de huidige marge groter of gelijk aan dat
maximum? Dan is ME-06a een documentatiefix: leg de relatie vast in een
why-comment bij `placeNodesLayer` en in `ENGINE-V2.md` §2, en voeg een
fixture toe in `tests/place-labels.mjs` die faalt als iemand de marge onder
het maximum brengt. Is de marge kleiner? Dan de marge verhogen tot dat
maximum, dezelfde comment en fixture, en de cache-keys wijzigen (meld dat
`tools/pin-cache.sh status` daarna keys als unpinned toont; niet
verversen zonder Coen).

**Do not change:** de hiërarchie en declutter-regels van AF-04, `script.js`.

**Acceptance:** fixture slaagt, smoke exit 0, changelog-entry als het gedrag
verandert, `ENGINE-V2.md` genoemd.

### [ ] P8 — ME-06d: te kleine selectie (E1)

**Objective:** na een afgewezen te kleine selectie kan de UI niet met de
vorige bbox doorgaan.

**Startpunt:** `script.js` regel 603, de melding "Selection too small". Lees
de functie eromheen en vind waar de vorige bbox en status bewaard worden.
De fix: bij afwijzing die bewaarde bbox en de exportstatus wissen of
herberekenen, zodat een volgende export-klik niet de oude grenzen gebruikt.

**Test:** `tests/preview-state.mjs` bestaat al; voeg daar een scenario toe:
geldige selectie, dan te kleine selectie, dan assert dat de exportbare bbox
leeg is.

**Do not change:** drempelwaarde `0.001`, `engine-v2.js`.

**Acceptance:** scenario slaagt, smoke exit 0, changelog-entry.

### [ ] P9 — ME-07: regressiedekking (O decomponeert eerst)

Niet in dit plan uitgewerkt. O leest de ME-07-sectie van de
maintenance-roadmap pas na P8 en schrijft dan een eigen, even concreet
plan. Reden: ME-07 vraagt keuzes over welke foutpaden en fixtures de moeite
waard zijn, en dat is geen executorwerk.

## Stopregels die voor elke unit gelden

- Nooit `tools/pin-cache.sh refresh`, `pin`, of een live Overpass-fetch van
  de zeven validatiesteden zonder Coens expliciete zin in het gesprek.
- Nooit `--record`.
- Nooit `git push`, deploy of `git commit` zonder Coens verzoek.
- Bij een usage-limit: stop op een groene of duidelijk falende grens, zet de
  exacte volgende stap in `plans/ACTIVE.md`, laat geen half werk in
  `engine-v2.js` of `script.js` achter.
- Elke gedragswijziging: changelog-entry in dezelfde commit.
