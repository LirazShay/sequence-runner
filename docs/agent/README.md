# Agent Policy Map

`AGENTS.md` is the mandatory entry point.

Detailed policy is split by responsibility so agents load only the context needed for the current task:

- `WORKFLOW.md` — repository workflow, GitHub, CI, RCA, recovery, development principles
- `RUNNER_INVARIANTS.md` — state machine, sending, completion, handoff, wake/split, intermediate messages, limits, restart/pause-resume
- `DOM_AND_DIAGNOSTICS.md` — verified ChatGPT DOM integration, insertion, navigation, diagnostics
- `TESTING_AND_BUILD.md` — canonical source/distribution, bookmarklet build, regression contract, test coverage
- `PROJECT_CONTEXT.md` — architecture and longer-term product direction

Keep `AGENTS.md` concise. Put detailed rules in the narrowest relevant policy file rather than growing the root entry point back into a monolith.
