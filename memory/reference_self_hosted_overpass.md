---
name: Self-hosted Overpass (Europe-only)
description: Hardware, cost and difficulty of running a private Europe-only Overpass API server — future option, not currently planned
type: reference
---

Investigation (June 2026) into running a **private, Europe-only Overpass server**
instead of relying on public endpoints. Parked as a future option for when the
tool matures (e.g. USE-IT Europe support). NOT in the current implementation
plan — the near-term fix is the 3 reliability "wins" (timeout-quarantine,
liveness/latency probe, status-based wait times). A private server would slot in
later as the **prioritized primary, with public endpoints as automatic fallback**
(reuses the same ranked-endpoint mechanism from win #2).

## Why it fits this tool
- App already speaks OverpassQL → **drop-in endpoint swap**, zero query changes.
  Just point `OVERPASS_ENDPOINTS` (script.js) at the private URL.
- Bounded region (Europe) + no need for live OSM freshness for map rendering.
- No rate limits / 429s / shared-server timeouts; ~30ms latency from an EU host.

## Software + data
- Same `osm-3s` software the public servers run. Easiest path: the
  **`wiktorn/overpass-api` Docker image** + docker-compose.
- Europe-only ⇒ **init from a Geofabrik extract** (not clone — clone only gives
  the full planet from a clone source).
  - Import `europe-latest.osm.pbf` — **32.2 GB** (June 2026).
  - Update from Geofabrik's `europe-updates/` diff directory (a regional DB must
    be fed its region's diffs, NOT the planet replication URL).

## Hardware (Europe-only, lean config)
| Resource | Figure |
|---|---|
| Disk | DB ≈ **80–150 GB** without attic/meta. Budget a **250 GB NVMe SSD** for DB + intermediate `.osm.bz2` (deletable after import) + diffs + headroom. Query speed is disk-cache bound — SSD matters. |
| RAM | Official min 4 GB (planet floor). Import is the memory-hungry phase; for a 32 GB Europe PBF want **16–32 GB** to avoid swap-thrash. |
| CPU | Barely matters for queries; 4 cores plenty. |

Key lever: street-map rendering needs **neither attic data (history) nor meta
(changeset/user/timestamp)**. Disabling both (`OVERPASS_META=no`, no attic) keeps
it ~100 GB instead of the planet's 500 GB–2 TB. Attic is what blows the planet to 2 TB.

## Effort + time
- Setup: low. docker-compose with `OVERPASS_PLANET_URL` (Geofabrik Europe PBF),
  `OVERPASS_DIFF_URL` (Geofabrik Europe updates), `OVERPASS_META=no`,
  compression `lz4`/`gz`; then `docker compose up`.
- Initial import: the slow part, **~half a day to a day** on a decent SSD. One-time.
- Updates: hourly/daily via `OVERPASS_UPDATE_SLEEP`. For a map tool, freshness is
  optional — could skip updates and re-import every few months.

## Two browser-specific integration gotchas
The app runs client-side and queries cross-origin, so the private server must
match what the public ones already do:
1. **HTTPS** — mapexport is served over https, so the endpoint must be https too
   (mixed-content block otherwise). Needs a reverse proxy (Caddy/nginx) + cert.
2. **CORS** — must send `Access-Control-Allow-Origin`. The bundled Apache config
   doesn't always set it; add it at the proxy. (All public endpoints tested send `*`.)

## Hosting + cost
- Hetzner fits well: EU-based, NVMe, cheap, low latency to NL. ~16 GB RAM +
  250 GB volume, or a small NVMe dedicated. Roughly **€15–45/month**.
- AWS Marketplace has a prebuilt Overpass AMI (pricier) if you'd rather not assemble it.

## Sources
- https://overpass-api.de/full_installation.html
- https://wiki.openstreetmap.org/wiki/Overpass_API/Installation
- https://download.geofabrik.de/europe.html
- https://github.com/wiktorn/Overpass-API
- https://madflex.de/selfhost-overpass-api/

## Endpoint benchmark snapshot (June 2026)
From a NL machine, small real query, best of 3 runs. Informs the roster in the
plan (`overpass-api.de` primary, `overpass.openstreetmap.fr` fallback; the two
mirrors currently in script.js are dead):

| endpoint | scope | /api/status | CORS | best total | data |
|---|---|---|---|---|---|
| overpass-api.de | global | full (slots + exact wait) | `*` | 0.34s | ok |
| overpass.openstreetmap.fr | global | 404 (none) | `*` | 0.79s | ok |
| maps.mail.ru (VK) | global | no throttle | `*` | 0.51s | ok (Russian-operated; avoid by default) |
| overpass.private.coffee | global | dead | — | — | in script.js, DROP |
| overpass.kumi.systems | global | dead | — | — | in script.js, DROP |
| overpass.osm.ch | CH only | none | `*` | 0.34s | regional |
| overpass.atownsend.org.uk | GB/IE only | no throttle | `*` | 0.29s | regional |
| overpass.maprva.org | VA only | no throttle | `*` | 1.19s | regional |
| ethiopia.overpass.openplaceguide.org | ET only | no throttle | `*` | 0.24s | regional |

Only **overpass-api.de** returns usable slot/wait data (`Rate limit: N` +
`N slots available now` + `Slot available after: …, in N seconds`). Others either
have no status endpoint or report `Rate limit: 0` (no throttling → nothing to wait on).
