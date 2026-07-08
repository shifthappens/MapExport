---
name: Workflow preferences
description: User preferences for deploy, commit, and interaction style on mapexport
type: feedback
---

**Do NOT deploy automatically.** Only deploy when the user explicitly says "deploy".

**Why:** User corrected this mid-session — they want control over when changes go live.

**How to apply:** After making changes, commit as needed, but never run `deploy.sh` unless explicitly asked (same for `git push`). Never minify locally as part of normal work — see below, that's deploy-only now.

---

**Minified files are gitignored, not tracked, and not needed for local dev
(since 2026-07-06).** `script.min.js`/`style.min.css` were committed for a
while, but Coen flagged that having them in the repo meant Claude kept picking
up their compact/mangled style (short var names, single-line) as a style cue
when writing source. First fix was gitignoring them but still generating them
locally on every commit; Coen then pushed further — asked whether they're
even needed locally, since the only reason was `index.html` referencing them.
Answer: no. `index.html` now loads `script.js`/`style.css` directly, so
there's **no local build step at all**. Update (2026-07-08): even
`tests/real-export.mjs` was later changed to test `script.js` directly
instead of building/loading `script.min.js` first — there was never a real
reason for that test to exercise minified output, and it meant the minifier
ran (and left build artifacts sitting around) on every test run. The minifier
now runs **only** in the GitHub Actions deploy workflow
(`.github/workflows/deploy.yml`), which builds fresh right before rsyncing,
then rewrites the *deployed* `index.html` via `sed` to point at the minified
files (the repo's own `index.html` is untouched). `script.min.js`/
`style.min.css` should exist on the production server and nowhere else — not
even transiently in a local checkout; delete them if you ever run
`tools/minify.sh` by hand to check it. Never take code style from `*.min.*`
files — they're compressed build output, not something anyone writes or reads.

**Build is tracked in-repo (since branch `claude/street-layers-alphabetical-v0hnyk`).**
- `tools/minify.sh [js|css|all]` — canonical minifier (terser + clean-css, global-or-npx).
- `.githooks/pre-commit` — only **enforces the changelog** now (blocks commits
  touching `script.js`/`style.css`/`index.html`/`cache.php` without a staged
  `CHANGELOG.md`; bypass with `SKIP_CHANGELOG=1`). It no longer minifies anything.
- Run `bash tools/setup-hooks.sh` once per clone to activate (sets `core.hooksPath`).
- Any personal root-level `minify.sh` is gitignored (`/minify.sh`) and superseded.

---

**deploy.sh is gitignored** (`/deploy.sh`). Don't try to `git add deploy.sh` — it will fail.

---

**Local dev server:** use `lamp start` (localhost:8080, docroot `~/Sites`) for local
testing — enables the PHP cache. See [[lamp-local-server]].
