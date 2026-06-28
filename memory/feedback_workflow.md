---
name: Workflow preferences
description: User preferences for deploy, commit, and interaction style on mapexport
type: feedback
---

**Do NOT deploy automatically.** Only deploy when the user explicitly says "deploy".

**Why:** User corrected this mid-session — they want control over when changes go live.

**How to apply:** After making changes, commit and/or minify as needed, but never run `deploy.sh` unless explicitly asked. Same for `git push`.

---

**Minified files are tracked in git.** `script.min.js` and `style.min.css` are committed (removed from `.gitignore`). They must be in the repo so they deploy correctly and stay in sync with source.

**Build is tracked in-repo (since branch `claude/street-layers-alphabetical-v0hnyk`).**
- `tools/minify.sh [js|css|all]` — canonical minifier (terser + clean-css, global-or-npx).
- `.githooks/pre-commit` — re-minifies staged source + **enforces the changelog**
  (blocks commits touching `script.js`/`style.css`/`index.html`/`cache.php` without a
  staged `CHANGELOG.md`; bypass with `SKIP_CHANGELOG=1`).
- Run `bash tools/setup-hooks.sh` once per clone to activate (sets `core.hooksPath`).
- Any personal root-level `minify.sh` is gitignored (`/minify.sh`) and superseded.

---

**deploy.sh is gitignored** (`/deploy.sh`). Don't try to `git add deploy.sh` — it will fail.

---

**Local dev server:** use `lamp start` (localhost:8080, docroot `~/Sites`) for local
testing — enables the PHP cache. See [[lamp-local-server]].
