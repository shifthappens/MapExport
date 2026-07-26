# Active checkpoint

- **Updated:** 2026-07-26
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`.
- **Unit:** AF-07f — groen wordt beoordeeld als samenhangende massa. Gebouwd,
  gereviewd en **gecommit**. Wacht alleen nog op Coens visuele oordeel op de
  PNG's.
- **Daarna:** AF-08, de zeven-steden-eindpoort. Dat is het laatste openstaande
  werk in deze sprint.

## Stand van zaken, geverifieerd tegen code en git

- `engine-v2.js` bevat de massatoets: `GREEN_MASS_MIN_M2` = 2500 (regel 478),
  `GREEN_PIECE_MIN_M2` = 80 (487), `GREEN_MASS_BRIDGE_M` = 6 (496).
  `GRASS_MIN_PAINT_M2` komt nergens meer voor.
- Gecommit in `c1e57fb` (de massatoets zelf) en `2fdac60` (de review-fixes).
  De pinned cache zit in `3328310`; `75fa317` legde de review-route vast.
- Working tree bevat verder alleen een commentaar-opschoning (2026-07-27): geen
  regel code gewijzigd in welk bestand dan ook, geverifieerd door de bronnen
  zonder comments te vergelijken met HEAD. Offline suite exit 0.
- Exporttrail staat op 3 per stad (07-22, 07-23, 07-26) voor alle zeven, alles
  gecommit. Dat is de standing policy, dus daar hoeft niets meer.
- `OFFLINE_ONLY=1 bash tests/smoke.sh` exit 0 (29 testbestanden, alleen de
  online query-equivalence wordt overgeslagen).
- `cache/pinned/` bevat alle 70 keys; `cache/` heeft er nu 66 live staan.
  `tools/pin-cache.sh pin` of `refresh` NIET draaien zonder Coens verzoek.

## Wat AF-07f doet

Naamloos groen wordt gedissolved vóór de drempel. Stukken binnen 6 m van elkaar
zijn één massa; een massa onder 2500 m² wordt niet geschilderd. De 6 m is de
hele regel: straten laten 8 m+ tussenruimte en blijven dus knippen,
voetpaden/fietspaden laten 0,3-5 m en knippen niet meer — dezelfde lijn als de
block-boundary-regel. `GREEN_PIECE_MIN_M2` = 80 blijft als voorfilter vóór de
dissolve, anders ketenen boomspiegels tot een nep-park. Named green en
recreation worden nooit gepoort maar doen wel mee als anker. Countryside
(farmland/meadow/forest/wood) blijft er helemaal buiten.

Referentiemaat die Coen aanwees: `way/220614168`, naamloos `leisure=park`,
14984 m², Korvel Tilburg; gedissolved met buren 18930 m². Cobbenhagen haalt het
niet op eigen kracht (grootste losse stuk 3590 m²) maar wel via de 6 m-brug:
5 massa's, 2 ha.

Geschilderde stukken oud → nieuw: tilburg 694→270, ghent 542→268, paris
882→485, oulu 1407→908, bremerhaven 147→68, erfurt 176→68, cobbenhagen 154→42,
nievre 9→8.

## Review-ronde (Codex `gpt-5.6-sol`, verwerkt in 2fdac60)

Echte defecten, geen stijlpunten:

- Bruggen werd gemeten tussen bemonsterde punten, niet tussen randen. Nu exacte
  segment-tot-segment afstand.
- Een grasveld midden in een named park bleef los. Nu een containment-pass, per
  outer ring, met outer-min-inner zodat een binnenhof géén parkgrond is.
- Massa-oppervlak telde dubbel gemapt groen twee keer. Nu min(som, bbox), plus
  een unit-conversie (bbox rekent met ky=110540, `elementAreaM2` met 111320).
- De grid legde elk segment in álle cellen van zijn bounding box. Nu een
  Amanatides-Woo lijnloop. Bremerhaven 94 ms → 31 ms; synthetische 10 km-rand
  10614 ms → 8 ms.
- `pin-cache.sh refresh` verversste niets. Nu worden geldige live entries
  geparkeerd in `cache/.refresh-stash/` en teruggezet met `ln`.
- Pin-validatie keek alleen naar de eerste 4 KB. Nu `gzip -t` plus volledige
  JSON-parse, en staged onder `.$key.$$.tmp`.

Tests erbij: `tests/pin-cache.mjs` (nieuw), sectie 7 in `tests/unnamed-parks.mjs`,
vier pin-checks in `tests/cache-php.mjs`.

## Next action

Coen kijkt naar de PNG's (PDF niet gebruiken: Chrome laat de `green_clip`
clipPath vallen, waardoor de gedempte paden over parken groen worden; Inkscape
faalt andersom). Daarna: drempel bijstellen als hij dat wil, anders AF-07f
afvinken en door naar AF-08.

## Nog open, bewust niet gedaan

- Zelfde massatoets op de Sand/beach-laag.

## Besloten en afgesloten

- **Palet-splitsing: definitief NIET** (Coen, 2026-07-26). Het idee was
  verzadigd groen voor bestemmingen en een bleke tint voor bos/natuurgebied/
  begraafplaats. Gemeten als de grootste hefboom, maar Coen wil geen tweede
  groentint. Niet opnieuw voorstellen.
- Alle AF-07f-previewbestanden zijn op Coens verzoek verwijderd
  (`exports/_af07f-preview/`, untracked scratch). De cijfers die eruit kwamen
  staan hierboven en in de roadmap; de SVG's zelf zijn niet bewaard.
- De ⌀-rasteraanpak is geschrapt (Coen: "no rings"). Meting die dat besliste:
  unnamed-park-regels sturen maar 0,3-0,9 procentpunt van het groen op de
  plaat; 6-9 grote *named* polygonen sturen 5-6 punten.
- AF-07e (clusterbuffer) is door meting weerlegd: 2 mm buffer zet Piushaven in
  een component van 34 delen, 4 mm in 43 delen. De buffer lijmt straten aan
  bermen tot een nepplantsoen.

## Standing rules

Niet committen/pushen/deployen zonder Coens verzoek. Changelog verplicht bij
gedragswijziging. `script.js` bevroren (§9). Antwoord in Coens taal,
plain-language, geen em-dashes, geen emoji.
