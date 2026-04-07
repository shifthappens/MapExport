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
