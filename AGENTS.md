# AGENTS.md — working notes for AI assistants on MapExport

MapExport is a browser-based tool that turns OpenStreetMap data into
publication-ready, layered SVG city maps for USE-IT travel guides. See
`README.md` for architecture, `ENGINE-V2.md` for the v2 engine's binding
design contract (coverage promise, complement rule, paint order — read it
BEFORE touching `engine-v2.js`), `MEMORY.md` for the curated memory index,
and `plans/` for implementation plans (dated files; the **Status** line at
the top of each says whether it is ready to implement, in progress, or
retired).

## Resumable work — usage limits are not blockers

- For maintenance-sprint work, read `plans/ACTIVE.md` first. It is the small,
  current handoff checkpoint; the linked roadmap remains the source of truth
  for scope and acceptance criteria.
- A user message such as **“continue”**, **“resume”** or **“ga door”** means:
  inspect `plans/ACTIVE.md`, verify it against `git status`/the actual diff,
  then continue its `Next action` without asking the user to restate context.
- On resume, read only the linked sprint goal and active task section; do not
  reread the full roadmap or repository unless the checkpoint proves stale.
- Prefer finishing one task or named subtask inside one session. If a usage
  limit approaches, stop at a coherent, preferably testable checkpoint and
  update `plans/ACTIVE.md` before yielding.
- Keep the checkpoint short and overwrite current fields; do not append a
  session diary. Record only progress that cannot be inferred safely from the
  code/diff: active unit, completed checkpoint, next action, changed files,
  latest checks and blockers/decisions.
- Update the checkpoint only when starting a unit, reaching a material
  checkpoint, completing it, or handing off. The roadmap checkbox and sprint
  status change only when their stated definition is actually met.

## The seven validation areas are pinned — do not refetch them

- `cache/pinned/` is a tracked, never-expiring snapshot of all 70 Overpass keys
  for the seven `tests/real-export.mjs` cities. `cache.php` serves it whenever
  the live `cache/` copy is missing or past its 7-day TTL, so validation exports
  run offline and hit Overpass zero times. A full seven-city sweep takes minutes.
- Check it with `tools/pin-cache.sh status`. If every key is pinned, a slow or
  failing export is **not** a cache-warming problem — diagnose something else.
- Only `tools/pin-cache.sh refresh` fetches new data, and it is Coen's call.
  Never run it, or any bulk Overpass refetch of these areas, unasked.
- After a layer query changes, its keys change too and `status` reports them as
  unpinned. Report that; do not silently refresh.

## Background Overpass cache warming — rate limits are not blockers

This applies to areas that are **not** pinned (new cities, ad-hoc bboxes, or a
refresh Coen explicitly asked for). For the seven validation areas, see above.

- When current validation-area cache gaps block exports or visual gates,
  delegate the network wait to the cheapest adequate background agent. The
  orchestrator keeps ownership of design, review and the eventual exports; a
  cache warmer only fills validated cache entries and reports evidence.
- Use `node tools/prefetch-validation-cache.mjs` rather than looping full
  exports. It checks the local cache first, derives current v2 queries/keys from
  source, and fetches only missing entries for the seven validation cities.
- Keep public-API traffic strictly sequential: one request at a time, no
  parallel city workers. Each live attempt gets a 30-second client/server
  timeout, followed by a 10-second cooldown. Rotate endpoints and round-robin
  failed keys until all are confirmed or 60 minutes of wall time elapse.
- A first 429, 504, timeout or endpoint outage is expected background state,
  not a sprint blocker. Do not stop after one bounded failure; stop only when
  the cache is complete, the one-hour deadline is reached, or the user cancels.
- Cache only a valid HTTP 200 Overpass JSON envelope with `elements` as an
  array (an empty array is valid). Confirm the local cache hit after each write.
  Never cache proxy/error pages, never use `--record`, and never run deploys or
  pushes from the warmer.
- Once warming finishes, the orchestrator verifies the gap inventory, pins the
  current seven-city corpus when appropriate, then runs the actual city exports
  sequentially. Record only the final success set or remaining keys in
  `plans/ACTIVE.md`, not a retry diary.

## Cost-aware delegation

The primary/high-capability model is the **orchestrator**. It owns problem
framing, architecture, product/security decisions, decomposition, acceptance
criteria, integration and final review. It should delegate bounded execution
to the cheapest currently available agent that is still adequate for the
risk and ambiguity of that unit.

Use capability tiers rather than hard-coded model names; model availability,
prices and strengths change:

- **E0 — mechanical executor (cheapest):** repository searches, inventories,
  running deterministic checks, fixture generation, documentation sync and
  tiny edits whose exact transformation and expected result are already given.
- **E1 — scoped implementer:** a localized bugfix or test implementation with
  clear interfaces, files, acceptance criteria and no unresolved architecture.
- **E2 — specialist:** security-sensitive, geometry-heavy, concurrency/state,
  cross-engine or broad refactor work that requires substantial code judgment.
- **O — orchestrator:** design and decisions, ambiguous tradeoffs, task routing,
  review/integration and user-facing sign-off. O may implement directly when a
  unit cannot be isolated safely or delegation overhead would cost more than
  the work.

Current project-scoped Codex profiles live in `.codex/agents/` and implement
these tiers for runtimes that support custom-agent selection:

- `luna_mechanical` (`gpt-5.6-luna`, low reasoning) is the default E0 route.
- `terra_worker` (`gpt-5.6-terra`, medium reasoning) is the default E1 route
  and may handle a tightly bounded E2 unit after O has settled every design
  decision.
- `sol_reviewer` (`gpt-5.6-sol`, high reasoning, read-only) is the independent
  E2/O review route. The primary model remains responsible for orchestration,
  integration and user-facing sign-off.

The equivalent Claude Code subagents live in `.claude/agents/` and implement
the same tiers, so a Claude session delegates by name just as a Codex one does:

- `mechanical-executor` (Haiku) is the E0 route — the counterpart of
  `luna_mechanical`.
- `scoped-implementer` (Sonnet, `effort: medium`) is the E1 route — the
  counterpart of `terra_worker`.
- `reviewer` (Opus, read-only, `effort: high`) is the E2/O review route — the
  counterpart of `sol_reviewer`.

Both sets are the same three tiers expressed in each runtime's own config
format (Codex TOML vs. Claude Markdown); keep them in step when a tier's role
changes. Codex encodes reasoning strength as `model_reasoning_effort`; the
Claude counterpart is the subagent `effort:` field (`low|medium|high|xhigh|max`,
adaptive reasoning), set to mirror the Codex level on the tiers whose model
supports it — Sonnet and Opus here. Haiku has no `effort` knob, so the E0 route
relies on model choice alone (it is already the lowest tier). Neither runtime
exposes a per-subagent *extended-thinking* budget: in Claude Code extended
thinking is a session-level on/off that subagents inherit, not something an
agent file can set. The orchestrator (O) is whichever primary model is driving
the session and needs no profile of its own.

Treat this mapping as a current implementation of the stable capability tiers,
not as a permanent preference for those model names. Use it only when the
runtime exposes the named profile and the account provides its configured
model; otherwise execute directly or choose the cheapest available equivalent.
Agent files are loaded when a Codex session starts, so restart or open a new
session after changing them.

Choose the lowest tier with enough capability, not merely the lowest token
price. Estimate total cost: worker context + execution + orchestrator review +
likely rework. Escalate a unit when an executor reports ambiguity or fails its
acceptance criteria; do not let a cheaper agent invent architecture or widen
scope.

Every delegation brief must state only what the worker needs:

```text
Unit: <ME-XX or subunit>
Objective: <one bounded outcome>
Allowed scope: <files/functions>
Do not change: <adjacent behavior/files>
Acceptance: <observable criteria>
Checks: <exact commands or evidence>
Return: <diff summary, checks, questions/risks>
```

The orchestrator inspects the returned diff and test evidence before accepting
it. Workers do not mark roadmap tasks complete or edit `plans/ACTIVE.md` unless
explicitly assigned that bookkeeping; the orchestrator normally owns both.
Never run agents with overlapping write scope in parallel. Read-only research
may run in parallel when it reduces total cost without duplicating context.

## Token-efficient execution

- `.codex/config.toml` caps stored tool output, compacts long conversations, and
  limits agent fan-out for this repository. Keep these shared defaults aligned
  with the project-scoped Codex agent profiles when their runtime behavior
  changes.
- Keep context lean without skipping evidence: prefer targeted searches and
  bounded file reads, cap noisy command output, and do not reread context that
  the current task has already established.
- Workers return distilled findings and check results, not raw logs or a repeat
  of the delegation brief. The orchestrator requests follow-up evidence only
  where it affects acceptance or risk.
- Do not lower the reasoning tier solely to save tokens. Route work to the
  lowest tier that can meet its acceptance criteria, and preserve high effort
  for reviews or decisions where it protects quality.

## ⚠️ Changelog is mandatory

**Every commit that adds, changes, or removes a feature or behaviour MUST add an
entry to the top of the "Unreleased" section in `CHANGELOG.md`, in the same
commit. Newest entries go at the top.** Keep entries short and user-facing.
Pure-internal churn (formatting, comment typos) is exempt. The maintenance
rule is restated at the top of `CHANGELOG.md` itself.

## Source-of-truth & build

- `script.js` is canonical, and `index.html` loads `script.js` / `style.css`
  **directly, always — dev, tests, and this repo have no build step.**
  `script.min.js` and `style.min.css` are **generated and gitignored — never
  committed, never hand-edited, and never needed to run or test the app.**
  The ONLY thing that ever builds them is the GitHub Actions deploy workflow
  (production, see Deploy below) — nothing in `tests/` builds or reads them.
  Don't take code style or naming cues from these files if you ever see
  them — they're compressed/mangled build output, not something anyone
  writes or reads; write source-quality code in `script.js`.
- To build them manually anyway (e.g. to sanity-check the minifier itself):
  **`bash tools/minify.sh`** (or `tools/minify.sh js` / `css`). It uses terser
  for JS and clean-css for CSS, preferring global installs and falling back
  to `npx`. Delete the output afterwards — these files should only ever exist
  on the production server, never in a local checkout.
- **Install the git hooks once per clone: `bash tools/setup-hooks.sh`.** This
  points `core.hooksPath` at the tracked `.githooks/`. The `pre-commit` hook
  only **enforces the changelog rule below** — it blocks commits that touch app
  source (`script.js`, `style.css`, `index.html`, `cache.php`) without a staged
  `CHANGELOG.md`. Pure-internal churn can bypass with `SKIP_CHANGELOG=1 git
  commit`. It does not minify anything.
- The tracked build lives in `tools/`. Any personal root-level `minify.sh` is
  gitignored and superseded — prefer `tools/minify.sh`.

## Deploy

- **Deploy is a GitHub Actions workflow, not a local script:**
  `.github/workflows/deploy.yml`, `workflow_dispatch` only (never auto-deploys
  on push). Run via the Actions tab or `gh workflow run deploy.yml` — the
  latter needs only `gh` auth, so it works from a Codex mobile session
  too. It builds `script.min.js`/`style.min.css` fresh, rewrites a production
  `index.html` to point at them (the repo's own keeps pointing at source, for
  dev), and rsyncs to the server.
- **Never trigger a deploy unless the user explicitly asks for it** ("deploy"),
  same as running `deploy.sh` or `git push` before.
- The server-side account used is a **restricted, non-root user**
  (`mapexport-deploy`) that can only touch the handful of files it needs to —
  it can't reach `cache/` (protected by a sticky bit on the parent directory)
  or anything outside the app directory, and has no sudo. Credentials live
  only in GitHub Secrets (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`,
  `DEPLOY_PATH`), never in the repo. Full rationale and setup details in
  `memory/reference_deploy.md`.
- **Gotcha:** `rsync -a` re-syncs the deploy directory's own permissions from
  the plain local repo root as a side effect, which silently wipes that
  sticky bit. The workflow has an explicit `chmod 1755` step after every sync
  to re-assert it — don't remove that step, and re-check it if the rsync
  steps in `deploy.yml` ever get restructured.
- `deploy.sh` at repo root (gitignored) is just a thin wrapper around
  `gh workflow run` for convenience from a local checkout — it no longer does
  the rsync itself.

## Testing

- Offline (no network): `node tests/road-merge.mjs`, `tests/abbreviate.mjs`,
  `tests/supersession.mjs`, `tests/pipeline-equivalence.mjs`,
  `tests/sea-sign.mjs` (engine v2 coastline→sea geometry),
  `tests/hamlet-grounding.mjs` (engine v2 hamlet place-node grounding),
  `tests/v2-cutterless-coverage.mjs` (engine v2 roadless-frame coverage promise,
  orchestration-level: fake worker),
  `tests/overpass-fetch.mjs` (shared Overpass timeout/failover/abort contract,
  mocked fetch),
  `tests/cache-php.mjs` (cache.php limits/validation/atomic writes — needs a
  `php` CLI; spins up its own `php -S` on localhost, no network beyond that),
  `tests/pin-cache.mjs` (tools/pin-cache.sh: pin validation, atomic pinning,
  and refresh/stash recovery — runs the real script against a throwaway repo
  with a stub prefetcher, no network).
- Needs ClipperLib (CDN, cached in the OS temp dir like `real-export.mjs`; runs
  offline once warm, else SKIPs): `tests/v2-cutterless-worker.mjs` runs the real
  face worker on an empty frame and asserts a full-frame `fallback` face — the
  end-to-end half of the ME-03 coverage promise.
- End-to-end: `node tests/real-export.mjs` runs `script.js` itself (no build
  step) headless and writes a real SVG to `exports/` (a committed "trail").
  It hits live Overpass if the local cache isn't running, so it can be slow.
  Needs a webserver serving the repo at `/mapexport/` on `:8080` with PHP
  support for `cache.php` — `lamp start` on Coen's machine, or plain
  `php -S` anywhere else (see `memory/reference_lamp_server.md`).
- The `exports/` trail is kept thin automatically. Trail files are named by
  date only — `map-<preset>-<city>[-v2]-YYYY-MM-DD.svg` — so a same-day
  re-export overwrites one snapshot per city rather than piling up (the naming
  lives in `tests/real-export.mjs`; the web app's user downloads deliberately
  keep the full `HH-MM-SS` timestamp and are unchanged). `tools/prune-exports.sh`
  then reduces the trail to the newest 3 SVGs per city — kept by count, not
  age, so a quiet city still has snapshots to compare against — and
  `.github/workflows/prune-exports.yml` runs it daily (and on demand),
  committing the pruning to `main`. **Standing policy (Coen, 2026-07-14,
  revised 2026-07-23: keep 3 per city instead of 1): after a sweep, commit the
  newest 3 SVGs per city by default** — stage the latest date-stamped files
  for each city and `git rm` anything beyond the 3 newest (the same shape the
  prune job enforces), so the trail moves forward with the work instead of
  waiting on the daily job. Don't hand-commit large batches of intermediate
  exports beyond that per-city set. (git history still retains every blob;
  the prune only trims the tree.)

## Conventions worth preserving

- Roads render in two passes — **all** casings, then **all** fills — so junctions
  stay seamless. Within each pass, paths are sub-grouped by `highway=` class and
  ordered alphabetically. Do not pair casing+fill per street.
- Don't auto-deploy — see the Deploy section above. `minify.sh` (root) is
  gitignored.

## Communicating with Coen

- **Standing preference (Coen, 2026-07-17): explain in plain English by
  default.** When summarizing work, answering a question, or walking through a
  change, prefer everyday language over jargon; when a technical term is
  unavoidable, say what it means in a few words. Keep this out of code comments
  and commit messages (those stay precise/technical) — it is about how work is
  explained back to Coen in chat.
