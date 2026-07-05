# tests/ — verbeterpunten

Bevindingen 2026-07-03 na het toevoegen van de multi-city visual check;
status bijgewerkt dezelfde dag nadat het merendeel is geïmplementeerd.

## Gedaan (2026-07-03)

1. ~~**`real-export.mjs` kan niet falen**~~ — DONE. Exit 1 bij lint-errors,
   0 roads/labels of een laag onder z'n per-stad-ondergrens
   (`expectations.json`, vastgelegd met `--record` op een goedgekeurde run,
   tellingen ×0.5). Tilburg + Gent staan erin; de andere drie steden volgen
   bij hun eerstvolgende goedgekeurde (gegate) run.
2. ~~**Visuele check deels objectiveren**~~ — DONE. `svg-lint.mjs` checkt
   NaN/undefined, lege labels, kapotte/gespiegelde `textPath`s, rotaties
   buiten ±90°, label-overlap (errors) en labels buiten/half buiten het
   canvas (warnings). Zelf bewaakt door `svg-lint-selftest.mjs`.
3. ~~**Staleness `script.min.js` vs `script.js`**~~ — DONE. `real-export.mjs`
   weigert te draaien (exit 3) als de bron >2s nieuwer is dan de min-file.
4. ~~**Labelplaatsing heeft geen unit tests**~~ — DONE. `label-placement.mjs`
   (31 checks) draait de echte `buildLabelsLayer` uit `script.js` via
   `lib.mjs loadAppSandbox` op synthetische straten.
5. Kleiner, ook gedaan: scanner-dedup naar `lib.mjs` (faalt hard bij
   extraction-drift i.p.v. lagen stil over te slaan); over-fetch-warning in
   `query-equivalence` (>1.5×); `supersession.mjs` + alle offline suites in
   `smoke.sh` (`OFFLINE_ONLY=1` slaat netwerk over); `?crop=` in
   `viewer.html`; de `sleep(2000)`-race vervangen door echte POST-drain.

## Gedaan (2026-07-04)

6. ~~**Labels buiten hun straat**~~ — DONE (defectmelding Coen, vijf crops).
   Engine: koorde-plaatsing met afwijkingslimiet t.o.v. de wegbreedte
   (anders textPath), kruisingsmarge aan de uiteinden van een run, en
   verticale centrering numeriek ingebakken (geen `dominant-baseline` meer —
   QuickLook/Illustrator negeerden dat). Harnas: `svg-lint` heeft nu een
   containment-check (glyfband vs. het witte wegvlak van de eigen straat, op
   naam) zodat deze klasse voortaan de tests laat falen.

## Gedaan (2026-07-05)

7. ~~**Labels buiten het canvas / budget-verbranding**~~ — DONE. Engine:
   `fpInside`/`fpVisible`-gates in `buildLabelsLayer` (twee passes: eerst
   volledig zichtbaar, daarna pas afgesneden herhalingen; nooit volledig
   buiten beeld). Lint: die klassen zijn nu errors i.p.v. warnings.
8. ~~**Feature- en straatlabels delen geen collision-grid**~~ — DONE. Eén
   gedeeld footprint-grid via `buildSVGContext` (`labelGrid`); feature-labels
   bouwen eerst (`LAYER_ORDER`) en claimen hun enige ankerplek, straatlabels
   wijken uit. Alle label-overlap is nu een lint-error. Het grid bevat ook de
   spoorcorridors, zodat geen naam over de spoorbaan valt (eigen lint-check).

## Open

### Query-regressies alleen op Tilburg bewaakt

`query-equivalence`/`supersession` draaien op Tilburg-fixtures. Internationale
tagging (Straße, Finse *katu*, havens in Bremerhaven) kan in queries sneuvelen
zonder dat Tilburg het toont. Geslimde fixtures (`slimElement`: type/id/tags)
voor de vier kleine gebieden zijn bescheiden in omvang. Aanpak:
`capture-fixtures.mjs` een stad-argument geven en `query-equivalence` over
alle aanwezige fixture-dirs laten lopen. De README-regel "alleen
Tilburg-fixtures" stamt van vóór het multi-city-doel.

