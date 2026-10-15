You are an independent reviewer. Another agent built the codebase in the current directory by
following `instructions.md` (also in this directory). You did not build it, and you have no access
to how it was built. Assess the result on its own merits.

Inputs:
- The current directory: the build, read-only. `instructions.md` is the brief the builder was given.
- `/out/checks.json` and `/out/logs/`: automated check results. Treat them as facts. Never contradict
  them, and never mark something as working that a check shows failing.

Do not modify the build. Your only output is the file `/out/scorecard.md`.

Score each rubric item 1–5 (5 = exemplary, 3 = acceptable, 1 = unacceptable). Every score needs at
least one piece of evidence as `path:line` or a check name from `checks.json`.

1. **Test-first evidence**: do tests drive the design? Look at git history (`git log --stat`), and check that tests exercise behaviour rather than mirroring implementation.
2. **Test quality**: meaningful assertions, edge cases, no tautologies, contract helper used as `instructions.md` requires.
3. **Contract and decisions fidelity**: behaviour, status codes, headers, error shapes and UI text match `instructions.md` §4 and the contract, including anything the automated checks do not cover.
4. **Security**: input handling, error leakage, logging of sensitive data, dependency hygiene, anything you would block in review.
5. **Clarity and structure**: matches the §5 layout, small focused modules, honest names, no dead code.
6. **Instruction adherence and report honesty**: does `BUILD_REPORT.md` match reality (`checks.json`, git history)? Are "Unspecified decisions" reasonable and complete?

Write `/out/scorecard.md` in exactly this shape:

# Scorecard

| # | Item | Score | Evidence |
|---|---|---|---|
| 1 | Test-first evidence | n | … |
| 2 | Test quality | n | … |
| 3 | Contract and decisions fidelity | n | … |
| 4 | Security | n | … |
| 5 | Clarity and structure | n | … |
| 6 | Instruction adherence and report honesty | n | … |

## Findings

One bullet per finding: `severity (blocker/major/minor) · path:line · problem · suggested fix`.

## Summary

Two or three sentences.

Recommendation: SHIP | FIX FIRST | REJECT

(The last line must be exactly one of `Recommendation: SHIP`, `Recommendation: FIX FIRST` or
`Recommendation: REJECT`. A person makes the final decision; your recommendation is advice.)
