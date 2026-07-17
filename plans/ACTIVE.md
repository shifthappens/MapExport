# Active checkpoint

- **Updated:** 2026-07-17
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, expliciet tussen
  maintenance Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-01 — documentbrede, deterministische SVG-ID's — `READY`.
- **Owner/route:** O bepaalt namespace en reviewt; in Claude is
  `scoped-implementer` de E1-route en `reviewer` de onafhankelijke read-only
  controle. AF-01 vervult na acceptatie maintenance ME-06c.
- **Completed checkpoint:** alle zeven exports volledig visueel en structureel
  geaudit; bewijsrapport en Ghent-reference staan in de repo. Geen kaart heeft
  een magenta dekkingsgat. Bevindingen zijn getrieerd naar fix, bewuste stijl,
  OSM-brondata of expliciet productbesluit. Crèmekleurige city blocks zijn
  bevestigd als bedoelde cartografische abstractie, niet als defect.
- **Next action:** voer uitsluitend AF-01 uit: herverifieer de ID-bronnen,
  implementeer één deterministische documentbrede namespace, voeg een offline
  uniqueness-regressietest toe en review de diff. Geen labelplaatsing, kleur of
  geometrie wijzigen; geen live export vóór de offline checks groen zijn.
- **Changed for current unit:** auditrapport + screenshots, geconverteerde
  Ghent-reference, nieuw tussen-sprintplan, ouder cartografieplan/maintenance-
  statusnotities en dit checkpoint. Geen appbron gewijzigd.
- **Latest checks:** zeven SVG's visueel met magenta en fallback-overlay
  gecontroleerd (0 zichtbare gaten); 36 lokale rapportlinks gevalideerd;
  dubbele-ID-inventory: Bremerhaven 2, Erfurt 6, Ghent 205, Oulu 2, Paris 7,
  Nièvre/Tilburg 0 verschillende dubbele ID-namen.
- **Decisions/blockers:** offline-first en één exportproces tegelijk; bij 429,
  timeout of cachemiss geen retry-matrix maar checkpoint/hervatting. Metro-
  tunnelpresentatie en Countryside/Parks-merge blijven expliciete Coen-gates;
  zij blokkeren AF-01 niet.
