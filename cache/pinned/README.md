# Pinned Overpass cache — 7 test areas

Snapshot (2026-07-23) of the `cache/` entries for the seven
`tests/real-export.mjs` areas (tilburg, ghent, paris, bremerhaven, oulu,
nievre, erfurt): all 10 `EngineV2.layers` fetchable layers per city (70 keys
total — see `tools/prefetch-validation-cache.mjs --dry-run`), including the
padded `block_buildings` variants.

Refreshed after the previous (2026-07-18) snapshot went stale two ways: it
predated the `transit_stops` layer added in `fbc4db3`, and
`tools/prefetch-validation-cache.mjs`'s own layer-count guard was still
hardcoded to the old count, so the prefetch tool refused to run and nobody
could regenerate this snapshot until the guard was fixed.

`cache.php` expires top-level cache files 7 days after their mtime (lazy on
read + a periodic sweep), but its globs only scan `cache/*.json.gz` /
`cache/*.json` — this subdirectory is never swept or expired.

Restore after a TTL lapse (plain `cp` sets a fresh mtime, which resets the
7-day clock):

    cp cache/pinned/*.json.gz cache/

Note: keys embed a query hash, so entries here stop matching live requests
when a layer query changes; they stay useful for offline scripts that read
the files directly.
