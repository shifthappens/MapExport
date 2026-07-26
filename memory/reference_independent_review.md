---
name: Independent review route
description: How to run the E2/O independent review in either direction, Claude reviewing or Codex reviewing, and the rules that make it pay
type: reference
---

`AGENTS.md` defines an E2/O review tier with a profile on each side:
`.codex/agents/sol_reviewer.toml` and `.claude/agents/reviewer.md`. Either can
review the other's work. This file is how to invoke them and what the first
real run (2026-07-26) taught.

Everything below was verified against the installed CLIs on that date
(`codex-cli 0.145.0`, `claude 2.1.220`). Flags move; recheck `--help` if a call
behaves unexpectedly.

## The rules, whichever side reviews

These are where the value came from. The invocation is the easy part.

- **Review before pushing, not after.** The 2026-07-26 run found two shipped
  defects in work already pushed and reported as verified. A review never needs
  the commit to exist.
- **State the evidence you already have** in the brief: which checks ran and
  what they returned. This is what keeps the reviewer on the code instead of
  re-deriving your test results, and it kept the false-positive rate near zero.
- **Resume the session for follow-up rounds.** A cold start re-reads
  `AGENTS.md`, the binding design doc, the source and the whole diff every
  time. Six cold rounds cost roughly 780k tokens, most of it re-derivation.
- **Point it at the tests from round one.** Two of five rounds went on fixtures
  that reached none of the code they claimed to cover. Ask directly: for each
  test, which production line breaks if you delete it?
- **Set a severity floor.** "Analyse Medium and above, note Low in one line."
  Round five spent 213k tokens on two findings.
- **Say "do not invent findings to fill space."** Without it, a reviewer asked
  for another round will usually produce one.
- **Check its corrections.** One round-4 correction was itself partly wrong.
  Verify against the code before rewriting on the reviewer's say-so, and say so
  when it is mistaken.
- **Stop when severity drops, not when findings stop.** Rounds 1 to 4 found
  production defects; round 5 found a concurrency issue in a manually-run
  script and some weak fixtures; round 6 found nothing.

## The brief

```text
Act as MapExport's independent E2/O reviewer (<the profile for that side>).
Read AGENTS.md and <binding design doc> first.

Unit: <commit range, or "the working tree">
What changed and why: <short, one bullet per change>
Focus, in order: <the specific risks worth its attention>
Evidence already gathered, do not re-run: <checks and their results>
Read-only. Findings first, ordered by severity, with file:line. Distinguish
confirmed defects from questions. Analyse Medium and above; note Low in one
line. If nothing material remains, say so plainly and say what you did not
verify. Do not invent findings to fill space.
```

## Route A: Claude reviews (callable from a Codex session or any shell)

`claude` is on PATH. Pin the session id yourself so follow-up rounds are
deterministic rather than "whatever ran last":

```sh
SID=$(uuidgen | tr 'A-Z' 'a-z')
claude -p --session-id "$SID" --agent reviewer \
  --model opus --effort high \
  --permission-mode plan --max-budget-usd 5 < brief.md
```

Follow-up rounds:

```sh
claude -p --resume "$SID" --max-budget-usd 3 < followup.md
```

`--agent reviewer` loads `.claude/agents/reviewer.md` directly, so its tools and
`effort: high` come from the tracked profile instead of the command line.
`--permission-mode plan` is the closest thing to a read-only guarantee, but note
it is a permission layer, not a sandbox: the agent has `Bash`, so read-only is
partly a matter of the profile's own instructions.

For findings you want to parse rather than read, ask for structured output:

```sh
claude -p --resume "$SID" --output-format json --json-schema '{
  "type":"object","properties":{"findings":{"type":"array","items":{
    "type":"object",
    "properties":{"severity":{"type":"string"},"file":{"type":"string"},
                  "line":{"type":"integer"},"summary":{"type":"string"}},
    "required":["severity","file","line","summary"]}}},
  "required":["findings"]}' < followup.md
```

Do not use `--bare` or `--safe-mode` here, for two reasons. A review wants
`CLAUDE.md` and `AGENTS.md` loaded and both flags suppress them; and `--bare`
also forces authentication to `ANTHROPIC_API_KEY`/`apiKeyHelper`, never reading
OAuth or the keychain, which switches billing off the subscription.

**Billing.** Which pool a run draws on is decided by authentication, not by any
flag. Check it, for free, with:

```sh
claude auth status
```

`"authMethod": "claude.ai"` with a `subscriptionType` means the run comes out of
the Claude subscription. An `ANTHROPIC_API_KEY` in the environment, an
`apiKeyHelper` in settings, or `--bare` moves it to metered API billing instead.
Coen's setup is subscription (Pro, first-party, no key set) and should stay
that way. For headless use that still bills the subscription, `claude
setup-token` issues a long-lived token.

`--max-budget-usd` is documented as a cap on "API calls". It is **not** a way to
choose the billing pool, and whether it acts as a brake at all under
subscription auth is unverified. Treat the real cost controls as: resume rather
than restart, set a severity floor, and cap the number of rounds.

## Route B: Codex reviews (callable from a Claude session)

`codex` lives in `~/.local/bin`, already on PATH via the
`. "$HOME/.local/bin/env"` line in `~/.zshrc`. If it is missing entirely,
reinstall with `curl -fsSL https://chatgpt.com/codex/install.sh | sh`. (A
`codex` binary is also bundled inside `ChatGPT.app`; ignore it, different
build.)

`codex exec` **cannot** select a `.codex/agents/*.toml` profile, so spell the
reviewer's settings out and feed the brief on stdin:

```sh
codex exec -m gpt-5.6-sol -c model_reasoning_effort=medium \
  -s read-only --skip-git-repo-check - < brief.md
```

Follow-up rounds resume the most recent session for this cwd:

```sh
codex exec resume --last - < followup.md
```

`-s read-only` is a real filesystem sandbox, which is stronger than Route A's
permission mode, but it also blocks any test that creates a temp directory.
`tests/pin-cache.mjs` fails there with EPERM, so that whole script went
unverified by execution in every round of the 2026-07-26 run. Either give it a
writable sandbox for the round that needs it, or run those tests yourself and
hand over the output.

## Choosing a side

Neither is strictly better; they fail in different places.

- Codex enforces read-only with a sandbox. Claude enforces it with permissions
  and the profile's instructions.
- That same sandbox is why Codex could not execute part of what it reviewed.
  Claude can run the suite it is reviewing.
- Claude selects the tracked reviewer profile with `--agent`; Codex cannot, so
  its settings live on the command line and can drift from the tracked profile.
- Claude gives deterministic session ids and schema-validated output
  (`--json-schema`). `codex exec` has neither, and its findings arrive after
  whatever file content it printed, so they need fishing out of the tail.
- Billing differs and neither has a real spend cap. Claude runs on the
  subscription (see Route A), Codex on whatever the ChatGPT account provides.
  Cost is controlled by resuming, a severity floor and a round limit, not by a
  flag.

**Measured quality:** only Route B has been run in anger on this repo, over
`c1e57fb`/`3328310`, five rounds, every finding real. Route A's mechanics are
verified but its review quality on this codebase is not yet measured. Reviewing
across vendors is the point of the tier, so prefer whichever side did not write
the code.

## Worked example

The 2026-07-26 run (Route B) reviewed the AF-07f green mass gate and the pinned
cache. Findings, all real: bridging measured between sampled points instead of
edges, a missing containment case, green mapped twice counting its area twice, a
0.7% unit mismatch between two area measures, a spatial grid filling bounding
boxes instead of walking lines (Bremerhaven 94 ms to 31 ms), `pin-cache.sh
refresh` refetching nothing, and pin validation reading only the first 4 KB. See
commit `2fdac60` and the review section of `plans/ACTIVE.md` at that date.
