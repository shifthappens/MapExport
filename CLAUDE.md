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
  run) or the GitHub Actions deploy workflow (production, see Deploy below).
  Don't take code style or naming cues from these files — they're
  compressed/mangled build output, not something anyone wrote or reads; write
  source-quality code in `script.js`.
- To build them manually: **`bash tools/minify.sh`** (or `tools/minify.sh js` /
  `css`). It uses terser for JS and clean-css for CSS, preferring global
  installs and falling back to `npx`.
- **Install the git hooks once per clone: `bash tools/setup-hooks.sh`.** This
  points `core.hooksPath` at the tracked `.githooks/`. The `pre-commit` hook
  only **enforces the changelog rule below** — it blocks commits that touch app
  source (`script.js`, `style.css`, `index.html`, `cache.php`) without a staged
  `CHANGELOG.md`. Pure-internal churn can bypass with `SKIP_CHANGELOG=1 git
  commit`.
- The tracked build lives in `tools/`. Any personal root-level `minify.sh` is
  gitignored and superseded — prefer `tools/minify.sh`.

## Deploy

- **Deploy is a GitHub Actions workflow, not a local script:**
  `.github/workflows/deploy.yml`, `workflow_dispatch` only (never auto-deploys
  on push). Run via the Actions tab or `gh workflow run deploy.yml` — the
  latter needs only `gh` auth, so it works from a Claude Code mobile session
  too. It builds `script.min.js`/`style.min.css` fresh, rewrites a production
  `index.html` to point at them (the repo's own keeps pointing at source, for
  dev), and rsyncs to the server.
- **Never trigger a deploy unless the user explicitly asks for it** ("deploy"),
  same as running `deploy.sh` or `git push` before.
- The server-side account used is a **restricted, non-root user**
  (`mapexport-deploy`) that can only touch the handful of files it needs to —
  it can't reach `cache/` (protected by a sticky bit on the parent directory)
  or anything outside the app directory, and has no sudo. Credentials live
  only in GitHub Secrets (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`,
  `DEPLOY_PATH`), never in the repo. Full rationale and setup details in
  `memory/reference_deploy.md`.
- **Gotcha:** `rsync -a` re-syncs the deploy directory's own permissions from
  the plain local repo root as a side effect, which silently wipes that
  sticky bit. The workflow has an explicit `chmod 1755` step after every sync
  to re-assert it — don't remove that step, and re-check it if the rsync
  steps in `deploy.yml` ever get restructured.
- `deploy.sh` at repo root (gitignored) is just a thin wrapper around
  `gh workflow run` for convenience from a local checkout — it no longer does
  the rsync itself.

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
- Don't auto-deploy — see the Deploy section above. `minify.sh` (root) is
  gitignored.
