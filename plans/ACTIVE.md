# Active checkpoint

- **Updated:** 2026-09-13
- **Roadmap:** `plans/2026-07-14_codebase-maintenance-priorities.md` (Sprint 3).
  De cartografische tussen-sprint (`plans/2026-07-17_cartographic-audit-followup.md`)
  is COMPLETE, AF-08 gesloten op de 2026-08-07-sweep.
- **Uitvoeringsplan:** `plans/2026-09-13_af08-eindpoort-en-sprint3-start.md`.
- **Sprint:** maintenance Sprint 3, net gestart.
- **Unit:** P10 (AF-04 fix: place nodes bereiken `buildSVG` niet), uit
  `plans/2026-09-13_af08-eindpoort-en-sprint3-start.md`. Daarna P6, P7, P8.

## Geverifieerd 2026-09-13 (O)

- `OFFLINE_ONLY=1 bash tests/smoke.sh` exit 0; dubbele SVG-id's in alle zeven
  2026-08-07-exports: 0; corridor-lint faalt op zes van zeven (geaccepteerd,
  zie matrix).
- **AF-04 rendert nergens.** `doExportV2` (`engine-v2.js` 4005) en
  `tests/real-export.mjs` (313) filteren `place_nodes` weg vóór `buildSVG`,
  dat het op regel 3659 nodig heeft. Geen enkele export sinds 2026-07-18
  bevat een plaatsnaam. Coens sign-off van AF-04 is daarom ingetrokken;
  fix is unit P10.
- P6- en P7-sessies hebben niets in de werkboom achtergelaten; ME-06b en
  ME-06a staan nog open.
- Cobbenhagen ligt buiten de Tilburg-validatiebbox; AF-07f is afgetekend op
  Korvel plus de hele plaat.

## Next action

Draai prompt P10 uit `plans/2026-09-13_prompts-per-unit.md` (E1). Daarna P6.

## Besloten

- AF-07f (groenmassa): Coen geeft visuele sign-off akkoord (2026-09-13).
- AF-04 (place-labels Nièvre): sign-off van 2026-09-13 ingetrokken, de plaat
  bevatte geen plaatsnamen (zie hierboven).
- Regressies op de zeven 2026-08-07-platen: geen gevonden; Coen bevestigt de
  sweep zonder herexport (2026-09-13).
- **Palet-splitsing: definitief NIET** (Coen, 2026-07-26). Niet opnieuw
  voorstellen.

## Standing rules

Niet committen/pushen/deployen zonder Coens verzoek. Changelog verplicht bij
gedragswijziging. `script.js` niet wijzigen voor v2-features (`ENGINE-V2.md`
§9). Pinned cache nooit ongevraagd verversen. Antwoord in Coens taal,
plain-language, geen em-dashes, geen emoji.
