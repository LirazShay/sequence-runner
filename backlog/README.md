# Backlog

This directory is the durable backlog for `sequence-runner`.

Each backlog item lives in its own Markdown document so the task can be discussed, refined, implemented, and reviewed independently. This README is the compact index: it should be enough to understand what is waiting, why it matters, and the current rough priority without opening every task file.

## Conventions

- One feature/task per Markdown file.
- File names use a stable numeric prefix: `NNN-short-task-name.md`.
- Keep the detailed task document focused on goal, rationale, constraints, design questions, and acceptance criteria.
- Keep only a short summary and planning metadata in this README.
- When a task is materially refined, update both its task document and this index when the summary, status, or priority changes.
- Priority is intentionally lightweight and may change as product needs change.

## Priority

- **P0** — foundational / should be done before relying on later changes.
- **P1** — important next product or reliability work.
- **P2** — useful improvement, but not blocking current operation.

## Tasks

| ID | Task | Summary | Priority | Status |
| --- | --- | --- | --- | --- |
| 001 | [Version E2E Regression Suite](001-version-e2e-regression-suite.md) | Deterministic Mock ChatGPT + Playwright regression suite now validates the real runner, bookmarklet artifact, handoff, recovery and known failure modes in CI. | P0 | Done |
| 004 | [Wake Long-Running Response](004-wake-long-running-response.md) | `v3.20` added the one-shot 10-minute `מה קורה?` nudge; `v3.22` fixes live-UI behavior so it inserts immediately during generation instead of pre-waiting for Send availability, while still preserving user composer text. | P1 | Done |
| 005 | [Built-in Diagnostic Report](005-built-in-diagnostic-report.md) | `v3.21` adds a non-mutating in-runner diagnostic snapshot/download with versioned runner state, DOM/selector evidence, privacy boundaries and regression coverage. | P1 | Done |
| 002 | [Rename Previous Chat on Handoff](002-rename-previous-chat-on-handoff.md) | Investigate and implement safe renaming of the outgoing chat during automatic handoff, with a deterministic naming and failure policy. | P2 | Open |
| 003 | [Split Runner into Modules](003-split-runner-into-modules.md) | Refactor the growing `runner.js` into a few cohesive modules while preserving observable behavior and simple deterministic distribution. | P2 | Open |

## Ordering note

The numeric ID is a stable identifier, not the execution order. Use the **Priority** column for the current rough ordering, and change priority without renumbering task files.
