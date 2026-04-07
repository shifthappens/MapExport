---
name: Workflow preferences
description: User preferences for deploy, commit, and interaction style on mapexport
type: feedback
---

**Do NOT deploy automatically.** Only deploy when the user explicitly says "deploy".

**Why:** User corrected this mid-session — they want control over when changes go live.

**How to apply:** After making changes, commit and/or minify as needed, but never run `deploy.sh` unless explicitly asked. Same for `git push`.

---

**Minified files are tracked in git.** `script.min.js` and `style.min.css` are committed (removed from `.gitignore`). Pre-commit hook runs `minify.sh` automatically.

**Why:** Files need to be in the repo so they deploy correctly and are always in sync.

---

**deploy.sh is gitignored.** Don't try to `git add deploy.sh` — it will fail.
