# Active maintenance checkpoint

- **Updated:** 2026-07-14
- **Roadmap:** `plans/2026-07-14_codebase-maintenance-priorities.md`
- **Sprint:** Sprint 1 — Betrouwbaar exportcontract (`IN PROGRESS`)
- **Unit:** ME-02 — Preview- en downloadstatus scheiden (`READY`)
- **Owner/route:** O ontwerpt en reviewt; daarna ME-01a naar E1, ME-01b naar E2 en ME-01c naar E1, telkens alleen wanneer de vorige unit stabiel is.
- **Completed checkpoint:** ME-01 volledig afgerond: v1 en v2 stoppen zichtbaar bij brondata- of workerfouten, herstellen hun UI altijd en committen preview/download/history alleen na een volledig geslaagde export. Roadmapcheckbox en changelog zijn bijgewerkt.
- **Next action:** start ME-02 volgens de taaksectie: inventariseer de gedeelde `lastResults`/`lastSvgString`-mutaties en ontwerp gescheiden preview- en downloadstate met engine/run-identiteit voordat code wordt gewijzigd.
- **Changed for current unit:** `script.js`, `engine-v2.js`, `tests/export-failures.mjs`, `tests/lib.mjs`, `tests/smoke.sh`, `tests/README.md`, `README.md`, `CHANGELOG.md`, roadmap en dit checkpoint. Bestaande untracked exports en overige niet-ME-01-wijzigingen blijven ongemoeid.
- **Latest checks:** `OFFLINE_ONLY=1 bash tests/smoke.sh` groen; `sea-sign` en `hamlet-grounding` groen; syntaxchecks voor app en nieuwe testharness groen; `git diff --check` groen. De nieuwe orchestrationtests dekken volledige netwerkuitval en workeruitval in v1/v2, inclusief foutmelding, button/progress-cleanup en ongewijzigde vorige SVG/preview/history.
- **Decisions/blockers:** cache-read/write-fouten blijven herstelbare cachemissers; iedere mislukte brondata-tile is zonder expliciete partial-acceptatie fataal. Vorige succesvolle output blijft bij een mislukte nieuwe run beschikbaar. Geen blocker.
