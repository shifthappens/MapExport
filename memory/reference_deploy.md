---
name: Deploy target
description: SSH/rsync deployment details for mapexport live server
type: reference
---

Deploy script: `/Users/coen/Sites/mapexport/deploy.sh`

- Server: `142.93.135.135`
- User: `root`
- SSH key: `~/.ssh/Andromeda_ed25519`
- Remote path: `/var/www/html/domains/coen.at/public_html/mapexport/`
- Cache dir ownership: `www-data:www-data`, mode `775`
- Excludes: `.git`, `.claude`, `.DS_Store`, `test.txt`, `cache/*.json`, `cache/*.json.gz`
- Since 2026-07-06: builds `script.min.js`/`style.min.css` via `tools/minify.sh`,
  then writes a production `index.html` (repo's own stays pointed at
  `script.js`/`style.css` for dev) to a `mktemp` file and rsyncs that over the
  remote `index.html`. **`mktemp` defaults to mode 600** — without an explicit
  `chmod 644` on that temp file before rsync, the deployed `index.html` becomes
  unreadable by `www-data` and Apache 403s the whole site. Hit this live once;
  fixed by adding `chmod 644 "$PROD_INDEX"` right after the `sed` step in
  `deploy.sh`. Worth double-checking after any future edit to that part of the
  script. See [[minified-files-gitignored]].
