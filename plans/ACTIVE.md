# Active checkpoint

- **Updated:** 2026-09-15
- **Roadmap:** `plans/2026-07-14_codebase-maintenance-priorities.md` (Sprint 3).
- **Unit:** PERF-05, begrensde v2-void/covergeometrie en lokale
  hamletmorfologie; los tussendoorwerk, geen Sprint-3-taak afgevinkt.
- **Status:** afgerond; broncode, regressietest, changelogcorrectie en dit
  checkpoint worden samen vastgelegd. Niet gepusht of gedeployd.

## Laatste bewijs

- De gerichte worker-test vergelijkt de geoptimaliseerde en behouden
  referentieroute exact voor blokgrenzen/gaten en zichtbare landcover. Zij dekt
  deels zichtbare water/landcover, geheel off-frame landcover en bouwringen net
  binnen/buiten het conservatieve countryside-bereik.
- Lokale Nijmegen-bbox: `51.828,5.828,51.872,5.897`; 42 cachehits, 0 misses,
  0 Overpass. Eén volledige geoptimaliseerde worker-run: 23.624 s; 500/47.392
  hamletringen behouden; frame-clipping 132.236 -> 46.502 vertices. De
  referentierun was na ruim tien minuten nog niet klaar en is op verzoek
  afgebroken; daarom geen referentiemediaan of snelheidsfactor claimen.
- De volledige export bereikte geometrische en gerenderde coverage zonder
  significante gaten, maar de custom bbox heeft twee bestaande label-lintfouten.
- Eindchecks: `git diff --check`, `node --check engine-v2.js`,
  `node tests/v2-face-runtime-benchmark.mjs` en
  `OFFLINE_ONLY=1 bash tests/smoke.sh` allemaal exit 0. De review vond eerst
  een covervrije sub-pixel-parityfout; guard en regressietest zijn hersteld en
  de reviewer gaf daarna ship-advies zonder resterende bevestigde defecten.

## Gewijzigde bestanden

`engine-v2.js`, `tests/v2-face-runtime-benchmark.mjs`, `tests/README.md`,
`CHANGELOG.md`, `plans/ACTIVE.md`.

## Next action

Hervat maintenance Sprint 3 met P10, daarna P6. Laat de ongerelateerde
`cache/.ratelimit`-wijziging en PowerPoint-lockfile buiten vervolgcommits.

## Standing rules

Niet committen/pushen/deployen zonder Coens verzoek. Changelog verplicht bij
gedragswijziging. `script.js` niet wijzigen voor v2-features (`ENGINE-V2.md`
§9). Pinned cache nooit ongevraagd verversen. Antwoord in Coens taal,
plain-language, geen em-dashes, geen emoji.
