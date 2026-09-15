# Active checkpoint

- **Updated:** 2026-09-15
- **Roadmap:** `plans/2026-07-14_codebase-maintenance-priorities.md` (Sprint 3, ME-07).
- **Unit:** P9 — ME-07a offline smoke/failure paths + ME-07b scenario invariants.
- **Status:** COMPLETE. Sprint 3 is door de offline eindpoort.

## Completed checkpoint

- `bash tests/smoke.sh` is the single sequential offline command. Its network
  guard blocks external traffic, permits the cache test on localhost, fails on
  missing requirements/child errors/timeouts/signals and cleans process trees.
- Fetch outage, partial required tiles, timeouts, malformed cache data, worker
  errors and v1/v2 preview/export races have deterministic offline coverage.
- Five fixed fixtures cover compact city, coast, river/island, rural hamlet and
  rail/tram/metro through the real v2 worker/render path. They check coverage,
  order, SVG ids, road passes, water exclusion and deterministic output; shared
  v1 rules are checked where representative.
- Claude Fable 5.1 (`medium`) independently reviewed the working tree. Its two
  Medium findings (interrupt cleanup and v1 grid partial-tile reachability) were
  fixed; the follow-up found no Medium-or-higher defect.

## Latest checks

- `bash tests/smoke.sh` — PASS, exit 0 after review fixes.
- `node tests/offline-runner.mjs --selftest` — PASS.
- `node tests/export-failures.mjs` — PASS.
- `git diff --check` — PASS after completion bookkeeping.

## Next action

Start Sprint 4 / ME-08 only on an explicit follow-up; it includes human visual
sign-off and is not implied by this checkpoint.

## Constraints

No commit, push, deploy, live export or Overpass refresh was performed. Preserve
the unrelated local `cache/.ratelimit/rl_363baea9cba210af` change.
