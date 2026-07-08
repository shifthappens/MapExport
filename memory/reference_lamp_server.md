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

**Two ports, two roles (standard workflow):** the real export / live demo ALWAYS runs
against the `lamp` Apache on **:8080** (mod_php, so `cache.php` works). The **:8889**
"MapExport (PHP)" config in `.claude/launch.json` (php -S, docroot ~/Sites) exists ONLY
for the preview MCP's visual check — the preview tool insists on owning its port and
cannot share :8080 with Apache. Do not serve the app itself on :8889.

Details: `~/Sites/scripts/lamp-stack.md`.

**Cache — verified working on local (Jun 2026):** `cache.php` stores tiles in
`cache/` (gitignored: `cache/*.json.gz`, `cache/*.json`). Apache/mod_php runs as
`User coen` / `Group staff` (Homebrew `httpd.conf`), and `cache/` is owned by
`coen:staff` 0755, so PHP can create new files — no permission changes needed.
Full cycle confirmed: `GET cache.php?key=K` returns the gzipped tile with
`X-Cache: HIT` (or body `null` on miss); `POST cache.php?key=K` writes it (204) —
a gzip body is passed through, plain JSON gets gzencoded server-side. 7-day TTL.
Cache key for an adaptive (each axis < 0.095°) bbox:
`mapexport_v3_<layerId>_<qHash>_a_<s>_<w>_<n>_<e>`; grid tiles drop `_a_` and use
`_<s>_<w>`. `qHash` is an FNV-1a36 of the layer's overpassQuery, so editing a query
silently retires its old cache. To force a refetch, delete the matching
`cache/*.json.gz`.

**Headless real-world export:** `node tests/real-export.mjs [s,w,n,e]`
(default bbox `51.545,5.07,51.562,5.1`; print size is derived from the bbox shape,
see `getPhysicalSizeMm` in `script.js`). It loads `script.js` itself (no build/
minify step — same source the browser loads) in a vm with browser stubs, runs
the app's own `fetchLayer` + `buildSVG` against the live `cache.php` (so misses
fetch Overpass and write the tile back), computes city blocks headlessly by
running `BLOCK_WORKER_SRC` in a vm with ClipperLib (cached in the OS temp
dir), and writes the result to `exports/map-<preset>-<YYYY-MM-DD-HHMMSS>.svg` (local
time; same format the web app's download uses, so same-day exports don't collide).
`exports/` is committed as a trail of progress files; the bbox is in each SVG's
`<metadata>`. Always save the SVG there when doing a live real-world test. Ready-made
fully-cached test bbox: `51.545,5.07,51.562,5.1`.

Requires a webserver at `:8080` serving this repo at `/mapexport/` with PHP
support for `cache.php` — `lamp start` on Coen's machine, or plain `php -S`
(pointed at a docroot with a `mapexport` symlink/copy of the repo) anywhere
else, e.g. in a cloud/CI environment without the `lamp` CLI or Apache. Nothing
about `cache.php` requires Apache or MySQL specifically — it's a flat
file-based cache (`cache/*.json.gz`), so PHP's own built-in server is enough.
Without a server at all, the test still runs — every tile just goes straight
to Overpass instead of through the cache.

**Faithful visual check — MANDATORY after every export (the standard test step):** never
judge an export by `qlmanage`/QuickLook PNGs — Apple's SVG rasterizer mishandles
`dominant-baseline` (label position), `paint-order` (halos) and `fill-rule` (block
holes). Use a real browser via the preview MCP on **:8889**:
  1. `preview_start "MapExport (PHP)"`.
  2. `preview_eval` navigate to
     `http://localhost:8889/mapexport/tests/viewer.html?file=/mapexport/exports/<name>.svg`
     (`tests/viewer.html` injects the SVG inline so Chrome's engine rasterizes it).
  3. **`preview_resize` AFTER the page is `ready`** (e.g. 1500x1380 for A3). Resizing
     before/at load only sets the emulation metric; resizing after load actually resizes
     the capture window. If the screenshot shows grey margins, the resize didn't take —
     restart the server and redo navigate → resize → screenshot.
  4. `preview_screenshot` → a high-res full-map overview; individual street labels are
     readable, enough to judge cartography (labels centred on roads, no overflow /
     mirroring / stray labels; both rotated `<text>` and curved `textPath` correct).
The preview's capture mode (viewport vs full-page) is inconsistent, so scroll/crop-based
1:1 zoom is unreliable — lean on the overview; for a closer look re-run with a tighter
bbox or a larger print size. `tests/real-export.mjs` prints the ready-to-use viewer URL.

**Overpass User-Agent gotcha:** overpass-api.de returns HTTP 406 for an empty/browser
(`Mozilla/...`) User-Agent; node's undici sends none, so a raw node fetch gets 406. Send
a descriptive UA (e.g. `MapExport/1.0 (+https://coen.at; hello@coen.at)`) → 200. The
test harness sets this on Overpass requests; the browser app is unaffected.

Note: shell helper functions `grep`/`ls` are aliased in Coen's zsh snapshot and can
swallow/mangle output in non-interactive runs — use `/usr/bin/grep`, `/bin/ls`,
`/bin/cp`, `/bin/rm` in scripts here.
