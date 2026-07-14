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
  `tests/hamlet-grounding.mjs` (engine v2 hamlet place-node grounding).
- End-to-end: `node tests/real-export.mjs` runs `script.js` itself (no build
  step) headless and writes a real SVG to `exports/` (a committed "trail").
  It hits live Overpass if the local cache isn't running, so it can be slow.
  Needs a webserver serving the repo at `/mapexport/` on `:8080` with PHP
  support for `cache.php` — `lamp start` on Coen's machine, or plain
  `php -S` anywhere else (see `memory/reference_lamp_server.md`).

## Conventions worth preserving

- Roads render in two passes — **all** casings, then **all** fills — so junctions
  stay seamless. Within each pass, paths are sub-grouped by `highway=` class and
  ordered alphabetically. Do not pair casing+fill per street.
- Don't auto-deploy — see the Deploy section above. `minify.sh` (root) is
  gitignored.
