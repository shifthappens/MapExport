# tests/ — verbeterpunten (bevindingen 2026-07-03)

Analyse van het hele test-harnas na het toevoegen van de multi-city visual
check (ghent/paris/bremerhaven/oulu). Op volgorde van impact.

## 1. `real-export.mjs` kan niet falen

Print statistieken en exit altijd 0. Een run met 0 road-elementen of `NaN` in
het SVG "slaagt". Toevoegen:

- fail als een default-on laag 0 elementen oplevert;
- fail op `NaN` in het SVG;
- per stad verwachte bandbreedtes (elementen per laag, labelaantallen) in een
  klein meta-bestand, zoals `_meta.json` voor fixtures. Gent hoort ~5000 roads
  te hebben; 500 = fail vóór er iemand naar een screenshot kijkt.

## 2. Visuele check deels objectiveren

Deterministisch uit het geëxporteerde SVG te controleren, zonder ogen:

- labels buiten de viewBox;
- rotatiehoeken buiten ±90° (ondersteboven tekst);
- `textPath`-referenties naar niet-bestaande path-ids;
- lege labels;
- label-op-label-overlap via bounding boxes.

Dit vangt precies de foutklasse waarvoor de vijf steden bestaan. De
screenshot-check blijft, maar als laatste stap in plaats van enige stap.

## 3. Staleness: harness test `script.min.js`, jij bewerkt `script.js`

`minify.sh` vergeten = vorige versie testen zonder het te merken. Fix:
mtime-check of minify aanroepen vanuit de harness.

## 4. Labelplaatsing heeft geen unit tests

`road-merge.mjs` / `abbreviate.mjs` bewijzen dat pure functies uit `script.js`
geïsoleerd testbaar zijn. De kern (hoekberekening, textPath-zijde,
herhaalafstand langs lange straten) is ongetest — en dat is waar visuele
checks steeds de fouten vinden. Zelfde slicing-truc, nieuwe testfile.

## 5. Query-regressies alleen op Tilburg bewaakt

`query-equivalence`/`supersession` draaien op Tilburg-fixtures. Internationale
tagging (Straße, Finse *katu*, havens in Bremerhaven) kan in queries sneuvelen
zonder dat Tilburg het toont. Geslimde fixtures (`slimElement`: type/id/tags)
voor de vier kleine gebieden zijn bescheiden in omvang. De README-regel
"alleen Tilburg-fixtures" stamt van vóór het multi-city-doel.

## Kleiner

- Drie source-parsers (`extractLayers` + gedupliceerde scanners in
  `pipeline-equivalence.mjs` en `supersession.mjs`) slaan een laag stilletjes
  over als het patroon niet matcht. Dedupliceren naar `lib.mjs`; falen als het
  aantal geëxtraheerde lagen daalt.
- `query-equivalence` checkt alleen verdwenen elementen, nooit over-fetch
  (per ongeluk verbrede query). Soft warning bij bv. new/baseline > 1.5×.
- `supersession.mjs` zit niet in `smoke.sh`.
- Visuele check: één screenshot van 1500px van een 4961px-kaart maakt
  labeldefecten onzichtbaar. `?crop=`-parameter in `viewer.html` voor een paar
  1:1-detailregio's per stad.
- `real-export.mjs` eindigt met een fire-and-forget `sleep(2000)` voor
  cache-POSTs — race bij trage schrijfacties.
