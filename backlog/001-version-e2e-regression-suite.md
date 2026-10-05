# 001 — Version E2E Regression Suite

Status: Done

## Goal

Create a permanent end-to-end regression test suite that is versioned together with `sequence-runner` and can be run against every released runner version before that version is considered healthy.

## Implemented

The repository now contains a deterministic browser-level regression laboratory built around:

- the real canonical `runner.js`;
- a local Mock ChatGPT page that reproduces the DOM contracts and key runtime behaviors the runner depends on;
- Playwright browser tests running against installed Chrome;
- a permanent bookmarklet-generation regression check;
- a permanent GitHub Actions regression workflow;
- screenshots and Playwright traces on browser-test failures.

The Mock ChatGPT fixture uses the same core locators as the production integration, including turns, user messages, Assistant bodies, the contenteditable composer, Send, Stop, Regenerate response, Project breadcrumb, and New Chat actions.

It can deterministically simulate normal responses, streaming, long-running generation, `Stopped thinking`, queued responses, new-chat navigation delays, Project handoff, stale duplicate composers, Assistant wrapper fallbacks, turn replacement/virtualization, and late DOM mutations after final UI appears.

## Commands

Run the complete regression gate:

```bash
npm test
```

Run only browser E2E tests:

```bash
npm run test:e2e
```

Verify only the committed bookmarklet artifact:

```bash
npm run check:bookmarklet
```

Open the Mock ChatGPT laboratory manually:

```bash
npm run mock
```

Then open the URL printed by the server.

## Initial regression coverage

The initial suite contains 22 browser tests covering the main product contracts and important historical failures, including:

- normal multi-step continuation;
- completion-marker semantics;
- new-task prompt construction;
- the committed bookmarklet booting correctly;
- valid regular and Project handoff;
- malformed handoff safety;
- queued and scheduled intermediate messages;
- immediate intermediate send while a response is active without clicking Stop;
- intermediate-message CRUD/order behavior;
- occupied-composer recovery;
- stale duplicate composer handling;
- restart after completion;
- step limits;
- Assistant wrapper fallback;
- turn DOM replacement/virtualization;
- final UI appearing before the final text mutation;
- `Stopped thinking` with and without a due queued message;
- streamed-response stability.

The bootstrap validation run completed with all 22 tests passing in 35.7 seconds on GitHub Actions.

## Permanent regression rule

When a real bug is found and it can be represented by the deterministic browser fixture:

1. reproduce the bug with a failing Mock ChatGPT scenario/test;
2. confirm the test is red for the broken behavior;
3. fix the production runner;
4. confirm the new test is green;
5. keep that scenario permanently as regression coverage.

Production behavior must not be weakened merely to make tests easier.

## CI

`.github/workflows/regression.yml` runs the regression gate on pull requests and pushes to `main` and can also be started manually.

The CI uses the installed Chrome browser to avoid unnecessary browser downloads. On failure it preserves Playwright trace and screenshot evidence.

## Boundary of this suite

The deterministic Mock ChatGPT suite protects runner/state-machine behavior against known DOM contracts and failure modes. It cannot by itself detect an unannounced change to ChatGPT's live DOM selectors.

A future live-DOM smoke/recording tool may complement this suite for selector drift, but it is not required for this backlog item.

## Acceptance criteria result

1. Executable browser E2E regression suite — done.
2. One complete validation command (`npm test`) — done.
3. Exact committed runner/bookmarklet exercised — done.
4. Clear pass/fail exit status — done.
5. Failure diagnostics — done via trace/screenshots plus Mock event timeline.
6. Release/change validation documented — done.
7. Tests versioned with runner behavior — done.
