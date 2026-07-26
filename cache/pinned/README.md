# Pinned Overpass cache — 7 test areas

Never-expiring snapshot of the `cache/` entries for the seven
`tests/real-export.mjs` areas (tilburg, ghent, paris, bremerhaven, oulu,
nievre, erfurt): all 10 `EngineV2.layers` fetchable layers per city, 70 keys
total, including the padded `block_buildings` variants.

`cache.php` reads this directory directly. Entries here never expire and are
never swept, and a pinned entry answers any GET (and `?exists=` probe) whose
live `cache/` copy is missing or past the 7-day TTL. So the validation exports
run offline indefinitely and only reach Overpass when someone asks them to.

Manage it with `tools/pin-cache.sh`:

    tools/pin-cache.sh status    what is pinned, what is live, what is missing
    tools/pin-cache.sh pin       copy the current live entries into pinned/
    tools/pin-cache.sh refresh   re-fetch all 70 keys from Overpass, then pin

`refresh` writes a `.disabled` marker here while it runs, which makes
`cache.php` ignore pinned entries so the fetch really goes out; it is removed
again afterwards, including on Ctrl-C. If you ever find a stray `.disabled`,
delete it — the never-expiring cache is off while it exists.

The key list comes from `tools/prefetch-validation-cache.mjs --list-keys`,
derived from `script.js`/`engine-v2.js`, so it follows layer and query changes
rather than being a second hardcoded copy. Keys embed a query hash: when a
layer query changes, the old entries here stop matching live requests and
`tools/pin-cache.sh status` reports the new keys as unpinned. That is the
signal to run `refresh`.

History: snapshot taken 2026-07-23, after the 2026-07-18 one went stale two
ways (it predated the `transit_stops` layer from `fbc4db3`, and the prefetch
tool's own layer-count guard was hardcoded to the old count, so nobody could
regenerate it until the guard was fixed). Until 2026-07-26 the snapshot was
inert — this README told you to `cp` it back by hand, which nobody did, so
every validation export quietly went to Overpass again once the TTL lapsed.
