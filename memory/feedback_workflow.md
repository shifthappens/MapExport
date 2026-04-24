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

---

**Check your environment before assuming local tools are available.** Claude Code sessions started from the iOS app (or any server-based sandbox) run on a remote VM, not the user's local machine. In that environment:
- `minify.sh` will not exist — do not expect the pre-commit hook to work
- `script.min.js` will be stale (the copy in git, not freshly built)
- `deploy.sh` will not exist
- The user's local worktree (with all local tooling) is separate

To detect this: check whether `minify.sh` exists (`ls /home/user/MapExport/minify.sh`), or look at timestamps (`ls -la script*.js` — if `script.min.js` is older than `script.js`, it's stale). If stale, note it to the user and let them rebuild locally — do not try to install terser or a minifier yourself.
