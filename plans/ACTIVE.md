# Active checkpoint

- **Updated:** 2026-07-26
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`.
- **Unit:** AF-07f — groen wordt beoordeeld als samenhangende massa.
  **GEBOUWD** in `engine-v2.js`, offline suite groen, 7 v2-exports gedraaid.
  Wacht op Coens visuele oordeel op de PNG's.
- **Zijspoor afgerond (2026-07-26):** pinned cache werkt nu echt. Zie hieronder.

## Pinned Overpass-cache (afgerond, 2026-07-26)

Coens eis: de zeven validatiesteden verlopen nooit meer en ververst alleen op
zijn expliciete verzoek. `cache/pinned/` bevatte de complete snapshot al sinds
07-23, maar `cache.php` noemde `pinned` nergens — de README zei "cp het
handmatig terug". Gevolg: na 7 dagen TTL ging elke validatie-export weer naar
Overpass (46 refetches op 07-26, elk 1-2 min, met 504's ertussen).

Gebouwd:

- `cache.php`: `pinnedPath()`; GET en `?exists=` vallen terug op
  `cache/pinned/<key>.json[.gz]` als de live kopie ontbreekt of verlopen is.
  Verse live kopie wint. Sweep raakt `pinned/` niet (glob is niet-recursief).
  `X-Cache: PINNED`. Uitzetten met `cache/pinned/.disabled` of
  `MAPEXPORT_CACHE_IGNORE_PINNED=1`.
- `tools/pin-cache.sh status|pin|refresh`. `refresh` zet `.disabled`, draait de
  prefetch, pint, haalt de marker weg (trap op EXIT/INT/TERM).
- `tools/prefetch-validation-cache.mjs`: `--list-keys` (bron van de 70 keys,
  afgeleid uit de app-sources); PINNED telt als hit.
- `tests/real-export.mjs`: aparte `pinned`-teller in de cacheregel.
- `tests/cache-php.mjs`: 8 nieuwe checks (pin serveert, exists ziet pin, live
  wint, verlopen live valt terug op pin, pin overleeft eviction, `.disabled`
  zet alles uit, sweep raakt pin niet).
- Docs: `AGENTS.md` (nieuwe sectie boven de cache-warming-sectie: niet
  refetchen), `tests/README.md`, `README.md`, `cache/pinned/README.md`,
  `.gitignore` (`.disabled`), `CHANGELOG.md`.

Bewijs: alle 70 live entries teruggezet naar 2026-07-01 (dus verlopen), daarna
alle zeven exports opnieuw. Elke stad `{"hit":0,"pinned":10,"miss":0,
"write":0,"overpass":0}`, allemaal PASS, hele sweep ~160 s. Offline suite 13/13.

Let op: die run heeft de verlopen live entries opgeruimd, dus `cache/` bevat nu
0 van de 70; alles draait op de pins. Dat is correct gedrag, geen probleem.
`tools/pin-cache.sh pin` NIET draaien zonder Coens verzoek — dat zou de pins
overschrijven met wat er toevallig live staat.

## Wat er is besloten (2026-07-26, vervangt de rasteraanpak)

De ⌀-rasteraanpak uit de vorige checkpoint is GESCHRAPT (Coen: "no rings").
Meting die dat besliste: unnamed-park-regels sturen maar 0,3-0,9 procentpunt
van het groen op de plaat; 6-9 grote *named* polygonen sturen 5-6 punten. Een
palet-splitsing is dus de echte hefboom, maar Coen wil die (nog) NIET.

Wel gebouwd, na Coens akkoord:

1. Naamloos groen wordt gedissolved vóór de drempel. Stukken binnen
   `GREEN_MASS_BRIDGE_M` = 6 m van elkaar zijn één massa; een massa onder
   `GREEN_MASS_MIN_M2` = 2500 m² wordt niet geschilderd.
2. 6 m is de hele regel: straten laten 8 m+ tussenruimte, dus die blijven
   knippen; voetpaden/fietspaden laten 0,3-5 m en knippen niet meer. Zelfde
   lijn als de block-boundary-regel. NIET de page-space closing die onder
   AF-07e is afgewezen (2-4 mm = 9-19 m grond, plakte bermen aan elkaar).
3. `GREEN_PIECE_MIN_M2` = 80 blijft, nu als voorfilter vóór de dissolve. Zonder
   dat filter ketenen boomspiegels op 5 m afstand tot een nep-park: Tilburg
   ging dan van 694 naar 712 geschilderde stukken in plaats van naar 200.
4. Named green + recreation worden nooit gepoort maar doen WEL mee als anker,
   zodat een berm tegen een named park meegaat.
5. Countryside (farmland/meadow/forest/wood) blijft er helemaal buiten.

Referentiemaat die Coen aanwees: 51.552482,5.074652 = `way/220614168`, naamloos
`leisure=park`, 14984 m² (231×128 m), Korvel Tilburg; met buren gedissolved
18930 m². Ruim boven 2500. Cobbenhagen haalt het NIET op eigen kracht (grootste
losse stuk 3590 m²) maar wel via de 6 m-brug: 5 massa's, 2 ha.

Geschilderde stukken oud → nieuw: tilburg 694→270, ghent 542→268,
paris 882→485, oulu 1407→908, bremerhaven 147→68, erfurt 176→68,
cobbenhagen 154→42, nievre 9→8. Kosten in de classifier: 2-130 ms per stad.

## Gewijzigd

- `engine-v2.js`: `GREEN_MASS_MIN_M2`, `GREEN_MASS_BRIDGE_M`,
  `GREEN_PIECE_MIN_M2`, `elementOutlineRings`, `surviveGreenMassGate`;
  `classifyAreaFeatures` staged nu green/grass en drainet ná de massatoets
  (invoervolgorde blijft behouden). `GRASS_MIN_PAINT_M2` is weg.
- `tests/unnamed-parks.mjs`: contract herschreven naar de massatoets; fixtures
  voor buur-dissolve, geïsoleerd park, geïsoleerde scrub, countryside-uitzondering.
- `CHANGELOG.md`: nieuwe entry 2026-07-26; twee AF-07d-bullets gemarkeerd als
  superseded/opgevolgd.

## Checks

Offline suite 13/13 PASS (incl. `cache-php`, `v2-cutterless-worker`).
`node tests/real-export.mjs <stad> --engine=v2` voor alle zeven: PASS,
0.000% bare pixels, 0 lint, 0 Overpass-requests.

## Next action

Coen kijkt naar de PNG's (PDF niet gebruiken: Chrome laat de `green_clip`
clipPath vallen, waardoor de gedempte paden over parken groen worden; Inkscape
faalt andersom). Daarna: drempel bijstellen als hij dat wil, anders
`plans/2026-07-17_cartographic-audit-followup.md` AF-07f afvinken en de
export-trail committen (3 nieuwste per stad).

## Nog open, bewust niet gedaan

- Palet-splitsing (verzadigd groen voor bestemmingen, bleke tint voor bos/
  natuurgebied/begraafplaats). Bewezen de grootste hefboom (Bremerhaven
  13,7%→7,6%, Oulu 14,6%→9,5%), previews in `exports/_af07f-preview/palette-*.svg`.
  Coen: nog niet.
- Zelfde massatoets op de Sand/beach-laag.
- `exports/_af07f-preview/` is untracked wegwerpmateriaal.

## Standing rules

Niet committen/pushen/deployen zonder Coens verzoek. Changelog verplicht bij
gedragswijziging. `script.js` bevroren (§9). Antwoord in Coens taal,
plain-language, geen em-dashes, geen emoji.
