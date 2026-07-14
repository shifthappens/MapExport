# Active maintenance checkpoint

- **Updated:** 2026-07-14
- **Roadmap:** `plans/2026-07-14_codebase-maintenance-priorities.md`
- **Sprint:** Sprint 1 — Betrouwbaar exportcontract (`IN PROGRESS`)
- **Unit:** ME-03 — v2-dekkingsbelofte herstellen zonder wegen (`READY`)
- **Owner/route:** O voert ME-02 rechtstreeks uit op verzoek van de gebruiker; geen agentdelegatie.
- **Completed checkpoint:** ME-02 volledig afgerond: volledige exports en previews hebben gescheiden snapshots; alleen exportstate voedt Download, v1/v2-preview gebruikt de eigen builder en request/run-identiteit blokkeert verouderde commits. De UI labelt gewijzigde instellingen als “Download last export”. Roadmapcheckbox en changelog zijn bijgewerkt.
- **Next action:** start ME-03 volgens de taaksectie en het reeds gelezen `ENGINE-V2.md`-contract: leg eerst een gerichte offline regressietest vast voor een bbox zonder cutter roads, verwijder daarna de vroegtijdige lege return in `computeFacesAsync` zonder `minArea` of countrysidegedrag te wijzigen.
- **Changed for current unit:** `script.js`, `engine-v2.js`, `index.html`, `style.css`, `tests/preview-state.mjs`, `tests/export-failures.mjs`, `tests/smoke.sh`, `tests/README.md`, `README.md`, `CHANGELOG.md`, roadmap en dit checkpoint. Bestaande untracked exports, `tests/hamlet-grounding.mjs` en het lokale Overpass-plan bleven ongemoeid.
- **Latest checks:** `OFFLINE_ONLY=1 bash tests/smoke.sh` groen; `node tests/sea-sign.mjs`, `node tests/hamlet-grounding.mjs`, `node tests/preview-state.mjs`, app-syntaxchecks en `git diff --check` groen. Een echte lokale v1-browserexport bevestigde de volledige exportknop, daarna een 600px live preview met “Download last export”, behouden volledige bestandsnaam en nul consolefouten. De v2-previewbuilderroute is offline afgedekt; de contractuele zeven-area v2-sweep is niet herhaald omdat die volgens `tests/README.md` op menselijke Tilburg-goedkeuring is gated.
- **Decisions/blockers:** `exportState` bewaart de laatste volledig geslaagde download plus engine, run-id, bbox, opties en renderdata; `previewState` bewaart alleen de getoonde preview plus engine/request-id. Alleen de nieuwste previewrequest mag committen. Een mislukte export behoudt de vorige exportstate en meldt dat expliciet. Geen blocker voor ME-03.
