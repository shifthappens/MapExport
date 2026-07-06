---
name: Deploy target
description: GitHub Actions + SSH/rsync deployment details for mapexport live server
type: reference
---

**Deploy is now a GitHub Actions workflow (since 2026-07-06):
`.github/workflows/deploy.yml`, trigger `workflow_dispatch` only (never
auto-deploys on push).** Run it via the GitHub UI (Actions tab -> "Deploy to
coen.at" -> Run workflow) or `gh workflow run deploy.yml --repo
shifthappens/MapExport` — the latter needs only `gh` auth, no local SSH key,
so it works fine from a Claude Code mobile session. `deploy.sh` at repo root
(gitignored) is now just a thin wrapper that calls `gh workflow run` and
watches it; it no longer does the rsync itself.

**Why it moved out of a local-only script:** the old `deploy.sh` hardcoded
`root@142.93.135.135` — fine to keep off a *public* repo, but that also meant
only Coen's laptop (with `~/.ssh/Andromeda_ed25519`) could ever deploy. Moving
the logic into a workflow file (safe to commit — no secrets in it) and the
real credentials into encrypted GitHub Secrets keeps the public repo clean
while making deploy triggerable from anywhere with `gh` access.

**Restricted deploy user (since 2026-07-06), not root:**
- Server: `142.93.135.135` (Ubuntu 24.04)
- Deploy user: `mapexport-deploy` (uid 1000) — created specifically for this,
  password login locked, key-only.
- Remote path: `/var/www/html/domains/coen.at/public_html/mapexport/`
- This user owns *only*: the `mapexport/` directory entry itself, and inside
  it `index.html`, `script.min.js`, `style.min.css`, `cache.php`, `fonts/`.
  It does **not** own `cache/` (stays `www-data:www-data`, mode 775, untouched
  by deploys) and has no sudo, can't read `/root`, can't touch anything
  outside this one directory.
- The parent `mapexport/` directory has the **sticky bit** set (`chmod
  1755`) — even though the deploy user owns that directory (and could
  otherwise delete/rename any entry inside it, including `cache/`), the
  sticky bit restricts deleting/renaming entries to their own owner (or
  root). This is the same protection `/tmp` uses, and was added specifically
  so a future rsync misconfiguration (e.g. an accidental `--delete-excluded`)
  can't take out the live cache directory.
- Rationale for a dedicated restricted user over reusing the root key: if the
  `DEPLOY_SSH_KEY` GitHub secret ever leaked (malicious PR, compromised
  runner), the blast radius is one directory on the server, not full root.
- **Gotcha found on the very first live run:** `rsync -a` syncs the *target
  directory's own* permissions from the local repo root (plain `755`) as a
  side effect of the main sync, silently wiping the `1755` sticky bit back to
  `755` every single deploy. The workflow has an explicit `chmod 1755
  "$DEPLOY_PATH"` step after both rsync calls to re-assert it every run —
  never rely on the sticky bit "just staying set" after adding/changing rsync
  steps.
- The original root key (`~/.ssh/Andromeda_ed25519`) still exists locally and
  still works for manual admin SSH access — it was never removed from the
  server, only no longer used for routine deploys.
- GitHub Secrets set on `shifthappens/MapExport`: `DEPLOY_SSH_KEY` (the
  mapexport-deploy private key), `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`.
  The private key was generated fresh, its public half installed in
  `~mapexport-deploy/.ssh/authorized_keys` on the server, and the private
  half uploaded straight to `gh secret set` — never displayed inline or kept
  in a repo file.

**Whitelist, not blacklist.** The workflow's rsync uses
`--include=/script.min.js --include=/style.min.css --include=/cache.php
--include=/fonts/ --include=/fonts/** --exclude=*` — only those get synced;
`index.html` is handled by a second rsync call (it's rewritten via `sed` from
the repo's dev version first — see [[minified-files-gitignored]]). Everything
else (docs, `tests/`, `tools/`, `.githooks/`, `exports/`, `plans/`,
`script.js`, `style.css`, dotfiles, ...) never leaves the runner, without
needing to be named as an exclude. `--delete` only touches files visible
through the filter, so `cache/` is safe from deletion by rsync too (belt and
suspenders with the sticky bit above).

On 2026-07-06 also did a one-time manual cleanup over ssh (`rm -rf` the
specific leftover paths, not `--delete-excluded`) to remove cruft synced by
the old blacklist-based `deploy.sh` before the whitelist switch. Production
holds exactly: `cache/`, `cache.php`, `fonts/`, `index.html`, `script.min.js`,
`style.min.css`.

**mktemp permissions gotcha:** the workflow builds a production `index.html`
by `sed`-rewriting the repo's dev version (which loads `script.js`/`style.css`
directly) to point at the minified files, into a temp file, then rsyncs that
over the remote `index.html`. **`mktemp` defaults to mode 600** — without an
explicit `chmod 644` on that temp file before rsync, the deployed `index.html`
becomes unreadable by `www-data` and Apache 403s the whole site. Hit this live
once when this was still in `deploy.sh` locally; fixed by adding `chmod 644`
right after the `sed` step. Worth double-checking if this step ever moves or
gets rewritten again.
