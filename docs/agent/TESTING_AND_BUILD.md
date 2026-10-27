# Testing and Build

Read this file for any production-code change, test change, version bump, bookmarklet generation, CI verification, or regression work.

## Canonical source and generated distribution

`runner.js` is the canonical implementation. All logic changes happen there first.

Runtime versioning has one source of truth: the `VERSION` constant in `runner.js`. The floating panel and public debug API must read that value rather than duplicating a version string elsewhere. When a user-visible Runner change warrants a bump, update `VERSION` in `runner.js`; the repository build then regenerates `runner.min.js`.

Keep `runner.js` readable, deterministic, easy to debug, state-machine based, and simple unless added complexity has clear value.

`runner.min.js` is generated distribution output. Never edit it manually.

It is a one-line bookmarklet URL and must begin exactly with:

```text
javascript:
```

The compact JavaScript behavior must remain identical to `runner.js`: minify only, with no hand edits, logic rewrites, or arbitrary URL encoding.

After minification, protect literal percent characters for bookmarklet transport (`%` -> `%25`) because browsers may URL-decode sequences and corrupt JavaScript operators. Removing the `javascript:` prefix and URL-decoding once must reproduce the freshly minified JavaScript payload byte-for-byte.

## Required build discipline

For code changes:

1. modify readable source,
2. validate syntax,
3. run relevant targeted tests when available,
4. run the repository build (`node scripts/build-bookmarklet.mjs`) locally when the environment supports it; otherwise let the permanent CI workflow perform the same build,
5. require the generated compact output to be exactly one line,
6. require it to start with `javascript:`,
7. require one URL-decode to reproduce the minified JavaScript payload exactly,
8. require readable and compact behavior not to diverge,
9. update documentation when behavior/architecture/selectors/debugging/build rules materially change,
10. run the full regression suite before merge.

The permanent regression workflow builds `runner.min.js` before `npm test`. If the full suite passes and the generated file differs from the branch, CI may commit **only** `runner.min.js` back to that same repository branch. This is the supported synchronization path when the current development environment cannot run the build locally.

A CI-generated bookmarklet commit is not a source edit: never use that mechanism to patch `runner.js`, tests, documentation or workflow behavior. Never commit or accept a `runner.min.js` that lacks the `javascript:` prefix or diverges from canonical source.

## Regression-test contract

The repository contains a deterministic Mock ChatGPT + Playwright E2E suite under `tests/`. It runs the real `runner.js`; production Runner logic must never be replaced with a test double.

Before merging a behavior change, require `npm test` to pass in CI (and locally when practical). This verifies that `runner.min.js` is exactly the bookmarklet generated from canonical source, including the transport-decoding invariant, before any CI-generated synchronization commit is pushed.

When a production bug can be reproduced deterministically, add the failing scenario/test before or together with the fix and retain it permanently as regression coverage.

Do not weaken production behavior merely to satisfy the fixture. If the fixture differs from verified live ChatGPT behavior, fix the fixture.

Keep Mock ChatGPT’s production-facing locators aligned with the verified selector contract. The deterministic mock cannot detect live-site selector drift, so selector changes still require a real DOM probe.

Use `tests/README.md` for test architecture and local commands.

Where practical, keep state-machine behavior tests separate from real ChatGPT DOM integration tests.

## Testing philosophy

Test public behavior, not implementation details.

Regression coverage must protect at least these behavior classes:

### Startup and prompt contract

- loading the script does not send before explicit Start
- new-task mode embeds supplied task text in the first prompt
- existing-context preserves original first-prompt behavior
- existing-ready can adopt an already-active opening response
- adopted pre-run responses are not counted as Runner responses
- compact first safety contract survives wake/immediate-message supersession until sent or made unnecessary by completion/handoff
- ordinary startup waits behind unrelated pre-existing generation without nudging it

### One-send/one-response and completion

- initial prompt sends once
- one completed non-final Assistant response causes exactly one continuation
- many DOM mutations still cause only one send
- a tracked Assistant response cannot be processed twice
- multiple User/Assistant conversation units may be appended under a reused `data-turn-key`; the Runner must still bind only the post-send User unit and its following Assistant response
- `עדיין לא סיימתי` does not stop the workflow
- a response whose true final completion line is `סיימתי` stops the workflow
- a valid final handoff after `סיימתי` performs handoff rather than global stop
- malformed handoff fails safely instead of silently continuing

### Composer and intermediate messages

- queued “now” waits for the current response boundary
- explicit immediate message can send during active generation without clicking Stop
- immediate send supersedes the old tracked cycle without duplicate continuation
- immediate responses remain trackable when ChatGPT reuses the active turn key
- stale final UI from an older response in the reused turn must not finalize the newly tracked response
- user composer text blocks/defer automatic send rather than being overwritten or causing fatal failure
- pending automatic send resumes after composer becomes empty and ChatGPT is idle
- an intermediate message scheduled after N responses fires at the correct boundary
- a due intermediate message keeps its intended precedence over ordinary completion/handoff
- step-limit safety retains higher precedence
- message management can edit text/schedule, delete, and reorder same-boundary items without corrupting cross-boundary semantics

### Long-running work

- long responses continue waiting without duplicate sends or arbitrary timeout failure
- wake is one-shot for the tracked response
- wake timing survives tracked-turn DOM replacement/loss
- live wake delay/message changes apply with the intended original-start semantics
- split is one-shot for the continuous work episode
- an earlier wake does not restart the split clock
- live split edits do not duplicate an already-sent/current episode
- occupied composer defers automatic wake/split without overwriting the user draft
- automatic wake/split never click Stop

### Delivery and interruption recovery

- delivery-timeout Retry is scoped to the tracked turn and occurs at most once per cycle
- Retry does not increment Runner send/continuation counters
- missing/failed/repeated timeout stops with a diagnosable error rather than looping
- exact connection interruption recovers only the narrowly valid partial handoff shape
- bare interrupted `סיימתי` never becomes global completion
- deferred first send yields to a newer external turn only for an unambiguous safe handoff

### Handoff/navigation

- Project handoff selects the exact current Project new-chat action
- non-Project handoff selects visible general New Chat
- navigation waits for URL change before writing to the new composer
- fresh-chat handoff selects/confirms Chat mode when the Chat/Work toggle exists
- handoff prompt reinstalls the Runner contract so another rollover remains possible

### Panel, limits, restart and diagnostics

- panel section ordering preserves the intended utility hierarchy
- explicit step limit is enforced at response boundaries, never by interrupting generation
- changing/clearing limits does not create duplicate sends
- after DONE, STOPPED, or ERROR, a new run can start without reinjecting the script
- restart clears counters, limits, queues, pending sends, and processed-response tracking
- restart does not duplicate observers/watchdogs or erase persisted panel layout preferences
- diagnostic snapshot is non-mutating and preserves partial capture errors rather than failing wholesale
- diagnostic schema assertions must track the intentional schema version exposed by canonical `runner.js`

## Failure handling

A failing test is evidence to investigate, not a reason to add an arbitrary wait/retry.

Follow the repository RCA rules in `docs/agent/WORKFLOW.md`: identify exact failure state, root cause, similar weaknesses, correct-layer fix, and reasonable prevention before continuing.