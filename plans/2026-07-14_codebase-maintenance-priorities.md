# Roadmap: maintenance sprints

**Status: READY TO IMPLEMENT (2026-07-14).** Geprioriteerde technische
maintenance-roadmap op basis van een volledige review van de huidige codebase,
documentatie, tests en bestaande plannen. Dit plan voegt geen features toe:
het maakt bestaand gedrag betrouwbaarder, beter testbaar en eenvoudiger te
onderhouden.

**Actuele voortgang en eerstvolgende handeling:** `plans/ACTIVE.md`. Dit
roadmapbestand bewaart scope en Definition of Done; `ACTIVE.md` bewaart alleen
het kleine, vervangbare hervatcheckpoint.

## Doel en context voor een nieuwe uitvoerder

Dit document is bewust self-contained en modelonafhankelijk geschreven. Een
nieuwe AI-assistent of menselijke ontwikkelaar hoeft de analyse waaruit dit
plan ontstond niet te kennen. MapExport is een browsertool die OpenStreetMap-
data omzet in gelaagde, drukklare SVG-stadskaarten voor USE-IT. De app gebruikt
plain JavaScript, HTML, CSS en een kleine PHP-cache; lokaal is er **geen
buildstap**.

De twee renderengines bestaan naast elkaar:

- `script.js` bevat de productie-engine v1, gedeelde UI/infrastructuur en is
  canoniek. `index.html` laadt bronbestanden direct.
- `engine-v2.js` bevat de experimentele v2-engine. De bindende geometrische
  invarianten staan in `ENGINE-V2.md`; lees die altijd volledig vóór een
  wijziging aan v2.
- `cache.php` is de server-side responsecache voor Overpass-data.
- `tests/` bevat losse Node-tests en de headless echte-exporttest.
- `script.min.js` en `style.min.css` zijn gegenereerd en gitignored: nooit
  lezen als bron, handmatig aanpassen of committen.

Dit plan is een reeks opeenvolgende sprints, geen opdracht om alles in één
sessie te veranderen. Pak standaard de actieve sprint en daarbinnen de eerste
niet-afgevinkte taak waarvan de afhankelijkheden klaar zijn. Rond die taak
volledig af en draag haar controleerbaar over voordat een volgende taak begint.
Start een volgende sprint pas als de eindpoort van de vorige sprint gehaald of
expliciet door Coen overgeslagen is.

## Verplicht startprotocol voor iedere taak

Lees bij een nieuwe sessie eerst `plans/ACTIVE.md`. Als de gebruiker alleen
“continue”, “resume” of “ga door” zegt, geldt de daar genoemde `Next action`
als opdracht om het actieve werk binnen de bestaande scope voort te zetten.

1. Lees `AGENTS.md`, `README.md`, `CHANGELOG.md` en de volledige sectie van
   deze taak. Lees ook `ENGINE-V2.md` vóór iedere wijziging aan
   `engine-v2.js` en het genoemde bestaande plan als een taak daarnaar
   verwijst.
2. Draai `git status --short`. Bestaande wijzigingen en untracked bestanden
   zijn van de gebruiker: niet verwijderen, overschrijven, formatteren of
   meenemen zonder dat ze bij de taak horen.
3. Controleer het beschreven probleem opnieuw in de actuele code. Functienamen
   en zoektermen hieronder zijn startpunten, geen toestemming om blind op
   verouderde regelnummers te patchen. Als de oorzaak al weg is, documenteer
   het bewijs en pas het plan aan in plaats van dubbel gedrag toe te voegen.
4. Beperk de diff tot één taak-id. Geen opportunistische features, visuele
   redesigns, frameworkmigratie of brede formatting. Houd het werk
   commit-ready, maar maak alleen een commit als de gebruiker dat vraagt.
5. Voeg bij iedere verandering van appgedrag bovenaan `Unreleased` in
   `CHANGELOG.md` een korte gebruikersgerichte entry toe. Volg de uitzondering
   voor puur interne churn uit `AGENTS.md`.
6. Draai de taak-specifieke controles en daarna de relevante bestaande offline
   tests. Tests gebruiken bronbestanden direct; minify niets.
7. Trigger nooit een deploy, `git push` of v2-cutover zonder een afzonderlijk,
   expliciet verzoek van de gebruiker.

## Werken binnen sessielimieten

Een usage limit is een handoffmoment, geen inhoudelijke blokkade. De voorkeur
is één volledige taak of letter-subtaak per sessie. Als dat niet past, laat de
werkboom op een logisch checkpoint achter en maak hervatten mechanisch.

`plans/ACTIVE.md` is daarvoor de enige lopende statuskaart. Houd uitsluitend
deze velden actueel: sprint, unit, owner/route, voltooid checkpoint,
eerstvolgende concrete handeling, gewijzigde bestanden, laatst gedraaide checks
en beslissingen/blockers. Overschrijf de velden; voeg geen chronologisch
logboek, samenvatting van reeds leesbare code, tokenverbruik of handmatig
voortgangspercentage toe. De code en tests bewijzen *wat* er bestaat; het
checkpoint legt alleen vast wat nog niet veilig uit de werkboom valt af te
leiden.

Gebruik voor een unit één van vijf statussen: `READY`, `IN_PROGRESS`,
`VERIFYING`, `WAITING_FOR_USER` of `DONE`. Een sessie- of usage limit is nooit
`WAITING_FOR_USER`. Werk `ACTIVE.md` alleen bij:

1. bij het daadwerkelijk starten van een nieuwe unit;
2. na een materieel checkpoint dat een zinvolle nieuwe `Next action` oplevert;
3. vlak vóór overdracht of een naderende sessielimiet;
4. na voltooiing, tegelijk met de relevante roadmapcheckbox.

Laat bij voorkeur syntaxgeldige code en gerichte tests achter. Als dat door de
limiet niet haalbaar is, benoem exact welke functie of test nog incompleet is
en claim geen groene checks. Een volgende sessie doet bij “ga door” alleen:

1. `AGENTS.md` en `plans/ACTIVE.md` lezen;
2. `git status --short` en de relevante diff inspecteren;
3. het checkpoint toetsen aan code/tests;
4. de genoemde `Next action` uitvoeren.

Daarvoor is geen nieuwe analyse van de hele repository of uitgebreide
voortgangsrapportage nodig.

### Aanbevolen sessie-eenheden en routing

Deze units zijn hervatpunten, geen extra scope. Noteer de actieve unit in
`ACTIVE.md`; voeg alleen een roadmapcheckbox toe als het plan die al heeft. De
rollen verwijzen naar de capability tiers in `AGENTS.md`: O orchestreert, E0 is
mechanisch, E1 voert afgebakende implementatie uit en E2 behandelt specialistisch
risico. Het is een standaardroute, geen hard-coded modelkeuze.

| Taak | Voorkeursunits per sessie | Goedkoopste standaardroute |
|---|---|---|
| ME-01 | `ME-01a` foutcontract + falende tests; `ME-01b` fetch/workerintegratie; `ME-01c` UI-lifecycle + volledige verificatie | O ontwerpt; E1 doet 01a/01c; E2 doet 01b; O reviewt |
| ME-02 | `ME-02a` gescheiden state + racebeveiliging; `ME-02b` engine-aware preview + UI/tests | O bepaalt statecontract; E2 doet 02a; E1 doet 02b; O reviewt |
| ME-03 | Eén unit | O bevestigt invariant; E2 implementeert geometryfix; O reviewt |
| ME-04 | `ME-04a` validatie/limieten; `ME-04b` atomische writes; `ME-04c` authorisatie/cleanup + verificatie | E1 doet 04a/04b; O beslist authorisatie; E2 doet 04c; O reviewt |
| ME-05 | `ME-05a` gedeeld fetchcontract + mocks; `ME-05b` v1/v2-wiring + diagnostiek | O ontwerpt contract; E2 doet 05a; E1 doet 05b; O reviewt |
| ME-06 | Iedere bestaande letter-subtaak (`ME-06a`–`ME-06d`) is één unit | E1 voor 06a/06c/06d; E0 voor exact gespecificeerde 06b; O reviewt |
| ME-07 | `ME-07a` smoke-runner + foutpaden; `ME-07b` scenariofixtures + invarianten | E1 doet harness/invarianttests; E0 verzamelt fixtures en draait matrices; O reviewt |
| ME-08 | `ME-08a` exports/geautomatiseerde vergelijking; `ME-08b` menselijke review + besluit | E0 genereert exports; E1 automatiseert vergelijking; O analyseert; Coen beslist |
| ME-09 | Iedere bestaande letter-subtaak (`ME-09a`–`ME-09e`) is één unit | O ontwerpt iedere grens; E2 implementeert; O reviewt per unit |
| ME-10 | Iedere bestaande letter-subtaak (`ME-10a`–`ME-10d`) is één unit | E2 voor 10a; O+E1 voor 10b; E0 voor 10c/10d; O reviewt |
| ME-11 | Eén unit | E0 voert uit; O controleert consistentie |
| ME-12 | Eén unit, tenzij een menselijke bestandskeuze `WAITING_FOR_USER` vereist | E0 inventariseert; O vraagt/beslist met Coen; E0 voert keuze uit |

### Lichtgewicht delegatiecyclus

1. O maakt alleen de noodzakelijke ontwerpbeslissing en kiest de laagste
   adequate tier uit de tabel, aangepast aan de werkelijk beschikbare agents.
2. O zet unit, route en één concrete `Next action` in `ACTIVE.md` en geeft de
   worker het korte brief-template uit `AGENTS.md`; niet de hele repository-
   geschiedenis.
3. De worker voert uitsluitend de toegestane scope uit en retourneert diff-
   samenvatting, checks en onzekerheden. Bij een ontwerpvraag stopt de worker
   en legt opties/evidence terug bij O.
4. O inspecteert diff en testbewijs, neemt resterende beslissingen en accepteert,
   laat gericht herstellen of escaleert naar een hogere tier.
5. Alleen O werkt normaal de roadmapcheckbox en `ACTIVE.md` bij.

Delegeer niet om het delegeren: als briefing plus review waarschijnlijk meer
kost dan een kleine E0-handeling direct uitvoeren, mag O die handeling zelf
doen. Optimaliseer voor de laagste totale kosten bij voldoende kwaliteit, niet
voor het hoogste aantal agentcalls.

## Definitie van klaar en overdrachtsformaat

Een checkbox mag pas van `[ ]` naar `[x]` als:

- alle acceptatiecriteria van de taak aantoonbaar gehaald zijn;
- relevante nieuwe regressietests bestaan en alle relevante tests groen zijn;
- de changelogregel is gevolgd;
- er geen onbedoelde bestanden zijn gewijzigd;
- open beslissingen, niet-uitgevoerde live/visuele checks en restrisico's
  expliciet zijn gemeld.

Gebruik bij overdracht, ongeacht model of ontwikkelaar, deze vijf regels:

```text
Taak: ME-XX — <naam>
Resultaat: <wat is nu aantoonbaar anders/beter>
Gewijzigd: <bestanden en belangrijke functies>
Gecontroleerd: <exacte commando's + uitkomst; noem niet-gedraaide checks>
Open: <beslissingen, risico's of "niets">
```

Bij een normale sessieoverdracht volstaat het bijwerken van `ACTIVE.md` plus
een korte gebruikersmelding; kopieer dit vijfregelige eindverslag pas wanneer
een volledige taak of sprint echt wordt afgerond.

## Baselinecontroles

Gebruik minimaal de controles die passen bij de gewijzigde bestanden. Noteer
in de overdracht exact wat werkelijk is gedraaid; claim nooit een live of
visuele controle op basis van alleen een offline test.

### Offline regressies

```sh
node tests/road-merge.mjs
node tests/abbreviate.mjs
node tests/supersession.mjs
node tests/pipeline-equivalence.mjs
node tests/sea-sign.mjs
node tests/hamlet-grounding.mjs
node tests/v2-cutterless-coverage.mjs
```

### Syntax en statische basiscontrole

```sh
node --check script.js
node --check engine-v2.js
php -l cache.php
bash -n .githooks/pre-commit
bash -n tools/minify.sh
```

Niet ieder commando hoeft na een uitsluitend documentatiewijziging te draaien.
Bij gedrag dat de exportpipeline raakt, is de volledige offline set wel de
standaard. Voeg nieuwe tests aan deze lijst of aan een toekomstige centrale
smoke-runner toe wanneer ME-07 dat invoert.

### Live/headless export

`node tests/real-export.mjs` draait de echte broncode en schrijft een SVG naar
`exports/`. Daarvoor moet de repository op `/mapexport/` via poort 8080 met PHP
worden geserveerd (`lamp start` op Coens machine, anders bijvoorbeeld `php -S`)
en kan live Overpass worden geraakt. Draai dit alleen wanneer de taak het nodig
heeft en de omgeving ervoor klaarstaat. Behandel de nieuwe export als
gebruikersbestand: niet automatisch verwijderen of committen.

## Hoe de schattingen te lezen

- **Complexiteit** gaat over technische moeilijkheid, aantal betrokken
  subsystemen en regressierisico; niet alleen over het aantal regels code.
- **Tokenkosten** zijn een modelonafhankelijke, grove bandbreedte voor totale
  context plus uitvoer tijdens code-inspectie, implementatie, tests en review.
  Modellen rekenen context en caching verschillend af: gebruik de schatting om
  taken relatief te vergelijken, niet als offerte. Visuele validatie en live
  Overpass-wachttijd tellen niet mee. Een frisse sessie of onverwachte
  regressies kunnen de bovengrens verhogen.
- **Impact** beschrijft het effect op de bestaande app als de taak klaar is.
  `Kritiek` betekent dat stil dataverlies, een misleidend resultaat of een
  publiek aanvalsoppervlak wordt weggenomen; het betekent niet automatisch
  dat de app nu onbruikbaar is.
- Behandel iedere taak als een eigen review- en commit-eenheid; combineer geen
  taak-id's in één diff. Commit alleen op verzoek. Bij iedere wijziging aan
  gedrag moet bovenaan `Unreleased` in `CHANGELOG.md` een korte,
  gebruikersgerichte entry komen.

## Sprintroadmap in één oogopslag

| Sprint | Sprint Goal | Taken | Tokenkosten | Primaire impact |
|---|---|---|---:|---|
| 1 — Betrouwbaar exportcontract | Een export is volledig en actueel, of faalt zichtbaar | ME-01–ME-03 | 46k–80k | Kritiek — vertrouwen in ieder exportresultaat |
| 2 — Robuuste data-infrastructuur | Cache en Overpass-uitval zijn begrensd en voorspelbaar | ME-04–ME-05 | 33k–60k | Kritiek — beschikbaarheid en cache-integriteit |
| 3 — Correctheid aantoonbaar maken | Bekende datarandgevallen zijn gerepareerd en offline bewezen | ME-06–ME-07 | 34k–62k | Hoog — minder regressies en ontbrekende kaartdata |
| 4 — v2-beslismoment | Er ligt voldoende bewijs voor een menselijk go/no-go-besluit | ME-08 | 20k–45k | Hoog — duidelijkheid over productiegeschiktheid v2 |
| 5 — Onderhoudbare architectuur | De monoliet is gedrag-neutraal langs bewezen grenzen opgeknipt | ME-09 | 40k–70k | Middel/hoog — lagere wijzigings- en regressiekosten |
| 6 — Product- en projectpolish | SVG-randgevallen, docs en werkboom zijn consequent afgewerkt | ME-10–ME-12 | 25k–52k | Middel — consistente output en een schone basis |

De sprintnummers drukken volgorde uit, geen kalenderperiode. Plan pas echte
start- en einddatums nadat de velocity van het mens/modelteam bekend is. De
volgorde is bewust: eerst voorkomen dat de app een fout resultaat als succes
presenteert, daarna infrastructuur en aantoonbare correctheid, vervolgens het
v2-besluit en pas daarna de grote structurele refactor.

## Sprint 1 — Betrouwbaar exportcontract

**Status:** COMPLETE

```text
Sprint review — 2026-07-14
Uitkomst Sprint Goal: gehaald
Afgerond: ME-01, ME-02, ME-03 (+ ME-03b coverage-lint-fix)
Niet afgerond: geen
Gecontroleerd: volledige offline suite + syntaxchecks groen; zeven-area
  v2-sweep 0.000% bare / 0 significante lint-gaps; Coen heeft de exports
  visueel bekeken en de coverage/hoeveelheid-groen goedgekeurd (Gera-island
  "perfecte mix").
Besluiten: de visuele review leverde cartografische feedback op die BUITEN de
  "geen features"-charter van deze roadmap valt (sand-naamgeving, groen
  ontrommelen, countryside/parks samenvoegen). Die staat als apart, actief plan
  in `plans/2026-07-14_v2-cartografische-feedback.md` (CF-01/CF-02 uitvoerbaar,
  CF-03 backlog met ontwerpbesluit). De maintenance-roadmap gaat verder bij
  Sprint 2 (ME-04) zodra dat cartografische werk of Coen dat vrijgeeft.
```

**Sprint Goal:** gebruikers en vervolgstappen kunnen erop vertrouwen dat een
export volledig, actueel en afkomstig van de gekozen engine is; anders stopt
de app zichtbaar met een bruikbare fout.

**Omvang:** 3 taken, 46k–80k tokens, hoge technische samenhang.

**Startvoorwaarde:** geen; dit is de eerste sprint.

**Binnen scope:** exportresultaat/foutsemantiek, preview-versus-downloadstatus
en de bestaande v2-coverage-invariant zonder cutter roads.

**Buiten scope:** algemene Overpass-optimalisatie, cachebeveiliging, nieuwe
kaartlagen, visuele redesigns en v2 als standaardengine instellen.

**Eindpoort:** ME-01, ME-02 en ME-03 zijn afgevinkt; volledige offline suite en
syntaxchecks zijn groen; een gesimuleerde netwerk- én workerfout leveren geen
nieuw downloadbaar SVG op.

### [x] ME-01 — Export expliciet laten slagen of falen

**Complexiteit:** hoog

**Tokenkosten:** 20k–35k

**Impact:** kritiek voor betrouwbaarheid; raakt v1 en v2, zonder beoogde
visuele verandering bij succesvolle exports.

**Afhankelijkheden:** geen. Dit is het eerste implementatiewerk.

**Startpunten:** zoek in `script.js` naar `allOverpassFailed`, `fetchLayer`,
`BLOCK_WORKER_SRC` en `doExport`; in `engine-v2.js` naar `failedTiles`,
`computeFacesAsync`, de workersource en `doExport`.

#### Probleem

- v1 kan bij volledig mislukte Overpass-verzoeken alsnog doorgaan wanneer
  geen afzonderlijke block-fetch nodig lijkt. Het resultaat kan daardoor een
  lege of sterk onvolledige kaart zijn die als geslaagde export oogt.
- v2 telt mislukte tiles, maar gebruikt dat resultaat niet om de export te
  stoppen of duidelijk als partieel te markeren.
- De Clipper-workers lossen fouten op met een lege geometry. Daardoor is
  `geen geometrie` niet te onderscheiden van `berekening mislukt`.
- De exportlevenscyclus heeft geen centraal, afgedwongen resultaatmodel en
  onvoldoende gegarandeerde cleanup via `try/catch/finally`.

#### Aanpak

- Introduceer intern één expliciet resultaatmodel, bijvoorbeeld
  `success`, `partial` en `failed`, met bron/fase en gebruikersgeschikte
  foutmelding.
- Laat fetch-, parse- en workerfouten nooit als een legitieme lege dataset
  terugkomen.
- Bepaal per optionele dataset expliciet of uitval fataal mag zijn; kernlagen
  moeten de export stoppen.
- Centraliseer spinner, button-state, foutmelding en cleanup in een
  `try/catch/finally`-levenscyclus voor beide engines.
- Download of bewaar geen nieuw SVG bij `failed`. Sta `partial` alleen toe als
  die toestand zichtbaar en bewust geaccepteerd is; standaard is fail-closed.

#### Acceptatiecriteria

- Volledige netwerkuitval levert geen SVG en een concrete foutmelding op.
- Een worker-exceptie is zichtbaar als exportfout, niet als lege laag.
- UI-controls herstellen altijd na succes én fout.
- v1 en v2 volgen aantoonbaar dezelfde foutsemantiek.
- Bestaande succesvolle offline regressietests blijven groen; nieuwe tests
  dekken minimaal volledige fetchuitval en workeruitval.

### [x] ME-02 — Preview- en downloadstatus scheiden

**Complexiteit:** hoog

**Tokenkosten:** 18k–30k

**Impact:** hoog; voorkomt dat een vereenvoudigde preview ongemerkt de laatst
gegenereerde download vervangt.

**Afhankelijkheden:** ME-01, zodat preview en export hetzelfde expliciete
resultaatcontract kunnen gebruiken.

**Startpunten:** `lastSvgString`, `lastSvgFilename`, `scheduleLivePreview`,
`buildSVG` en de download-clickhandler in `script.js`; `buildSVG` en `doExport`
in `engine-v2.js`.

#### Probleem

- De live preview maakt een gereduceerde SVG op circa 600 px, kan city blocks
  verwijderen en schrijft daarna dezelfde `lastSvgString` als de echte export.
- De v2-preview gebruikt delen van de v1-SVG-opbouw. Daardoor is niet
  gegarandeerd dat wat wordt bekeken overeenkomt met de gekozen engine.
- Eén gedeelde variabele vertegenwoordigt nu verschillende producten:
  preview, laatste volledige export en downloadbron.

#### Aanpak

- Maak afzonderlijke status voor `previewSvg`, `exportSvg` en metadata zoals
  engine, bbox, opties en generatie-id.
- Laat alleen een volledig geslaagde export de downloadbron vervangen.
- Maak preview-opbouw engine-aware; deel alleen echt engine-onafhankelijke
  SVG-envelop- en presentatiecode.
- Voorkom races: een oudere async preview mag een nieuwere preview of export
  niet overschrijven.
- Zet download-controls uit zolang geen geldige volledige export voor de
  huidige instellingen bestaat, of label duidelijk dat de laatst voltooide
  export wordt gedownload.

#### Acceptatiecriteria

- Een preview-update verandert nooit de bytes van de laatst voltooide export.
- v1- en v2-preview gebruiken hun eigen geometry/layer builder.
- Snel achtereenvolgende invoer kan geen verouderde preview tonen.
- Een mislukte export bewaart de vorige geldige download, met heldere UI-status.

### [x] ME-03 — v2-dekkingsbelofte herstellen zonder wegen

**Complexiteit:** middel

**Tokenkosten:** 8k–15k

**Impact:** hoog voor v2; herstelt de bindende coverage promise uit
`ENGINE-V2.md`.

**Afhankelijkheden:** ME-01 voor expliciete workerfouten; de geometryfix kan
desnoods eerder als geïsoleerde commit, maar mag fouten niet opnieuw fail-open
maken.

**Startpunten:** lees eerst `ENGINE-V2.md`; zoek daarna in `engine-v2.js` naar
`computeFacesAsync`, `cutterResults` en `fallback_blocks`.

#### Probleem

`computeFacesAsync` geeft vroegtijdig een lege lijst terug wanneer er geen
cutter-lijnen zijn, terwijl de worker lege cutters al kan verwerken. Een bbox
zonder block-cutting roads krijgt zo geen gezicht en kan de coverage fallback
niet uitvoeren. Dat is strijdig met de contractuele regel dat ieder punt op
land door een semantische laag of fallback wordt gedekt.

#### Aanpak

- Verwijder de vroegtijdige lege return en laat de bbox door de normale
  Clipper-route lopen.
- Controleer de gevallen: geen wegen, alleen paden, alleen tunnels, en een
  volledig landelijke bbox.
- Houd `minArea` en de countryside-uitzondering ongewijzigd.

#### Acceptatiecriteria

- Een kleine bbox zonder cutter roads produceert één geldig face.
- Onbeschilderd land in zo'n klein face wordt `fallback_blocks`.
- Een groot countryside-face blijft conform contract achtergrond.
- Een gerichte offline regressietest legt deze gevallen vast.

### [x] ME-03b — coverage-lint eert merged landcover (ontdekt in de ME-03 v2-sweep)

**Complexiteit:** laag — test-infrastructuur, geen enginegedrag.

**Impact:** deblokkeert de Sprint 1-eindpoort; de zeven-area v2-sweep faalde
vals-positief.

**Context voor andere agents:** tijdens de verplichte v2-sweep na ME-03 faalde
de geometrische lint (`tests/coverage-lint.mjs`) op Tilburg met 7 significante
"unpainted land"-cellen, terwijl de render-lint (de autoriteit, ENGINE-V2.md §1)
0.000% bare pixels rapporteerde. Bewezen niet door ME-03 veroorzaakt: de
parent-commit gaf identieke gaps.

**Root cause:** een green-remainder merge groeit een landcover-element tot
`element ∪ green-open coverage-remainder` en `renderLandcover` schildert die
grown vorm via `el._mergedRings` (al in projected px). De lint markeerde alleen
de originele elementgeometrie, dus de grown-only band telde niet mee → valse
gaps waar de SVG wél inkt zet. Een complement-regel-slip aan de testkant.

**Fix:** `coverage-lint.mjs` stap 2 markeert `el._mergedRings` (superset van de
eigen geometrie) wanneer aanwezig, exact zoals `renderLandcover` schildert.
Engine ongewijzigd. `expectations.json` behoudt `coverageGaps: 0` — geen
allowance nodig, want de gaps waren nooit echt.

**Acceptatie:** Tilburg v2 gaat van 7 → 0 significante gaps; render blijft
0.000%. De zeven-area sweep is groen zonder nieuwe allowance.

## Sprint 2 — Robuuste data-infrastructuur

**Status:** PLANNED

**Sprint Goal:** geldige exports blijven voorspelbaar functioneren wanneer de
publieke cache of één of meer Overpass-endpoints traag, corrupt of onbereikbaar
zijn, zonder onbeperkt wachten of onbegrensde serverwrites.

**Omvang:** 2 taken, 33k–60k tokens, server- en netwerkgericht.

**Startvoorwaarde:** Sprint 1 is door de eindpoort; ME-05 bouwt voort op het
expliciete foutcontract uit ME-01.

**Binnen scope:** validatie, limieten en atomiciteit van `cache.php`; gedeelde
timeout-, abort-, retry- en failoversemantiek voor bestaande Overpass-queries.

**Buiten scope:** een lokale Overpass-installatie, nieuwe endpoints als
productfeature, query-uitbreidingen, deployment of infrastructuurmigratie.

**Eindpoort:** ME-04 en ME-05 zijn afgevinkt; cachemisbruiktests en gemockte
netwerkfouttests zijn groen; geldige bestaande cache-hits blijven compatibel;
geen test vereist live netwerk.

### [ ] ME-04 — `cache.php` begrenzen en atomair maken

**Complexiteit:** hoog

**Tokenkosten:** 15k–28k

**Impact:** kritiek voor beschikbaarheid en integriteit van de publieke app;
geen verschil voor geldige cache-hits.

**Afhankelijkheden:** geen code-afhankelijkheid; voer bij voorkeur na ME-01–03
uit om de eerste reviewbatch klein te houden.

**Startpunten:** heel `cache.php`, de cache-aanroepen rond `fetchLayer` in
`script.js`, en deploymentbeperkingen in `AGENTS.md` en
`memory/reference_deploy.md`.

#### Probleem

Het publieke cache-endpoint accepteert feitelijk willekeurige writes, valideert
de gzip-payload onvoldoende en schrijft rechtstreeks naar het definitieve pad.
Dat maakt disk-fill, cache poisoning en gedeeltelijke reads tijdens een write
mogelijk.

#### Aanpak

- Leg harde request- en gedecomprimeerde payloadlimieten vast, passend bij
  gemeten echte exports.
- Valideer methode, key-formaat, contenttype/gzip en de verwachte Overpass
  JSON-hoofdstructuur voordat iets wordt opgeslagen.
- Schrijf naar een uniek tijdelijk bestand in dezelfde directory, flush en
  rename atomair naar het definitieve pad.
- Gebruik veilige permissies en voorkom path traversal en symlink-following.
- Kies en documenteer een write-authorisatiemodel. Als browserclients direct
  moeten kunnen vullen, beperk misbruik minimaal cryptografisch of via een
  server-side fetchroute; vertrouw niet alleen op CORS.
- Definieer opruiming: maximale leeftijd en/of maximale totale cacheomvang.

#### Acceptatiecriteria

- Oversized, corrupte, niet-JSON en ongeldig gecomprimeerde payloads worden
  vóór opslag geweigerd.
- Een lezer ziet altijd het oude of het nieuwe complete bestand, nooit een
  gedeeltelijke write.
- Ongeldige keys kunnen niet buiten `cache/` schrijven.
- Geldige bestaande cache-hits en misses blijven compatibel.
- PHP-syntaxcheck en gerichte requesttests zijn groen.

#### Beslispunt

Het precieze authorisatiemodel kan deploymentconfiguratie raken en vraagt vóór
implementatie om één menselijke keuze. De validatie-, limiet- en atomiciteits-
maatregelen kunnen onafhankelijk daarvan alvast worden uitgevoerd.

### [ ] ME-05 — Overpass-failover en time-outs eenduidig maken

**Complexiteit:** hoog

**Tokenkosten:** 18k–32k

**Impact:** hoog; voorspelbaardere exports bij trage of falende publieke
endpoints.

**Afhankelijkheden:** ME-01; gebruik het daar ingevoerde resultaat- en
foutcontract in plaats van een tweede foutmodel te maken.

**Startpunten:** `OVERPASS_ENDPOINTS`, `endpointBackoff`, `fetchLayer` en de
endpoint-race rond de Overpass-requests in `script.js`; vergelijk
`tests/lib.mjs`, maar maak testcode niet stilzwijgend productiecanoniek.

#### Probleem

Endpointrotatie, races, retries, browser-time-outs en gedeeltelijke tile-uitval
zijn verspreid over meerdere codepaden. In combinatie met taak 1 is eerst één
duidelijk fetchcontract nodig: welk endpoint antwoordde, welke tiles faalden,
waarom en of een retry veilig is.

#### Aanpak

- Maak één fetch-helper met `AbortController`, harde pogingstime-out,
  endpointrotatie, begrensde backoff en gestructureerde foutinformatie.
- Deel hetzelfde gedrag tussen v1 en v2; laat query-inhoud engine-specifiek.
- Annuleer verliezende race-verzoeken en alle open requests wanneer een export
  wordt geannuleerd of definitief faalt.
- Maak onderscheid tussen cachefout, endpoint-time-out, HTTP-fout, parsefout
  en lege maar geldige Overpass-response.
- Voeg beknopte diagnostiek toe zonder querydata of enorme responses te loggen.

#### Acceptatiecriteria

- Een hangend endpoint blokkeert de export niet onbeperkt.
- Een tweede gezond endpoint kan de poging overnemen.
- Afgebroken/race-verliezende requests blijven niet doorlopen.
- De uiteindelijke foutmelding noemt bruikbaar het soort uitval en aantal
  mislukte tiles.
- Deterministische tests gebruiken gemockte fetches; geen live netwerk nodig.

## Sprint 3 — Correctheid aantoonbaar maken

**Status:** PLANNED

**Sprint Goal:** bekende kleine dataverlies- en ordeningsfouten zijn opgelost,
en representatieve offline tests bewijzen de belangrijkste v1- en
v2-invarianten inclusief hun foutpaden.

**Omvang:** 2 hoofditems met 4 afvinkbare correctheidssubtaken, 34k–62k tokens.

**Startvoorwaarde:** Sprint 2 is door de eindpoort; fout- en fetchinterfaces
zijn stabiel genoeg om duurzame fixtures te schrijven.

**Binnen scope:** de vier benoemde pipelinecorrecties, offline foutsimulatie,
representatieve city/scenariofixtures en één complete offline smoke-opdracht.

**Buiten scope:** nieuwe kaartcategorieën, pixel-per-pixel redesignsnapshots,
live Overpass als primaire testlus en v2-cutover.

**Eindpoort:** ME-06a–d en ME-07 zijn afgevinkt; één commando draait alle
offline tests; minimaal vijf scenariofixtures bewijzen de benoemde invarianten.

### [ ] ME-06 — Datadekking en kleine pipeline-correctheid repareren

**Complexiteit:** middel

**Tokenkosten:** 12k–22k

**Impact:** middel/hoog; gerichte correctheid zonder ontwerpwijziging.

**Afhankelijkheden:** ME-01–03 voor v2-data- en statussemantiek. De vier
subtaken mogen afzonderlijke commits zijn onder dezelfde taak-id.

**Startpunten:** de place-nodequery in `engine-v2.js`; `ROAD_DRAW_ORDER` en
`indexOf(a)||50` in `script.js`; SVG-id-opbouw rond feature paths/labels; de
bbox/redraw-validatie bij de kaartselectie.

#### Subtaken in deze volgorde

- [ ] **ME-06a — v2 place-node padding.** De query haalt place nodes met 1000 m padding
   op. Controleer dit tegen de labelplaatsing en tilegrenzen en maak de marge
   consistent met de feitelijke export-/collisionbehoefte.
- [ ] **ME-06b — Road sort fallback.** Vervang het patroon `indexOf(...) || 50`; index `0`
   wordt nu ten onrechte als fallback behandeld. Gebruik een expliciete
   `-1`-controle.
- [ ] **ME-06c — Unieke feature-id's.** Voorkom dubbele SVG-id's bij herhaalde of
   samengevoegde OSM-features; maak generatie deterministisch.
- [ ] **ME-06d — Te kleine redraw.** Wis of herbereken de oude bbox/status wanneer een
   nieuwe selectie te klein is, zodat de UI niet verdergaat met verouderde
   grenzen.

#### Acceptatiecriteria

- Rand-place-nodes verdwijnen niet door een willekeurige querymarge.
- Roadgroepen volgen aantoonbaar `ROAD_DRAW_ORDER`, inclusief het eerste item.
- Alle uitgegeven SVG-id's zijn uniek en stabiel voor dezelfde input.
- Een afgewezen kleine selectie kan geen eerdere bbox exporteren.
- Voor iedere subtaak bestaat een kleine regressietest.

### [ ] ME-07 — Regressiedekking rond foutpaden en representatieve steden

**Complexiteit:** hoog

**Tokenkosten:** 22k–40k

**Impact:** hoog; verlaagt het risico van taken 1–6 en de latere refactor.

**Afhankelijkheden:** schrijf kleine regressietests al mee met ME-01–06; rond
deze taak af nadat hun uiteindelijke interfaces stabiel zijn.

**Startpunten:** alle bestanden in `tests/`, met name `real-export.mjs`,
`lib.mjs`, `pipeline-equivalence.mjs`, `sea-sign.mjs`,
`hamlet-grounding.mjs`, `IMPROVEMENTS.md` en eventuele bestaande fixtures.

#### Aanpak

- Voeg offline tests toe voor fetchuitval, gedeeltelijke tiles, time-outs,
  corrupte cachedata, workerfouten en preview/export-races.
- Maak bestaande `sea-sign`- en `hamlet-grounding`-tests onderdeel van één
  gedocumenteerde smoke-opdracht in plaats van losse kennis.
- Voeg queryfixtures toe voor meerdere kaarttypen: compact stedelijk, kust,
  rivier/eilanden, dunbevolkt/hamlet en een stad met rail/tram/metro.
- Test invarianten waar exacte SVG-snapshots te fragiel zijn: coverage,
  paint-order, unieke ids, casing-vóór-fills, geen cream over water en
  deterministische output.
- Laat live `real-export` aanvullend blijven; offline tests moeten de primaire
  ontwikkellus vormen.

#### Acceptatiecriteria

- Eén commando draait de volledige offline suite en eindigt non-zero bij fout.
- Alle belangrijke foutpaden kunnen zonder netwerk worden gesimuleerd.
- Minimaal vijf representatieve fixtures dekken de benoemde kaarttypen.
- De suite controleert zowel v1-pariteit als v2-contracten waar van toepassing.

## Sprint 4 — v2-beslismoment

**Status:** PLANNED — eindigt met menselijke sign-off, niet met automatische
cutover.

**Sprint Goal:** Coen kan op basis van reproduceerbare exports, tests en een
geclassificeerde verschillenlijst bewust beslissen of v2 productiegeschikt is.

**Omvang:** 1 validatiepakket, 20k–45k tokens plus menselijke visuele review.

**Startvoorwaarde:** Sprint 3 is door de eindpoort; de fixtures en foutpaden
waarop de vergelijking steunt zijn groen.

**Binnen scope:** v1/v2-exportparen, coverage/paint-order/labels/Illustrator-
vergelijking, classificatie van verschillen en een vastgelegd go/no-go-advies.

**Buiten scope:** stilzwijgende defaultwijziging, automatische cutover,
nieuwe v2-features of deploy.

**Eindpoort:** ME-08 is technisch afgerond en Coen heeft de menselijke
sign-off expliciet vastgelegd. Een `no-go` kan óók een geldige sprintuitkomst
zijn als resterende blockers concreet zijn vastgelegd.

### [ ] ME-08 — v2 visueel valideren en cutoverbesluit voorbereiden

**Complexiteit:** hoog, plus menselijk cartografisch oordeel

**Tokenkosten:** 20k–45k

**Impact:** hoog; sluit milestone M8 uit
`plans/2026-07-10_export-engine-v2.md` af, maar schakelt v2 niet automatisch in.

**Afhankelijkheden:** ME-01–07. De uiteindelijke sign-off vereist Coens
cartografische oordeel en kan niet autonoom door een model worden afgevinkt.

**Startpunten:** milestone M8 in `plans/2026-07-10_export-engine-v2.md`,
`tests/IMPROVEMENTS.md`, `tests/real-export.mjs` en de bewust bewaarde
SVG-exporttrail in `exports/`.

#### Aanpak

- Rond eerst taken 1–7 af; anders wordt visuele validatie vervuild door
  onbetrouwbare data- of exportstatus.
- Genereer v1/v2-paren voor de afgesproken validatiesteden en scenario's.
- Vergelijk geometry, coverage, labels, paint-order en Illustrator-structuur;
  classificeer verschillen als bug, geaccepteerd v2-ontwerp of databronverschil.
- Werk de resterende open punten in het v2-plan en `tests/IMPROVEMENTS.md` af.
- Leg een korte menselijke sign-off vast. De default-engine/cutover blijft een
  expliciete productbeslissing en mag niet als bijwerking van dit plan gebeuren.

#### Acceptatiecriteria

- Geen onverklaarde coveragegaten of paint-order-regressies.
- Alle afgesproken city/scenario fixtures hebben een vastgelegde uitkomst.
- Offline tests zijn groen en live exports zijn handmatig bekeken.
- Er ligt een apart, expliciet go/no-go-besluit voor de cutover.

## Sprint 5 — Onderhoudbare architectuur

**Status:** PLANNED

**Sprint Goal:** de grote bronbestanden hebben duidelijke, testbare grenzen
voor utilities, fetch/export lifecycle, state, SVG-builders en workers, zonder
bedoelde wijziging van UI of SVG-resultaat.

**Omvang:** 1 gefaseerd refactorpakket met 5 afvinkbare stappen, 40k–70k
tokens; houd iedere stap afzonderlijk reviewbaar.

**Startvoorwaarde:** Sprint 4 is afgesloten met sign-off of een expliciet
besluit welke engine(s) de refactor moet ondersteunen; regressiefixtures zijn
stabiel.

**Binnen scope:** de vijf beschreven gedrag-neutrale extracties binnen de
huidige buildloze browserarchitectuur.

**Buiten scope:** frameworks, bundlers, TypeScriptmigratie, visuele wijzigingen,
nieuwe features en een enginecutover als bijwerking.

**Eindpoort:** ME-09a–e zijn afgevinkt; fixtures tonen gelijkwaardig gedrag;
geen nieuwe globale mutable state of lokale buildverplichting is ontstaan.

### [ ] ME-09 — Monoliet gedrag-neutraal opdelen

**Complexiteit:** zeer hoog

**Tokenkosten:** 40k–70k, bij voorkeur verdeeld over 3–5 commits

**Impact:** middel/hoog op onderhoudbaarheid; geen bedoelde verandering in SVG
of UI.

**Afhankelijkheden:** ME-01–08, in het bijzonder de offline fixtures en het
expliciete exportcontract. Begin niet aan deze refactor als die veiligheidsnetten
nog ontbreken.

**Startpunten:** `script.js` als geheel, met eerste grenzen rond fetch/cache,
export lifecycle, previewstate, `buildSVGContext`/`buildSVG` en workersource;
`engine-v2.js` alleen waar werkelijk gedeelde infrastructuur bestaat.

#### Waarom pas hier

`script.js` is groot genoeg dat gedeelde state en impliciete contracten fixes
onnodig riskant maken. Een framework of buildketen is daarvoor niet nodig.
Eerst moeten de foutcontracten en regressietests stevig genoeg zijn om een
gedrag-neutrale extractie te bewijzen.

#### Veilige fasering

- [ ] **ME-09a:** extraheer pure utilities en constants zonder afhankelijkheid
  van DOM/state.
- [ ] **ME-09b:** extraheer gedeelde fetch/cache/export-lifecycle achter kleine expliciete
   interfaces.
- [ ] **ME-09c:** scheid previewstate, exportstate en UI-state in eigen
  modules/objecten.
- [ ] **ME-09d:** maak SVG layer builders puur: inputdata + opties in,
  SVG-fragmenten uit.
- [ ] **ME-09e:** isoleer workersource en message-contracten, met expliciete
  foutresponses.

De app behoudt gewone browser-scripts en de huidige buildloze ontwikkelroute.
Modules mogen alleen worden ingevoerd als lokale hosting, tests en productie-
minificatie daarmee aantoonbaar compatibel blijven.

#### Acceptatiecriteria

- Voor vaste fixtures zijn SVG-output en layer order bytegelijk of is ieder
  bewust verschil gedocumenteerd.
- Geen nieuwe globale mutable state.
- v1 en v2 delen infrastructuur zonder engine-specifieke geometry te mengen.
- `index.html` blijft direct vanaf bron draaien; geen lokale buildstap vereist.

## Sprint 6 — Product- en projectpolish

**Status:** PLANNED

**Sprint Goal:** de resterende bekende SVG- en UI-randgevallen zijn opgelost
en code, documentatie, hooks, plannen en lokale bronstatus vertellen weer
hetzelfde verhaal.

**Omvang:** 3 taken met 4 productsubtaken, 25k–52k tokens; deels afhankelijk
van menselijke keuzes over lokale bestanden.

**Startvoorwaarde:** Sprint 5 is door de eindpoort, zodat polish op de
definitieve codegrenzen landt.

**Binnen scope:** de vier benoemde SVG/UI-correcties, documentatie/hook-sync,
dode code na bewijs en gecontroleerde inventarisatie van de werkboom.

**Buiten scope:** nieuwe styling, nieuwe presets, ongevraagd verwijderen of
committen van gebruikersbestanden en inhoudelijke lokale-Overpass-implementatie.

**Eindpoort:** ME-10a–d, ME-11 en ME-12 zijn afgevinkt; docs/tests/hooks zijn
actueel; `git status` bevat uitsluitend bewust behouden bestanden; alle
menselijke keuzes zijn vastgelegd.

### [ ] ME-10 — Kleinere SVG-, label- en UI-schuld opruimen

**Complexiteit:** middel

**Tokenkosten:** 15k–30k

**Impact:** middel; vooral consistente output en minder randgevalfouten.

**Afhankelijkheden:** ME-07 voor fixtures; bij voorkeur na ME-09 om nieuwe
logica meteen op de definitieve modulegrenzen te plaatsen.

**Startpunten:** polygon-centroid/interior-point helpers, featurelabelopbouw,
`buildSVGContext`, de SVG-root/envelop, presetopbouw in `script.js`, zichtbare
opties in `index.html` en helptekst in `README.md`.

#### Subtaken

- [ ] **ME-10a:** vervang centroid-only labelankers voor concave polygonen door een gegarandeerd
  intern punt, zonder het gedeelde collisionmodel te omzeilen.
- [ ] **ME-10b:** maak fysieke SVG-afmetingen functioneel eenduidig: controleer of `width`,
  `height`, `viewBox` en printmetadata dezelfde schaal beschrijven in browser,
  Illustrator en downstream printworkflow.
- [ ] **ME-10c:** controleer en verwijder of herstel niet-bereikbare presetcode.
- [ ] **ME-10d:** synchroniseer helptekst, zichtbare opties en standaardwaarden met werkelijk
  gedrag; verander de defaults zelf niet binnen deze onderhoudstaak.

#### Acceptatiecriteria

- Polygonlabels starten nooit aantoonbaar buiten hun geometry.
- De SVG opent op de bedoelde fysieke afmeting en schaal in de ondersteunde
  workflows.
- Er zijn geen dode presetpaden of tegenstrijdige UI-uitleg meer.

### [ ] ME-11 — Documentatie, hook en dode code synchroniseren

**Complexiteit:** laag

**Tokenkosten:** 7k–14k

**Impact:** laag/middel; voorkomt dat ontwikkelregels de feitelijke app missen.

**Afhankelijkheden:** deels geen; de definitieve documentatiesync volgt na de
voorgaande codewijzigingen.

**Startpunten:** `.githooks/pre-commit`, `AGENTS.md`, `README.md`, `MEMORY.md`,
`CHANGELOG.md`, `tests/IMPROVEMENTS.md` en de statusregel bovenaan ieder plan.

#### Aanpak

- Laat de changelog-hook ook wijzigingen aan `engine-v2.js` als appgedrag
  behandelen.
- Breng README, inline help, testdocumentatie en relevante memory-indexen in
  lijn met de huidige engine- en teststatus.
- Markeer vervallen plannen als afgerond/retired en verwijs naar opvolgers;
  herschrijf historische beslissingen niet.
- Verwijder aantoonbaar onbereikbare helpers/presets pas nadat tests bevestigen
  dat ze niet via UI of fixtures worden gebruikt.

#### Acceptatiecriteria

- Een staged gedragswijziging aan v2 zonder changelog wordt door de hook
  geweigerd.
- De gedocumenteerde offline testopdracht is volledig en uitvoerbaar.
- Actieve plannen hebben een actuele status en geen tegenstrijdige eigenaar.

### [ ] ME-12 — Lokale werkboom en afgeronde plannen opschonen

**Complexiteit:** laag, deels handmatig

**Tokenkosten:** 3k–8k

**Impact:** laag op runtime; hoog op overzicht en kans op ongelukjes.

**Afhankelijkheden:** menselijke keuzes over exports en lokale bestanden. Een
model mag inventariseren en adviseren, maar niets verwijderen of committen
zonder expliciete toestemming.

**Startpunten:** `git status --short`, `exports/`, untracked tests en plannen,
plus de statusregels van het Erfurt- en lokale-Overpass-plan.

#### Aanpak

- Beslis per untracked export of die als bewuste regressietrail wordt
  gecommit, lokaal wordt bewaard of verwijderd.
- Neem `tests/hamlet-grounding.mjs` en het lokale-Overpass-plan alleen op als
  hun huidige status bewust is; ze zijn inhoudelijk relevant maar horen niet
  toevallig untracked te blijven.
- Houd `AGENTS.md` volgens de gewenste lokale/repositorypolicy.
- Archiveer of retire het Erfurt-plan pas na de nog open visuele sign-off.

#### Acceptatiecriteria

- `git status` bevat alleen bewust lokaal gehouden bestanden.
- Iedere blijvende test of planfile is tracked en vanuit relevante docs
  vindbaar.
- Er wordt niets verwijderd zonder expliciete menselijke keuze.

## Buiten scope van dit onderhoudsplan

- Nieuwe kaartfeatures, nieuwe OSM-categorieën of visuele redesigns.
- Automatische v2-cutover of deploy. Deploy blijft uitsluitend op expliciet
  verzoek.
- De lokale Overpass-devinstance uit
  `plans/2026-07-13_local-overpass-dev-instance.md`; die kan de ontwikkellus
  versnellen, maar lost geen correctheidsprobleem in de app zelf op.
- Een nieuw framework, bundler of verplichte buildstap.

## Sprintstatus en review bijhouden

Gebruik per sprint één van deze statussen: `PLANNED`, `ACTIVE`, `COMPLETE` of
`CANCELLED`. Er is maximaal één `ACTIVE` sprint. Zet een sprint pas op
`COMPLETE` wanneer de eindpoort gehaald is; onafgeronde taken schuiven niet
stilzwijgend door maar worden expliciet opnieuw gepland.

Voeg bij afsluiting direct onder de status van die sprint dit compacte verslag
toe:

```text
Sprint review — <datum>
Uitkomst Sprint Goal: gehaald / deels gehaald / niet gehaald
Afgerond: <taak-id's>
Niet afgerond: <taak-id's + reden en nieuw besluit>
Gecontroleerd: <tests, live exports en menselijke review>
Besluiten: <keuzes die volgende sprints beïnvloeden>
```

Na iedere sprint: volledige relevante offline suite en syntaxchecks. Een
handmatige v1/v2-exportcontrole is verplicht als rendering, SVG-opbouw of
enginegedrag veranderde. Geen deploy zonder afzonderlijke expliciete opdracht.
