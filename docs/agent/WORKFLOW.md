# Repository Workflow

Read this file for any implementation, repository-maintenance, CI, recovery, or GitHub task.

## Source of truth

Repository: `LirazShay/sequence-runner`
Primary branch: `main`

GitHub is the durable source of truth. Temporary local/sandbox files are working copies only.

Before changing repository content:

1. inspect the current branch/head in GitHub,
2. fetch the latest version of every file you will overwrite,
3. preserve the current file SHA / branch base,
4. do not overwrite unreviewed changes.

After writing, fetch the affected file or compare the branch again and verify the expected content/diff is present.

## Default development path

Use the normal repository path:

1. work on a feature branch, never directly on `main`,
2. edit repository files through the normal GitHub tools available to the chat,
3. use local/sandbox execution for editing, builds and tests when useful,
4. verify before pushing/committing when equivalent local checks are available,
5. open a PR,
6. let CI act as the independent gate,
7. merge only when the required checks are green.

Do not switch to GitHub Actions, Base64 transport, Git packs, remote workspaces, or another ad-hoc transport merely because a temporary sandbox lacks `git push`, network access, or credentials.

If a large-file write through the GitHub connector is blocked, do not change the workflow. Keep working through GitHub and make the change as small and focused as possible; one blocked call is not evidence that GitHub access is broken.

## Recovery after interruption

After a chat interruption, compaction, handoff, or recovery from a summary:

1. re-read `AGENTS.md`,
2. re-read `README.md`,
3. inspect the current branch/head in GitHub,
4. read the relevant agent policy files and code from GitHub,
5. only then reuse prior local artifacts after verifying that their base still matches GitHub.

If a summary/local artifact disagrees with GitHub, GitHub wins. Reconcile before continuing.

Do not infer that a capability is unavailable merely because one temporary execution environment lacks it. Check the project’s normal connector/tool path first.

## CI is verification, not a code editor

- Do not create or modify a temporary GitHub Actions workflow whose purpose is to edit or patch repository files, generate a development commit, or push ordinary implementation changes.
- GitHub Actions is an independent verification/gating mechanism. Implement changes through normal repository edits and commits on a feature branch, verify with the available execution environment, then let CI validate the resulting commit.
- Do not use repeated `push -> CI -> patch -> push` cycles as the normal debugging loop when equivalent checks can run before pushing.
- A workflow may write repository contents only when the repository’s intended product/automation design explicitly requires that write behavior and the task itself is to build or maintain that automation. Never use that exception as a workaround for ordinary code editing.
- Prefer targeted tests first, then the required full regression before PR/merge.

## CI/test failure RCA

When CI, a test, or a meaningful warning reports a failure:

1. capture the exact failure/log/state,
2. determine what happened and why,
3. fix the correct layer rather than only the surfaced symptom,
4. check whether the same weakness exists in similar code/tests/configuration,
5. add a reasonable prevention/hardening step when justified,
6. rerun the relevant verification before continuing.

Scale the investigation to the signal. Trivial/transient infrastructure noise does not justify disproportionate work, but evidence of a systemic weakness must not be waived with a local-only patch.

## Development principles

Prefer KISS. Do not add frameworks or dependencies without clear value.

Before a meaningful change, decide whether the issue belongs to workflow configuration, state-machine engine, ChatGPT DOM adapter, completion strategy, or build/distribution. Change the narrowest correct layer.

Prefer deterministic behavior over heuristics.

Do not refactor just for aesthetics. Refactor when the separation produces concrete maintainability, testing, reliability, or product value.

## Planning vs implementation

If the user asks only for planning, do not start implementation.

If the user asks for implementation, make the change in the repository when tools allow it rather than asking the user to manually copy changes.

When the user says to continue the project, do not ask them to re-explain it. Reconstruct current state from the repository first.
