# Active checkpoint

- **Updated:** 2026-09-15
- **Roadmap:** `plans/2026-07-14_codebase-maintenance-priorities.md` (Sprint 3).
- **Unit:** P7 — ME-06a place-node padding.
- **Status:** **Klaar.** Coen koos de kleinere aanpassing (marge optrekken,
  adaptive tiling laten staan) i.p.v. het grotere "alles naar fine grid"
  voorstel. Code gewijzigd, door Codex geverifieerd (geen defect, 3 lage
  bevindingen verwerkt), cache voor beide corpora bijgewerkt en gepind, offline
  suite + v2 real-export acceptatie groen. Nog niet gecommit/gedeployed.

## Laatste bewijs (P7, fase 2 — de fix)

- `engine-v2.js`: nieuwe `PLACE_NODE_FETCH_PAD_M = 1000` naast
  `BUILDING_FETCH_PAD_M`; de fetch-loop in `doExportV2` past `padBboxMeters`
  nu ook toe op `placeNodesLayer` (zelfde patroon als buildings).
  `PLACE_NODE_FETCH_PAD_M` mee-geëxporteerd voor de test-harness en tooling.
- `tests/real-export.mjs` en `tools/prefetch-validation-cache.mjs` spiegelen
  dezelfde padding-beslissing (drie onafhankelijke call sites moeten
  overeenstemmen over welke laag gepad wordt en met hoeveel).
- Nieuwe test `tests/fetch-padding-sync.mjs`: bewaakt die drieweg-sync
  offline (geen netwerk), draait de echte prefetch-tool tegen een
  synthetische stad en vergelijkt de sleutel-bbox met `padBboxMeters` direct.
  Toegevoegd aan `AGENTS.md`'s testlijst.
- `ENGINE-V2.md` en `CHANGELOG.md` bijgewerkt (verplichte changelog-regel).
- Onafhankelijke review: Codex (`gpt-5.6-sol`, read-only, medium) op de diff:
  **geen functioneel defect**, drie lage bevindingen (stale "ONLY"-comment,
  ontbrekende ENGINE-V2.md-notitie, ontbrekende changelog-regel) — alle drie
  verwerkt. Codex bevestigde ook: het padden duwt alleen Oulu's
  `place_nodes`-bbox over de adaptive/grid-grens (4 tiles i.p.v. 1 request);
  geen correctheidsrisico, alleen meer requests voor die ene laag/stad.
- Werkelijke Overpass-kosten (gemeten via de echte tool, niet geschat): veel
  kleiner dan het eerder gerapporteerde getal van 534, omdat padding alleen
  `place_nodes`'s cache-key raakt — de andere 10 lagen per stad blijven
  ongewijzigd. Totaal opgehaald: 33 sleutels voor de 7 validatiesteden (10
  daarvan `place_nodes`; de overige 23 waren **vooraf bestaande, ongerelateerde
  drift** in roads/paths/street_labels/water_labels — queries die al eerder
  wijzigden zonder cache-ververs, losstaand van deze fix) + 140
  `place_nodes`-fine-tiles voor de 10 workshop-steden (eerste run liep tegen de
  standaard 60-minuten-cap aan met 49 sleutels open; hervat met
  `--max-runtime=0` tot alles er was, in totaal ruim 69 minuten). 0 overlap
  tussen beide corpora mogelijk (verschillend sleutelformaat: adaptive/grid vs
  fine). Beide corpora nu **volledig gepind, 0 gaps**
  (`tools/pin-cache.sh status` / `... --cities=tools/workshop-cities.json
  --grid=fine`).
- Acceptatie via `node tests/real-export.mjs <stad> --engine=v2` tegen de
  volledig gepinde cache (elke run: `miss:0, overpass:0`, puur cache-bediend):
  Bremerhaven en Oulu blijven **0 hamlet** (geen nieuwe valse hamlets door de
  bredere fetch), Nievre grondt **60 hamletblobs** (was 59 in de oudere
  ENGINE-V2.md-referentie — één randgeval nu terecht gegrond, precies het doel
  van de fix). Tilburg/Ghent/Paris/Erfurt tonen geen hamlet-gerelateerde
  regressie.
- **Losstaande, niet door deze fix veroorzaakte bevinding:** `roads`
  (Tilburg/Oulu/Ghent/Paris/Erfurt) en `tram`/`metro` (Ghent/Paris/Erfurt)
  zitten onder hun vloerwaarde in `tests/expectations.json`, ook in v1-modus
  en met `overpass:0` (dus geen netwerk-fout, de gepinde data zelf ligt onder
  de vloer). `place_nodes`/hamlet-gerelateerde checks zijn niet geraakt. Dit is
  een apart, ouder probleem (stale vloerwaarden of gedecayde pins voor die
  lagen) — niet opgepakt in deze eenheid, meld dit apart aan Coen.

## Gewijzigde bestanden

`engine-v2.js`, `tests/real-export.mjs`, `tests/fetch-padding-sync.mjs` (nieuw),
`tools/prefetch-validation-cache.mjs`, `ENGINE-V2.md`, `CHANGELOG.md`,
`AGENTS.md` (testlijst), 38 nieuwe bestanden in `cache/pinned/` (7
validatiesteden), plus de gebruikelijke `exports/`-sweep (nieuwste per stad,
`tools/prune-exports.sh` al gedraaid). Workshop-corpus' 833 `_f_`-pins zijn
gitignored, niet in git status.

## Next action

Committen (nog niet gedaan — wacht op Coens laatste "ga" in dit gesprek).
Niet deployen tenzij expliciet gevraagd. Na commit: verder met P8 (ME-06d te
kleine selectie). Laat de ongerelateerde `cache/.ratelimit`-wijziging en
PowerPoint-lockfile (`presentations/~$mapexport-workshop-merged.pptx`) buiten
deze en vervolgcommits.

## Standing rules

Niet committen/pushen/deployen zonder Coens verzoek. Changelog verplicht bij
gedragswijziging. `script.js` niet wijzigen voor v2-features (`ENGINE-V2.md`
§9). Pinned cache nooit ongevraagd verversen. Antwoord in Coens taal,
plain-language, geen em-dashes, geen emoji. Geen geminificeerde/compacte
one-liner-stijl in nieuwe code — leesbaar voor een junior programmeur
(spaties rond operators, duidelijke namen, multi-line).
