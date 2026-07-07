# Plan: app improvements — robustness quick wins, then workflow/cartography features

**Status: PROPOSED 2026-07-07** — assessment written on request ("what would
you add or improve?"); awaiting Coen's review before any tranche is
implemented.

## Context

Open question from Coen: *what features would you add or what improvements
would you make to the app / code as it is now?* This plan records the
assessment (grounded in the current source, CHANGELOG, plans/, and
`tests/IMPROVEMENTS.md`) and proposes a first implementation tranche.

Overall verdict: the app is in very good shape — the label engine, block
cutter, and zero-dependency test harness are unusually mature. The weakest
spots are **operational robustness** (CDN single points of failure, no CI,
an unvalidated cache write path) rather than cartography. The
highest-value features are small workflow/print items, not big rewrites.

## Recommendations (prioritized)

### Tranche 1 — quick wins / robustness (proposed to implement first)

1. **Vendor ClipperLib + Leaflet locally.**
   - The block worker does
     `importScripts('https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.min.js')`
     (in `BLOCK_WORKER_SRC`, `script.js` ~line 1970) — if jsdelivr is down,
     the signature city-blocks layer fails. Leaflet JS/CSS come from cdnjs
     (`index.html`). Fonts are already self-hosted; these should be too.
   - Add `vendor/clipper-lib-6.4.2.min.js`, `vendor/leaflet-1.9.4.min.js` +
     CSS (+ Leaflet's image assets); point `index.html` and the worker at
     them. The worker needs an absolute URL derived from `location.origin`,
     since blob workers can't resolve relative `importScripts`.
   - Update `.github/workflows/deploy.yml` to ship `vendor/` (the deploy
     user is restricted to an explicit file set — see
     `memory/reference_deploy.md`; keep the `chmod 1755` sticky-bit step).

2. **CI workflow running the offline test suite.**
   - New `.github/workflows/test.yml` on push/PR: Node 20, run
     `OFFLINE_ONLY=1 bash tests/smoke.sh`. No secrets, no network, no
     npm install. Today only `deploy.yml` exists — nothing runs
     `road-merge` / `abbreviate` / `supersession` / `pipeline-equivalence` /
     `label-placement` / `svg-lint-selftest` automatically.

3. **Cancel button on the export progress overlay.**
   - `doExport()` has no user-facing abort; per-fetch `AbortSignal.timeout`
     already exists in `fetchLayer` / `fetchTileCombined` /
     `fetchTileCombinedRace`. Add one export-scoped `AbortController`,
     thread its signal into those fetches (combine with the timeout via
     `AbortSignal.any`), terminate the block worker on cancel, add a Cancel
     button to `#progress-overlay` in `index.html`, and unwind cleanly
     (hide overlay, status "Export cancelled").

4. **Harden `cache.php` writes.**
   - The gzip POST path stores arbitrary bytes with no validation and no
     size cap (the code comment admits it) — anyone who can reach the
     endpoint can fill the disk or poison cache entries served back from
     the domain. Add: reject bodies over a cap (e.g. 64 MB, via
     `CONTENT_LENGTH` plus a counted stream copy), verify the gzip magic
     bytes (`1f 8b`) on the first chunk, and write to a temp file + rename
     so truncated uploads never become live cache entries. Keep the
     no-full-decompress design — the memory-safety rationale stands.

### Tranche 2 — cartography / workflow features (next; order needs Coen's priorities)

5. **Scale bar + north arrow as their own SVG layer**
   (`inkscape:groupmode="layer"` like the rest, so designers can move or
   delete them). Exact from bbox + latitude; sized via `getScaleFactor(W)`.
6. **Full settings restore + shareable permalink.** History restores only
   bbox + preset today (`renderHistory`); also save/restore layer
   selection, label toggles, print size, and format — and mirror the same
   state into a URL hash so USE-IT offices can share exact export setups.
7. **Color customization UI.** `PRESETS` has exactly one entry but a full
   per-class structure; add a small palette editor (water, parks, casing,
   blocks, labels) with live-preview recolor, stored per city in
   localStorage.
8. **Admin-boundary clipping** — `btn-boundary` already fetches boundaries
   (`fetchBoundaries`) but exports stay rectangular; offer clipping the
   export (or at least the block layer) to the boundary polygon.
9. Bigger lift, later: **rotated export areas**, since guide maps are often
   rotated to fit the page.

### Tranche 3 — code health (background work)

10. **Multi-city query-regression fixtures** — the one open item in
    `tests/IMPROVEMENTS.md`: give `capture-fixtures.mjs` a city argument
    and loop `query-equivalence` over all fixture dirs.
11. Optional: JSDoc annotations + `tsc --checkJs` in CI (type safety with
    no runtime change and no build step).
12. **Not recommended**: splitting `script.js` into ES modules — it would
    break the `loadAppSandbox` test loader and the deliberate no-build
    ethos for modest gain.

## Tranche 1 implementation notes

### Files to modify
- `index.html` — vendored Leaflet references; Cancel button in
  `#progress-overlay`.
- `script.js` — worker `importScripts` URL; export-scoped AbortController
  threading; cancel UI wiring.
- `cache.php` — POST size cap, gzip magic check, temp-file + rename.
- `.github/workflows/deploy.yml` — ship `vendor/` (keep `chmod 1755`).
- New: `vendor/` assets, `.github/workflows/test.yml`.
- `CHANGELOG.md` — entry per feature commit (mandatory).

### Verification
- `OFFLINE_ONLY=1 bash tests/smoke.sh` — full offline suite green.
- `php -S localhost:8889` + headless browser: app loads (Leaflet from
  `vendor/`), small export completes (worker loads vendored Clipper),
  Cancel mid-export unwinds with no console errors.
- `node tests/real-export.mjs` — end-to-end SVG trail still passes lint +
  expectations.
- `cache.php`: curl a valid gzip POST (stored), an oversized body
  (rejected), a non-gzip body with a gzip header (rejected); GET returns
  the stored entry.
