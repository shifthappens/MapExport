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
  — never hand-edit them. After editing `script.js`, regenerate the min file
  (`npx terser script.js -c -m -o script.min.js`); `index.html` loads the min.
- `index.html` and `tests/real-export.mjs` consume `script.min.js`, so a stale
  min file means the app/tests don't reflect your change.

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
