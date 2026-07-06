# CLAUDE.md — working notes for AI assistants on MapExport

MapExport is a browser-based tool that turns OpenStreetMap data into
publication-ready, layered SVG city maps for USE-IT travel guides. See
`README.md` for architecture, `MEMORY.md` for the curated memory index, and
`plans/` for implementation plans (dated files; the **Status** line at the top
of each says whether it is ready to implement, in progress, or retired).

## ⚠️ Changelog is mandatory

**Every commit that adds, changes, or removes a feature or behaviour MUST add an
entry to the top of the "Unreleased" section in `CHANGELOG.md`, in the same
commit. Newest entries go at the top.** Keep entries short and user-facing.
Pure-internal churn (formatting, regenerating `script.min.js`) is exempt. The
maintenance rule is restated at the top of `CHANGELOG.md` itself.

## Source-of-truth & build

- `script.js` is canonical, and `index.html` loads `script.js` / `style.css`
  **directly in dev — there's no local build step.** `script.min.js` and
  `style.min.css` are **generated and gitignored — never committed, never
  hand-edited**, and only get built on demand by whatever actually needs the
  minified output: `tests/real-export.mjs` (regenerates it itself before every
  run) or `deploy.sh` (production). Don't take code style or naming cues from
  these files — they're compressed/mangled build output, not something anyone
  wrote or reads; write source-quality code in `script.js`.
- To build them manually: **`bash tools/minify.sh`** (or `tools/minify.sh js` /
  `css`). It uses terser for JS and clean-css for CSS, preferring global
  installs and falling back to `npx`.
- **Install the git hooks once per clone: `bash tools/setup-hooks.sh`.** This
  points `core.hooksPath` at the tracked `.githooks/`. The `pre-commit` hook
  only **enforces the changelog rule below** — it blocks commits that touch app
  source (`script.js`, `style.css`, `index.html`, `cache.php`) without a staged
  `CHANGELOG.md`. Pure-internal churn can bypass with `SKIP_CHANGELOG=1 git
  commit`.
- The tracked build lives in `tools/`. Any personal root-level `minify.sh` /
  `deploy.sh` is gitignored and superseded — prefer `tools/minify.sh`.
  `deploy.sh` runs it fresh right before syncing, then rewrites the deployed
  `index.html` to point at `script.min.js` / `style.min.css` (the repo's own
  `index.html` keeps pointing at source, for dev), so production always gets a
  clean build straight from source, never a stale committed artifact.

## Testing

- Offline (no network): `node tests/road-merge.mjs`, `tests/abbreviate.mjs`,
  `tests/supersession.mjs`, `tests/pipeline-equivalence.mjs`.
- End-to-end: `node tests/real-export.mjs` builds `script.min.js` fresh, then runs
  the shipped min code headless and writes a real SVG to `exports/` (a committed
  "trail"). It hits live Overpass if the local LAMP cache isn't running, so it
  can be slow.

## Conventions worth preserving

- Roads render in two passes — **all** casings, then **all** fills — so junctions
  stay seamless. Within each pass, paths are sub-grouped by `highway=` class and
  ordered alphabetically. Do not pair casing+fill per street.
- Don't auto-deploy; `deploy.sh` and `minify.sh` are gitignored.
