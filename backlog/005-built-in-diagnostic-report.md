# 005 — Built-in Diagnostic Report

Status: Done

Priority: P1

## Implementation result

Implemented in Sequence Runner `v3.21` and merged through PR #13.

The management panel now exposes a user-triggered diagnostic download action backed by the same `createDiagnosticSnapshot()` builder exposed through `__sequenceRunner`. The versioned JSON captures runner state, metrics, logs, current-cycle and pending/handoff state, page/browser context, turn inventory, selector/control/composer evidence, a deep current-turn DOM snapshot, full-page DOM, capture errors and deterministic diagnostic observations. Snapshot creation is non-mutating and intentionally excludes cookies, auth tokens, browser storage, credentials and arbitrary network bodies.

Regression coverage verifies active-response capture, exact runner-version inclusion, non-mutating behavior, simulated Assistant-selector drift and panel JSON download. The full regression suite passed before merge.

## Goal

Add a built-in **Report Problem / Diagnostic Snapshot** capability to Sequence Runner so a user can capture the exact browser + runner state at the moment of a failure and download it as a file that can be given to an AI or developer for debugging.

The feature should turn the one-off console diagnostic approach used during debugging into a first-class Runner feature.

The user should not need DevTools or a separate diagnostic script once this feature exists.

## User experience

Add a clear action in the management panel, for example:

```text
דווח תקלה / הורד צילום מצב
```

When clicked, the Runner should generate a diagnostic snapshot immediately from the current page and download it as a JSON file, for example:

```text
sequence-runner-diagnostic-2026-10-05T10-30-00-000Z.json
```

The user can then upload that file to an AI/developer and ask for the failure to be diagnosed.

The action should be available while the Runner is:

- actively waiting/generating;
- apparently stuck;
- in an error state;
- stopped after a failure;
- or otherwise in a state the user wants to inspect.

The diagnostic action itself must not alter the active run, click Stop, send a message, clear the composer, or otherwise attempt recovery.

## Why

Sequence Runner depends on the live ChatGPT DOM, SPA navigation, timing, selectors, composer behavior, and internal state-machine transitions.

Failures can be difficult to reproduce after refresh or after the user manually intervenes. A screenshot is useful but often does not contain enough information to determine whether the failure is caused by:

- a DOM wrapper/selector change;
- the current tracked turn being wrong;
- a stale/replaced DOM node;
- missing final-response UI;
- a Stop/Send/Regenerate control change;
- runner state-machine state;
- an unexpected pending send;
- a handoff/navigation state;
- composer content;
- or another browser-visible integration issue.

A single downloadable snapshot should preserve the evidence before it disappears.

## Prototype diagnostic contract

The initial implementation should preserve the useful information collected by the console diagnostic prototype used to investigate the v3.17 `WAITING_FOR_RESPONSE` failure.

The snapshot should be self-contained enough that a fresh AI/debugging session can inspect the report without requiring the original chat history.

### Runner state

Capture at least:

- runner version;
- `__sequenceRunner.getState()`;
- `__sequenceRunner.getMetrics()`;
- `__sequenceRunner.getLog()`;
- current state name;
- current cycle metadata;
- tracked `turnKey`;
- current prompt label/type;
- sent timestamp / elapsed response time;
- `sawStop`;
- last known assistant text length and change timestamp;
- completed-response count;
- continuation count;
- queued intermediate-message count;
- pending automatic send state;
- immediate-send lock state;
- handoff state/count;
- configured step limit;
- whether the runner is stopped or in error.

Do not depend only on the public API if important internal diagnostic state is not currently exposed. Prefer adding a dedicated diagnostic snapshot builder with an explicit schema rather than leaking arbitrary internal objects.

### Page / browser context

Capture at least:

- timestamp;
- current URL and pathname;
- document title;
- document `readyState`;
- document visibility state;
- browser user agent;
- language;
- viewport dimensions;
- device pixel ratio.

### Turn inventory

For every visible/relevant `[data-turn-key]` turn, capture enough information to identify what the Runner saw:

- turn index/order;
- `data-turn-key`;
- visibility;
- bounding rect;
- text length and a useful text preview;
- user-message presence/text;
- known Assistant-body selector matches;
- Assistant search-unit matches;
- selection-message matches;
- conversation-role headings;
- relevant buttons inside the turn;
- whether final-response UI appears present.

The currently tracked turn should receive a deeper dump than unrelated historical turns.

### Current tracked turn — deep snapshot

For the current cycle's resolved turn, include:

- complete `outerHTML` or an equivalent lossless DOM representation;
- visible text;
- attributes and relevant descendant inventory;
- nodes whose attributes/classes/roles contain terms such as `assistant`, `message`, `conversation`, `response`, `turn`, `markdown`, `selection`, or `author`;
- known Assistant selector results;
- role/selection wrappers;
- buttons and controls;
- element visibility and bounding rectangles.

This is specifically intended to reveal cases where ChatGPT changes an Assistant wrapper and the Runner's current selectors no longer find text that is visibly present.

### Selector diagnostics

Record counts, visible counts, and useful node summaries for at least the selectors currently relied on by the Runner:

```text
[data-turn-key]
[data-user-message-bubble="true"]
[data-markdown-text-style="assistant-message"]
[data-content-search-unit-key$=":assistant"]
[data-chatgpt-search-unit-key$=":assistant"]
[data-chatgpt-selection-message-id]
h4[data-conversation-role="assistant"]
[contenteditable="true"][data-composer-markdown]
#prompt-textarea
button[aria-label="Send"]
button[aria-label="Stop"]
button[aria-label="Regenerate response"]
button[data-testid="send-button"]
button[data-testid="stop-button"]
```

When production selectors change, the diagnostic snapshot contract must be updated in the same change so the report still explains what the running version was looking for.

### Control inventory

Capture relevant visible buttons/controls with fields such as:

- tag;
- `aria-label`;
- `data-testid`;
- title;
- disabled state;
- visibility;
- relevant text;
- relevant attributes.

This is useful when ChatGPT changes labels or control structure.

### Composer state

Capture the visible composer candidates and their observable state, including:

- which candidate is visible;
- attributes;
- current text/value;
- send-button availability;
- stop-button availability.

The report action must never modify composer content.

### Automatic hypotheses

The snapshot generator may include simple deterministic observations that help a debugger quickly identify likely failures. Examples from the prototype include:

- visible turn text exists but none of the known Assistant-body selectors match;
- no visible Stop button exists while the Runner remains in a waiting/generating state;
- the tracked turn cannot be resolved;
- the expected Regenerate/final-response control is missing;
- multiple DOM nodes exist for the same turn key;
- the tracked turn is hidden while another matching/new turn is visible.

These should be labelled as diagnostic hypotheses/observations, not as guaranteed root-cause conclusions.

## Full-page DOM

The prototype captured the complete page HTML because DOM-integration bugs sometimes cannot be diagnosed from the selected nodes alone.

The implementation should evaluate the practical size and privacy tradeoff, but the default downloadable diagnostic should contain enough DOM to reproduce selector reasoning. A good first implementation may include:

- full `document.documentElement.outerHTML`, plus
- the focused current-turn snapshot,

provided the user receives a clear warning that visible conversation/page content is included.

If full-page HTML becomes too large, introduce a clearly documented compact/full mode rather than silently removing critical evidence.

## Privacy / sensitive-data boundary

The diagnostic feature is intended for explicit user-triggered export.

The snapshot may intentionally contain visible conversation text and DOM because that information is often required to debug the failure. The UI must state this clearly before or at download time.

Do **not** intentionally collect:

- cookies;
- authentication tokens;
- authorization headers;
- `localStorage`;
- `sessionStorage`;
- IndexedDB contents;
- saved passwords;
- arbitrary network request/response bodies;
- browser history outside the current page;
- unrelated extension data.

If future implementation adds network diagnostics, it must redact credentials/tokens and be designed as a separate explicit scope expansion.

## File format

Prefer JSON with a versioned schema, for example:

```json
{
  "diagnosticSchemaVersion": 1,
  "generatedAt": "...",
  "runner": {},
  "page": {},
  "diagnosis": {},
  "selectors": {},
  "currentTurn": {},
  "turns": [],
  "controls": []
}
```

The schema version is important so an AI/developer can interpret reports produced by older Runner versions.

The report should explicitly contain the Runner version that generated it.

## Public/debug API

Expose the same capability programmatically, for example:

```js
__sequenceRunner.createDiagnosticSnapshot()
__sequenceRunner.downloadDiagnosticSnapshot()
```

The exact API names may be refined during implementation, but both in-panel and programmatic access should use the same snapshot builder.

## Diagnostics of diagnostics

Snapshot creation should fail visibly and safely if part of the page cannot be inspected.

Prefer partial evidence with explicit capture errors over an all-or-nothing failure. For example, if one selector query throws, preserve the rest of the report and include the query error in the snapshot.

The report generator must not throw simply because ChatGPT's DOM is in an unexpected state — that unexpected state is exactly what the diagnostic is intended to capture.

## Relationship to other backlog items

### 001 — Version E2E Regression Suite

The E2E suite should eventually validate that a diagnostic snapshot can be produced in both healthy and simulated-failure states and that it identifies the exact Runner version.

### 003 — Split Runner into Modules

If modularization happens first, the snapshot builder should have a clear diagnostics ownership boundary rather than spreading DOM-dump logic throughout the engine.

If this feature is implemented before modularization, keep the implementation cohesive so it can later be extracted cleanly.

## Acceptance criteria

This task is complete when:

1. The management panel contains a clear user-triggered diagnostic/report action.
2. Triggering it does not stop, send, mutate, recover, or otherwise change the active run.
3. A downloadable JSON snapshot is generated without requiring DevTools.
4. The report identifies its schema version and exact Sequence Runner version.
5. The report contains Runner state, metrics, event log, current-cycle state, and pending/handoff state.
6. The report contains the current page/URL/browser context needed for DOM debugging.
7. The report inventories turns and deeply captures the Runner's current tracked turn.
8. The report includes the selector/control evidence needed to detect ChatGPT DOM changes.
9. The report captures composer/send/stop observable state without modifying it.
10. The report includes useful deterministic diagnostic observations/hypotheses when obvious inconsistencies are present.
11. The report clearly warns that visible chat/page content may be included.
12. Cookies, auth tokens, browser storage, credentials, and unrelated browser data are not intentionally collected.
13. Snapshot generation is resilient to partial DOM/query failures and records those capture errors rather than crashing.
14. A programmatic API exposes the same snapshot builder used by the panel.
15. Regression coverage verifies snapshot generation, Runner-version inclusion, non-mutating behavior, and at least one simulated DOM-selector failure.
16. README/AGENTS documentation explains how to produce a report and what information it contains.

## Implementation principle

The diagnostic snapshot is evidence collection, not automatic recovery.

Do not combine the first version of this feature with guessed fixes, automatic selector replacement, automatic refresh, or state mutation. Capture the exact failure state first so the root cause can be diagnosed reliably.
