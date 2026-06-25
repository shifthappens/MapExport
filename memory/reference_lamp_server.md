---
name: lamp-local-server
description: Local LAMP stack CLI — use `lamp start` instead of python http.server for PHP cache support
metadata:
  type: reference
---

Coen's machine has a local LAMP stack (Homebrew) controlled via the `lamp` CLI:

```
lamp start|stop|restart|status|test|logs|mysql
```

- Apache: `http://localhost:8080` (docroot `~/Sites`)
- MySQL: `127.0.0.1:3306` (root, no password)
- PHP 8.5 via mod_php

**How to apply:** always use `lamp start` (and `http://localhost:8080/mapexport/`)
instead of `python3 -m http.server` or the PHP built-in server. This serves through
Apache+mod_php, so `cache.php` works — cached Overpass responses are reused on
re-export, making iterative testing much faster.

The `.claude/launch.json` has a "MapExport (PHP)" config on port 8889 using PHP's
built-in server. That also works for cache, but `lamp` on 8080 is the canonical local
dev environment and should be preferred.

Details: `~/Sites/scripts/lamp-stack.md`.
