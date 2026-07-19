# Pinned Overpass cache — 7 test areas

Snapshot (2026-07-18) of the `cache/` entries for the seven
`tests/real-export.mjs` areas (tilburg, ghent, paris, bremerhaven, oulu,
nievre, erfurt), including the padded `block_buildings` variants.

`cache.php` expires top-level cache files 7 days after their mtime (lazy on
read + a periodic sweep), but its globs only scan `cache/*.json.gz` /
`cache/*.json` — this subdirectory is never swept or expired.

Restore after a TTL lapse (plain `cp` sets a fresh mtime, which resets the
7-day clock):

    cp cache/pinned/*.json.gz cache/

Note: keys embed a query hash, so entries here stop matching live requests
when a layer query changes; they stay useful for offline scripts that read
the files directly.
