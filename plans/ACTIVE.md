# Active checkpoint

- **Updated:** 2026-09-15
- **Roadmap:** `plans/2026-09-13_af08-eindpoort-en-sprint3-start.md` (P10),
  `plans/2026-07-14_codebase-maintenance-priorities.md` (Sprint 3).
- **Unit:** P10 — AF-04 fix: place nodes bereiken `buildSVG`.
- **Status:** afgerond en gecommit (niet gepusht/gedeployd). Volgende eenheid: P6.

## Laatste bewijs

- Kern van de fix: één gedeelde `EngineV2.renderableResults(results, layerPlan)`
  in plaats van elke aanroeper zijn eigen fetch-only filter. `doExportV2` had
  al sinds AF-04 (72ca037, 2026-07-18) een eigen handmatige re-add van
  `place_nodes`, dus echte app-exports waren nooit stuk; alleen
  `tests/real-export.mjs` miste die uitzondering, dus het export-trail dat de
  AF-08-audit inspecteerde toonde nooit een plaatsnaam. De onderliggende
  implementatie-agent nam dit onderscheid eerst niet waar; de CHANGELOG-,
  ENGINE-V2- en codecommentaartekst overclaimden aanvankelijk "geen enkele
  echte export toonde ooit een plaatsnaam" en zijn gecorrigeerd.
- Dode code verwijderd: `doExportV2`'s overbodige handmatige re-add-blok na de
  nieuwe helper-aanroep (dupliceerde exact dezelfde `water_labels`-gate).
- `tests/place-labels.mjs` uitgebreid met directe assertions op de
  teruggegeven layer-ids van de helper (aan/uit voor `water_labels`), niet
  alleen SVG-stringmatches; 34/34 checks slagen (was 31).
- Onafhankelijke review: Codex (`gpt-5.6-sol`, read-only, twee rondes). Ronde 1
  vond één bevestigde Medium (de overclaim hierboven) en twee Low (dode code,
  zwakke test-assertions). Alle drie verholpen; ronde 2 bevestigt: "No
  material findings remain."
- Eindchecks (allemaal exit 0): `node --check engine-v2.js`,
  `node tests/place-labels.mjs`, `OFFLINE_ONLY=1 bash tests/smoke.sh`,
  `git diff --check`.
- Geen echte Nièvre-sweep als bewijs (pinned cache mist keys sinds AF-08);
  dat bewijs schuift naar de volgende sweep, zoals voorzien in de P10-brief.

## Gewijzigde bestanden

`engine-v2.js`, `tests/real-export.mjs`, `tests/place-labels.mjs`,
`ENGINE-V2.md`, `CHANGELOG.md`, `plans/ACTIVE.md`.

## Next action

Hervat maintenance Sprint 3 met P6 (ME-06b road sort fallback) — zie
`plans/2026-09-13_prompts-per-unit.md`. Let op: een eerdere P6-poging
(2026-09-13) liet geen wijziging achter, dus opnieuw draaien. Laat de
ongerelateerde `cache/.ratelimit`-wijziging en PowerPoint-lockfile buiten
vervolgcommits.

## Standing rules

Niet committen/pushen/deployen zonder Coens verzoek. Changelog verplicht bij
gedragswijziging. `script.js` niet wijzigen voor v2-features (`ENGINE-V2.md`
§9). Pinned cache nooit ongevraagd verversen. Antwoord in Coens taal,
plain-language, geen em-dashes, geen emoji.
