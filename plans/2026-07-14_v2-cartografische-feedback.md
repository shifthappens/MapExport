# Plan: v2 cartografische feedback (Coens sign-off-ronde)

**Status: ACTIVE (2026-07-14).** Kleine, zelfstandige cartografische
verfijningen die volgen uit Coens visuele sign-off op de zeven-area v2-sweep
(zie Sprint 1 van `plans/2026-07-14_codebase-maintenance-priorities.md`,
afgesloten met deze feedback). Dit plan staat **naast** de maintenance-roadmap:
die roadmap voegt bewust geen features toe, terwijl dit product-/kaartwerk is.
Coen heeft dit expliciet gevraagd. `plans/ACTIVE.md` wijst tijdens dit werk naar
dít plan als de actieve unit.

## Context voor een nieuwe uitvoerder

MapExport zet OpenStreetMap-data om in gelaagde SVG-stadskaarten voor USE-IT.
Lees `AGENTS.md` en — vóór iedere wijziging aan `engine-v2.js` — de volledige
`ENGINE-V2.md` (de bindende coverage-belofte, complement-regel en paint-order).
Alleen de v2-engine (`engine-v2.js`) is in scope; `script.js` (v1) blijft
ongewijzigd. Er is geen buildstap; tests draaien op de bron.

Deze feedback kwam uit een menselijke visuele review, niet uit een
coverage-fout. De zeven-area sweep was groen (0.000% bare, 0 lint-gaps). De
verfijningen mogen die coverage-belofte niet breken: na CF-02 moet de v2-sweep
opnieuw 0.000% bare halen.

## Verplicht startprotocol (zelfde stramien als de maintenance-roadmap)

1. Lees `AGENTS.md`, `ENGINE-V2.md` en de sectie van deze taak.
2. `git status --short`; bestaande/untracked bestanden zijn van Coen.
3. Verifieer het probleem opnieuw in de actuele code voor je patcht.
4. Eén taak-id per diff. Voeg bij gedragswijziging een korte entry toe bovenaan
   `Unreleased` in `CHANGELOG.md`.
5. Draai de offline set + `node --check engine-v2.js`. Bij zichtbare
   kaartwijziging: draai `node tests/real-export.mjs` (server op `:8080`,
   `lamp start`) voor minstens Tilburg (sand + declutter) en Erfurt (Gera-island
   green-dominance) en controleer render-coverage 0.000% bare.
6. Trigger nooit deploy/push/cutover zonder expliciet verzoek.

## Delegatie-routing

O (orchestrator) bezit de drempel- en ontwerpkeuzes. CF-01 is een afgebakende
E1-implementatie (label-/fetch-mapping, geen coverage-risico). CF-02 raakt de
void-/merge-/coverage-machinerie en is E2: O zet de drempel en het filterpunt
vast, verifieert daarna zelf de sweep. CF-03 is nog niet uitvoerbaar — eerst een
ontwerpbesluit door O/Coen.

## Taken

### [x] CF-01 — "Beach"-laag omdopen naar "Sand" met OSM-subtype

**Complexiteit:** laag. **Impact:** middel; eerlijker labels, geen coverage-risico.

**Afhankelijkheden:** geen.

**Startpunten:** `engine-v2.js` — `beachLayer` (id `beach`, label `Beaches`),
de fetch-regel `wr["natural"~"^(...|sand|beach|...)$"]`, de classify-regel
`/^(beach|sand)$/.test(t.natural)`, en `renderBeach` (`kind = natural==='sand'
? 'Sand' : 'Beach'`, group `inkscape:label="Beaches"`).

#### Probleem

De v2-laag heet "Beaches" en labelt elk element "Beach" tenzij `natural=sand`.
In Tilburg staan vijf `natural=sand`-vlakken die geen stranden zijn (mogelijk
zandbakken/zandvlakken). De categorie is te specifiek: het is in de kern "zand",
niet "strand".

#### Aanpak

- Hernoem de laag naar **Sand**: `beachLayer.label` en de group
  `inkscape:label` worden `Sand`. Houd de interne laag-id `beach` (staat in
  `layerOrder`, de render-dispatch en de classify-categorie) ongewijzigd — alleen
  de zichtbare naam verandert, zodat de diff klein blijft.
- Leid het per-element label af uit OSM (Engelse labels):
  `natural=beach` → `Beach`, `natural=dune` → `Dune`,
  `leisure=sandpit`/`playground=sandpit` → `Sandbox`, anders → `Sand`.
  Een aanwezige `name`-tag wint zoals nu.
- Neem `dune` op in de fetch-regel en de classify-regel zodat kustduinen
  daadwerkelijk als Sand-categorie renderen. `sandpit` is in OSM zeldzaam als
  vlak; de label-branch is future-proof, maar de vijf Tilburg-vlakken blijven
  eerlijk "Sand" (Coen wist zelf ook niet wat het waren).

#### Acceptatiecriteria

- De group heet "Sand"; `natural=sand` leest "Sand", niet "Beach".
- `natural=beach` leest nog steeds "Beach"; `natural=dune` leest "Dune" en wordt
  gefetcht/geclassificeerd.
- `node --check engine-v2.js` groen; Tilburg v2-export toont group "Sand" met
  vijf "Sand"-vlakken. Coverage ongewijzigd (paint-only laag, geen void).

> **Uitgevoerd 2026-07-14.** Group + labels omgezet; `dune` toegevoegd aan fetch
> + classify. Tilburg v2: group "Sand" met 5 "Sand"-vlakken (voorheen onder
> "Beaches", labels "Beach"/"Sand" gemengd). `node --check` groen.

### [x] CF-02 — Groen ontrommelen: piepkleine grass-vlakjes niet schilderen

> **Uitgevoerd 2026-07-14.** Drempel `GRASS_MIN_PAINT_M2 = 80`. Tilburg v2:
> ~1700 confetti-vlakjes → 0 (232 echte grass-patches blijven), render-coverage
> 0.000% bare, park intact (visueel bevestigd op de Vendeliersstraat-regio).
> Erfurt v2: 0.000% bare, blok-classificatie identiek (141 urban / 0 countryside)
> → green-dominance van Gera-island niet geflipt. Offline suite + `node --check`
> groen.

**Complexiteit:** middel/hoog (raakt coverage-machinerie). **Impact:** middel;
minder visuele ruis, coverage-belofte behouden.

**Afhankelijkheden:** geen code-afhankelijkheid; verifieer na CF-01 samen.

**Startpunten:** `engine-v2.js` — `classifyAreaFeatures` (bouwt `grass`),
`prepareFaceData` (`paintLandcover = [...landcover, ...grass]` →
`landcoverPolys`/`landcoverElements`), en de render-array
`[...classified.landcover, ...classified.grass]`. Lees ook de green-dominance
regel in `isUrbanPiece` en de green-remainder merge.

#### Probleem

Tilburg rendert ~1700 piepkleine `Grass`-vlakjes (nameloze `landuse=grass`
en nameloze `leisure=park|garden`): straatbermen, boomspiegels en losse
struiken die als groene blokjes op de kaart verschijnen. Coen: "iets te veel
groen ... individuele struiken en bomen soms als grass" — wel tevreden over de
hoeveelheid groen verder, alleen deze ruis moet weg.

#### Aanpak

- Filter de grass-display-vlakken onder een minimale **grondoppervlakte** weg
  bij de bron: in `classifyAreaFeatures`, zodat **beide** consumenten (de
  render-array én `prepareFaceData`) dezelfde gefilterde set zien en de
  `landcoverElements`-index op de render-array uitgelijnd blijft (de
  occlusion-cull leunt daarop).
- Meet de oppervlakte in m² (projectie-onafhankelijk): `ringAreaLatLon` ×
  `111320² × cos(φ)`. Drempel als benoemde constante (`GRASS_MIN_PAINT_M2`),
  ingesteld door O en visueel afgesteld op de Tilburg-export.
- Raak alleen de grass-display-categorie aan (nameloze grass/village_green en
  nameloze park/garden). Named parks (green-categorie) en landcover
  (farmland/wood/forest) blijven ongemoeid.

#### Coverage-borging (bindend)

- Grass zit al buiten het open-land **signaal** (`openLandPolys` = alleen
  landcover), dus classificatie flipt niet door dit filter.
- Verwijderde vlakjes vallen uit `landcoverPolys` (de fallback-void) én uit de
  block-holes, zodat block-cream/fallback ze opvult in plaats van dat er een gat
  ontstaat. Nooit alleen bij de render droppen — dan zou een block-hole bloot
  komen te liggen (bare land).
- `landcoverVoid` (green-dominance) krimpt minimaal; controleer expliciet dat
  green-dominante faces (Erfurt/Gera-island, Oulu) niet naar cream flippen.

#### Acceptatiecriteria

- Tilburg v2 toont duidelijk minder losse groene blokjes; de Vendeliersstraat-
  achtige parken en echte gazons blijven staan.
- Render-coverage blijft 0.000% bare op Tilburg én Erfurt; geometrische lint
  0 significante gaps; `tests/v2-cutterless-coverage.mjs` groen.
- Gera-island en Oulu blijven green-dominant (geen nieuwe cream-vlakken).

### [ ] CF-03 — (BACKLOG, ontwerp vereist) "Countryside" en "Parks & green" samenvoegen

**Status:** BACKLOG — nog **niet** implementeren. Eerst een ontwerpbesluit.
Bijgehouden als GitHub Issue #2
(`shifthappens/MapExport#2`); de openstaande a/b-beslissing leeft daar.

**Complexiteit:** hoog (paint-order + coverage + classificatie verweven).

**Aanleiding:** Coen (2026-07-14): "Countryside hoort bij Parks & green, maar de
layering zit elkaar nu in de weg. Moet goed over nagedacht worden."

#### Ontwerpspanning om op te lossen vóór implementatie

- `landcover` (group "Countryside": farmland/wood/forest + grass-display) wordt
  **onderaan** `layerOrder` geschilderd, ónder `city_blocks`-cream, en toont
  alleen door waar een face niet als block geldt (green-dominance) of via de
  green-remainder merge. `parks` (named "Parks & green", green-categorie) wordt
  **bovenaan** geschilderd en wordt als block-hole uitgesneden.
- Simpel samenvoegen tot één laag botst dus met: paint-order (onder vs boven
  cream), de block-void (parks zijn holes, landcover niet), de green-dominance
  regel en de coverage-belofte. Een naïeve merge riskeert of cream over
  countryside, of nieuwe bare-land-gaten.
- Te beslissen: wordt het één laag met één paint-positie (en zo ja, welke, en
  wat gebeurt er met de block-hole/void-rol), of blijven het twee
  render-lagen die alleen in de Illustrator-groepsnaam/UI als "Parks & green"
  samenkomen? Leg de keuze vast als beslissing voordat er code verandert.

#### Voorlopige acceptatie (na ontwerpbesluit, apart in te plannen)

- Coverage-belofte behouden (0.000% bare op de sweep-steden).
- Geen cream over land dat OSM als groen toont; geen dubbele paint.
- Één coherente "Parks & green"-presentatie zonder paint-order-conflict.
