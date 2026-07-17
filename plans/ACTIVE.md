# Active checkpoint

- **Updated:** 2026-07-17
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-02a — featurededuplicatie (water/park-labels) — `READY`.
  AF-01 is `DONE` en geaccepteerd (onafhankelijke review: ACCEPT, geen
  defects); ME-06c in de maintenance-roadmap is gesynchroniseerd.
- **Owner/route:** O orchestreert; `scoped-implementer` (E1) implementeert per
  letter-subunit; `reviewer` doet read-only controle bij acceptatierisico.
- **Completed checkpoint:** AF-01 af (commit `6b835c2` + plans-sync): één
  documentbrede id-allocator per `buildSVGContext` (`ctx.uid`),
  `makeUidGen(base, ...suffixes)` reserveert companion-suffixen atomair,
  metro-per-lijn-reset en ongededuplicieerde `feat_`-labels gerepareerd;
  nieuwe offline regressietest `tests/svg-id-uniqueness.mjs` (12 checks,
  v1+v2, standaard+Illustrator) opgenomen in `tests/smoke.sh` en
  `tests/README.md`. Bewuste uitzondering: `lp<N>`-textPath-defs blijven
  lokale teller (svg-lint-contract).
- **Next action:** AF-02a uitvoeren: dedupliceer named water-/parkfeature-
  labels op genormaliseerde naam + verbonden/geografische cluster in de
  feature-labelbuilder (`buildFeatureLabelsLayer`, script.js); houd nuttige
  ver-uit-elkaar-herhaling; baselines Ghent Nederschelde/Leie/Lieve/Robert
  Hoozeepark, Erfurt Bergstrom, Bremerhaven Geeste. O bepaalt de
  afstandsdrempel vóór implementatie.
- **Changed for current unit:** nog niets (AF-02a niet gestart).
- **Latest checks:** `OFFLINE_ONLY=1 bash tests/smoke.sh` volledig groen
  (incl. nieuwe svg-id-uniqueness); `node --check script.js`/`engine-v2.js`
  groen; reviewer-pass op AF-01: ACCEPT. Geen live export gedraaid (AF-01
  wijzigt alleen id-attributen; gate hoort pas bij AF-02c).
- **Decisions/blockers:** offline-first en één exportproces tegelijk; bij 429/
  timeout/cachemiss geen retry-matrix maar checkpoint/hervatting. Metro-
  tunnelpresentatie (AF-05d) en Countryside/Parks-merge (AF-07c) blijven
  expliciete Coen-gates. Geen blockers.
