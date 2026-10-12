# AGENTS.md — Sequence Runner

This is the mandatory entry point for AI agents working on this repository.

Before changing code:

1. Read this file.
2. Read `AGENTS_RULES.md` in full. It preserves the complete detailed repository policy and remains mandatory.
3. Read `README.md`.
4. Read `runner.js` as the source of truth, then the relevant code/tests for the task.
5. Inspect the current GitHub branch/state before relying on prior chat context.

If this bootstrap conflicts with `AGENTS_RULES.md`, this file takes precedence.

Default conversation language with the project owner: Hebrew.
Code, identifiers and code comments: English.

## Default repository workflow

- GitHub is the source of truth and the primary work path. Use normal repository edits and commits on a feature branch, then verify, open a PR, let CI act as the independent gate, and merge only when the required checks are green.
- Use local/sandbox execution for editing, builds and tests when useful, but do not treat temporary local artifacts as the repository source of truth.
- Do not switch to GitHub Actions, Base64 transport, Git packs, remote workspaces or another ad-hoc transport merely because the current sandbox lacks direct `git push`, network access or credentials.
- If a large-file write through the GitHub connector is blocked, do not change the workflow. Keep working through GitHub and make the change as small and focused as possible; one blocked call is not evidence that GitHub access is broken.
- After an interruption, compaction, handoff or recovery from a summary, re-read this file, `AGENTS_RULES.md`, `README.md`, the current branch/head and the relevant code from GitHub before resuming. Treat previous local artifacts as cache until their base is verified against GitHub.

## Connector note

A successful small `update_file` on this exact `AGENTS.md` proves that the filename/path itself is not categorically blocked. Treat previous full-file blocks as payload-specific unless stronger evidence appears.
