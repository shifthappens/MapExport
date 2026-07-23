# Active checkpoint

- **Updated:** 2026-07-23
- **Roadmap:** `plans/2026-07-17_cartographic-audit-followup.md`; maintenance
  bron blijft `plans/2026-07-14_codebase-maintenance-priorities.md`.
- **Sprint:** cartografische audit-tussen-sprint `ACTIVE`, tussen maintenance
  Sprint 2 (`COMPLETE`) en Sprint 3 (`PLANNED`).
- **Unit:** AF-05d — metro-tunnelbesluit — `COMPLETE` (2026-07-23; Coen koos
  optie (a) "zichtbaar maar subtieler", O implementeerde en verifieerde
  dezelfde dag).
- **Owner/route:** O direct; geometry/classification invariants require the
  engine-v2 contract to remain exact.
- **Completed checkpoint:** metro-tunnelways renderen nu via een nieuwe
  v2-only functie (`renderMetroTunnelGroup` in `engine-v2.js`) in plaats van
  v1's `buildMetroLayer`: geen witte casing-halo, één 7×sf gestreepte stroke
  op opacity 0.4, lijnkleur behouden. Per lijn gegroepeerd als sibling
  `metro_<lijn>_tunnel` van de bestaande `metro_<lijn>`-groep, teruggespliced
  in dezelfde buitenste Metro-laagwrapper; een frame zonder tunnels blijft
  byte-identiek aan v1. Nieuwe `tests/metro-tunnel.mjs` (18 checks) dekt
  gemengde lijn, volledig-ondergrondse lijn, surface-empty synthesepad en
  byte-identiteit zonder tunnels; twee bestaande `tests/metro-dedup.mjs`-checks
  aangepast aan de nieuwe groepsnaam (waren stilzwijgend achterhaald, niet
  gebroken). Cached Paris cache-only vergelijking (zelfde crop vóór/ná via
  `git stash` van alleen `engine-v2.js`) bevestigt het audit-beeld direct bij
  Place de Rungis: vóór = dikke ononderbroken lijn 6-tunnellus over rotonde/
  park; ná = dunne gestreepte lijn, echt verhoogd spoor elders onveranderd
  dik/vol. ENGINE-V2.md §4/§7 geamendeerd. Progressiematrix + AF-05d-checkbox
  in de roadmap bijgewerkt (NEEDS_COEN → FIXED).
- **Next action:** Resume the roadmap task selected by Coen. Open items:
  AF-02/03/04's cached-exportgate (uitgesteld naar AF-08), AF-07c
  (Countryside/Parks & green, `NEEDS_COEN`), AF-07d (parkgrond boven city
  blocks, implementatie), AF-08 (zeven-steden-eindpoort).
- **Changed for current unit:** `engine-v2.js`, `tests/metro-dedup.mjs`
  (2 checks + comments updated), `tests/metro-tunnel.mjs` (new), `tests/smoke.sh`,
  `CHANGELOG.md`, `ENGINE-V2.md`, the roadmap plan and `plans/ACTIVE.md`, plus
  the newest Paris validation SVG (date-stamp + metro-tunnel-group diff only).
- **Latest checks:** `node --check engine-v2.js`; `node tests/metro-dedup.mjs`;
  `node tests/metro-tunnel.mjs`; `OFFLINE_ONLY=1 bash tests/smoke.sh` (full
  suite, exit 0); `node tests/real-export.mjs paris --engine=v2` (cache-only,
  10/10 hits, 0 lint issues, 0.000% bare pixels); visual before/after crop
  comparison in-browser at the same coordinates.
- **Decisions/blockers:** none open. The unrelated cache rate-limit marker
  remains modified (pre-existing, untouched by this unit). No Claude reviewer
  subagent spawned for this unit — Coen confirmed an external ChatGPT agent
  will review the work instead.
