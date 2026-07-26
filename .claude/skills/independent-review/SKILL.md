---
name: independent-review
description: Run the independent E2/O code review over a diff, commit range or working tree, in either direction (Claude reviewing or Codex reviewing), and iterate on the findings. Use when asked for an independent review, a second opinion on a change, or a review before committing or pushing.
---

# Independent review (E2/O tier)

`memory/reference_independent_review.md` is the source of truth for this
procedure. **Read it before the first round** and follow it; this file only
exists so the route is remembered at the moment it is needed. Do not restate
its contents here, or the two will drift.

## The short version

1. Review **before** pushing. If the work is already committed that is fine,
   but do not push first and review after.
2. Pick the side that did **not** write the code. Route A in the reference file
   is Claude reviewing, Route B is Codex reviewing. Both are one shell command.
3. Round one starts a session; every later round resumes it, so the reviewer
   keeps its context instead of re-reading the repo each time.
4. The brief names the unit, what changed and why, the risks worth its
   attention, and the evidence you have already gathered so it does not re-run
   your checks. Template is in the reference file.
5. Ask it to attack the **tests** as well as the code from round one: for each
   test, which production line breaks if you delete it?
6. Verify each finding against the code yourself before acting on it. It is
   usually right and occasionally wrong, including when it corrects you.
7. Stop when the severity drops off, not when the findings stop. Report what
   was found, what was fixed, and anything you judged not worth fixing.

## Reporting back

Relay the findings in plain English (per `AGENTS.md`), say which were real, and
be explicit when the review found defects in work already reported as verified.
That last part is the whole reason the tier exists.
