# AGENTS.md — Sequence Runner

This is the mandatory entry point for AI agents working on this repository.

## Start here

Before changing code:

1. Read this file.
2. Read `README.md`.
3. Inspect the current GitHub branch/head and relevant repository state.
4. Read `runner.js` as the canonical implementation when code behavior is involved.
5. Read only the agent-policy documents relevant to the task from `docs/agent/`.

After any chat interruption, compaction, handoff, or recovery from a summary, repeat this startup sequence before resuming work. GitHub is the source of truth; prior local/sandbox artifacts are cache until their base is verified against the current repository state.

Default conversation language with the project owner: Hebrew.
Code, identifiers, and code comments: English.

## Policy routing

Always read:

- `docs/agent/WORKFLOW.md` for implementation/repository workflow, GitHub, CI, RCA, recovery, and development principles.

Also read when relevant:

- `docs/agent/RUNNER_INVARIANTS.md` for `runner.js`, state-machine behavior, sending, completion, handoff, wake/split, intermediate messages, limits, restart, or pause/resume.
- `docs/agent/DOM_AND_DIAGNOSTICS.md` for selectors, composer insertion, ChatGPT UI integration, navigation, or diagnostics.
- `docs/agent/TESTING_AND_BUILD.md` for production-code changes, tests, version bumps, bookmarklet generation, build verification, regression work, or CI validation.

Do not read every detailed policy file by default when the task does not touch that area. The purpose of this split is to keep mandatory context small while preserving domain-specific rules.

## Project essentials

Repository: `LirazShay/sequence-runner`
Primary branch: `main`

`sequence-runner` is a browser-side state-machine runner that advances a ChatGPT conversation through repeated work segments until true completion or a safe automatic chat handoff.

Current protocol:

- continuation prompt: `תמשיך לשלב הבא`
- completion marker: `סיימתי`
- bare final `סיימתי` means the entire sequence is complete
- a valid final handoff block takes precedence over local chat completion

The longer-term direction is a generic sequence/workflow runner, not permanent hard-coding to one Hebrew workflow.

## Source-of-truth files

- `runner.js` — canonical readable implementation; logic changes happen here first.
- `runner.min.js` — generated one-line bookmarklet distribution; never edit manually.
- `README.md` — product/technical overview; update when architecture, behavior, selectors, debugging procedures, or build rules materially change.

## Universal invariants

- Prefer KISS and deterministic behavior.
- Normal automatic Runner traffic preserves one sent prompt per newly completed Assistant turn.
- Never overwrite user composer text.
- Never click ChatGPT Stop as part of normal automatic continuation, handoff, wake/split, or immediate-message behavior unless an explicitly designed user action says otherwise.
- Preserve an immediate manual stop path.
- Use verified DOM behavior; investigate UI changes instead of guessing selectors.
- Change the narrowest correct layer and do not add dependencies/frameworks without clear value.
- Do not refactor merely for aesthetics; require concrete maintainability, testing, reliability, or product value.

## Repository workflow summary

Use the normal path: feature branch -> normal repository edits/commits -> verification -> PR -> CI gate -> merge when green.

Do not use GitHub Actions, Base64 transport, Git packs, remote workspaces, or another ad-hoc transport as a workaround for ordinary editing.

If a large-file write through the GitHub connector is blocked, keep working through GitHub and make the change smaller/more focused; one blocked call is not evidence that GitHub access is broken.

If CI/tests fail or emit a meaningful warning, perform RCA before continuing; do not patch only the surfaced symptom.

If the user asks only for planning, do not implement. If implementation is requested and tools allow it, make the change in the repository rather than asking the user to copy it manually.
