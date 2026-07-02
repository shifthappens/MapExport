# CLAUDE.md — working notes for AI assistants on MapExport

MapExport is a browser-based tool that turns OpenStreetMap data into
publication-ready, layered SVG city maps for USE-IT travel guides. See
`README.md` for architecture, `MEMORY.md` for the curated memory index, and
`PLAN.md` for the current plan.

## ⚠️ Changelog is mandatory

**Every commit that adds, changes, or removes a feature or behaviour MUST add an
entry to the top of the "Unreleased" section in `CHANGELOG.md`, in the same
commit. Newest entries go at the top.** Keep entries short and user-facing.
Pure-internal churn (formatting, regenerating `script.min.js`) is exempt. The
maintenance rule is restated at the top of `CHANGELOG.md` itself.

## Source-of-truth & build

- `script.js` is canonical. `script.min.js` and `style.min.css` are **generated**
  — never hand-edit them. `index.html` and `tests/real-export.mjs` load the
  *minified* files, so a stale min file means the app/tests don't reflect your
  change.
- Regenerate via the tracked build script: **`bash tools/minify.sh`** (or
  `tools/minify.sh js` / `css`). It uses terser for JS and clean-css for CSS,
  preferring global installs and falling back to `npx`.
- **Install the git hooks once per clone: `bash tools/setup-hooks.sh`.** This
  points `core.hooksPath` at the tracked `.githooks/`. The `pre-commit` hook then
  (a) re-minifies any staged source and re-stages the output, and (b) **enforces
  the changelog rule below** — it blocks commits that touch app source
  (`script.js`, `style.css`, `index.html`, `cache.php`) without a staged
  `CHANGELOG.md`. Pure-internal churn can bypass with `SKIP_CHANGELOG=1 git commit`.
- The tracked build lives in `tools/`. Any personal root-level `minify.sh` /
  `deploy.sh` is gitignored and superseded — prefer `tools/minify.sh`.

## Testing

- Offline (no network): `node tests/road-merge.mjs`, `tests/abbreviate.mjs`,
  `tests/supersession.mjs`, `tests/pipeline-equivalence.mjs`.
- End-to-end: `node tests/real-export.mjs` runs the shipped min code headless and
  writes a real SVG to `exports/` (a committed "trail"). It hits live Overpass if
  the local LAMP cache isn't running, so it can be slow.

## Conventions worth preserving

- Roads render in two passes — **all** casings, then **all** fills — so junctions
  stay seamless. Within each pass, paths are sub-grouped by `highway=` class and
  ordered alphabetically. Do not pair casing+fill per street.
- Don't auto-deploy; `deploy.sh` and `minify.sh` are gitignored.
