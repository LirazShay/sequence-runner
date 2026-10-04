# 001 — Version E2E Regression Suite

Status: Open

## Goal

Create a permanent end-to-end regression test suite that is versioned together with `sequence-runner` and can be run against every released runner version before that version is considered healthy.

The suite should provide one dedicated script/command that launches the required browser test flow, exercises the runner as a user would, and reports whether the version is operational.

## Why

The runner depends on the live ChatGPT web UI, SPA navigation, DOM selectors, composer behavior, and timing-sensitive state transitions. A change can therefore look correct statically while failing in a real browser flow.

A repeatable E2E suite should make release verification explicit and reproducible instead of depending only on ad-hoc manual checks.

## Required outcome

A future implementation of this task should provide:

- A stable E2E test suite stored in the repository and shipped/versioned with the runner source.
- A dedicated script or command for running the full version regression check.
- Browser-level execution that tests the actual runner behavior rather than only isolated helper functions.
- A clear overall pass/fail result suitable for validating a release candidate.
- Useful diagnostics when a scenario fails, so the failing stage can be identified quickly.
- A documented way to run the suite locally for any new runner version.
- A release rule describing when the suite is expected to be run.

## Version relationship

The tests must be tied to the repository version being validated. When runner behavior changes, the corresponding regression expectations should be updated in the same version/change set when necessary.

The test command should make it obvious which runner version was exercised and whether that exact version passed.

## Test scope

The exact scenario list is intentionally not fixed yet. It should be designed when this task is implemented, based on the then-current runner behavior and known failure modes.

At minimum, the design should cover the critical user-visible flows rather than only happy-path JavaScript execution. The existing reliability rules in `AGENTS.md` and documented behavior in `README.md` should be used as the source for deciding what belongs in the regression suite.

## Constraints

- Keep the solution simple and maintainable.
- Prefer deterministic assertions over arbitrary sleeps.
- Do not weaken production behavior merely to make tests easier.
- Do not make the suite depend on manual DevTools intervention once a run has started.
- Preserve useful failure evidence for DOM/navigation/state-machine regressions.
- The exact automation technology and script name are implementation decisions and are not mandated by this backlog item.

## Acceptance criteria

This task is complete when:

1. The repository contains an executable E2E regression suite for the runner.
2. A single documented script/command runs the complete version check.
3. The test output identifies the runner version under test.
4. The command exits or reports clearly as pass/fail.
5. Failures provide enough information to locate the broken flow or stage.
6. The suite is documented as part of the normal release/version validation process.
7. The suite and its expectations are committed together with the runner versions they validate.

## Open design work

Before implementation, define:

- the exact browser automation approach;
- the initial mandatory E2E scenarios;
- how authentication/session setup is handled safely;
- whether tests run only locally or also in CI;
- what artifacts are captured on failure;
- how a historical runner version can be selected and tested, if historical-version testing is required.
