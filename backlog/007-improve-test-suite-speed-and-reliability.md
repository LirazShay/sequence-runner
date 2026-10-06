# 007 — Improve Test Suite Speed and Reliability

**Status:** Open  
**Priority:** P1

## Goal

Make the regression suite faster, more deterministic, and less sensitive to global CI timeouts while preserving the coverage that protects the runner's state-machine behavior.

## Why

The E2E suite has grown enough that a full CI run can approach or exceed the current global Playwright timeout even when individual tests are passing. Increasing the timeout is a short-term safety margin, not the long-term solution.

The suite should remain practical to run frequently during development and reliable enough that a timeout is meaningful evidence of a problem rather than normal runtime variance.

## Scope

Investigate and improve the test architecture and runtime, including:

- identify the slowest tests and fixtures with measured timings
- remove unnecessary fixed waits and replace them with deterministic state/event waits
- reduce repeated browser/setup work where it is safe to do so
- keep the Mock ChatGPT deterministic and avoid adding artificial delays unless a test specifically needs them
- review whether some behavior can be covered by focused unit/integration tests while keeping critical browser E2E coverage
- consider splitting fast regression checks from slower specialized scenarios when that improves feedback time without weakening merge protection
- review Playwright worker count, retries, global timeout, and per-test timeout based on measured runtime rather than guesswork
- make timeout/failure diagnostics identify the slow or stuck test clearly
- keep bookmarklet verification in CI

## Constraints

- Do not weaken coverage merely to make CI green.
- Preserve tests for handoff, completion semantics, recovery, intermediate messages, restart, diagnostics, long-running-response behavior, and the generated bookmarklet artifact.
- Prefer deterministic event/state synchronization over larger sleeps/timeouts.
- A full regression run should remain suitable as a required pre-merge check.
- Keep the test setup simple; avoid introducing a large testing framework layer unless it has clear value.

## Acceptance Criteria

- Baseline current suite runtime is measured and recorded.
- The main sources of test runtime and flakiness are identified.
- Full regression runtime is materially reduced or made comfortably below the configured CI global timeout under normal GitHub Actions variance.
- No existing meaningful regression coverage is removed without an equivalent or stronger replacement.
- Fixed-delay waits are reduced where deterministic synchronization is available.
- CI failures distinguish a real test failure from an overall-suite timeout.
- The chosen Playwright timeout/worker/retry settings are documented and justified by measurements.
- `npm test` and the GitHub Actions Regression Suite pass consistently after the improvements.

## Notes

The immediate CI global timeout was raised from 40 seconds to 60 seconds as a safety margin while the suite is growing. This backlog item should treat that as temporary headroom, not as the optimization itself.
