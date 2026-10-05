# Sequence Runner regression laboratory

This directory contains the deterministic browser regression environment for `sequence-runner`.

## Principle

The E2E suite runs the real canonical `runner.js` against a controlled Mock ChatGPT browser page. The mock reproduces the DOM contracts and behaviors that the production runner integrates with; the runner itself is not mocked.

The intended maintenance loop is:

```text
real bug
  -> reproduce it as a failing mock scenario/test
  -> fix runner.js
  -> make the test green
  -> keep the test permanently
```

Do not weaken production behavior to make a test pass. Fix the mock when the mock does not accurately reproduce the verified ChatGPT contract.

## Commands

Complete regression gate:

```bash
npm test
```

Browser E2E only:

```bash
npm run test:e2e
```

Bookmarklet artifact check only:

```bash
npm run check:bookmarklet
```

Manual Mock ChatGPT lab:

```bash
npm run mock
```

Open the URL printed by the server. Add `?runner=1` when needed to load the current `runner.js` automatically.

## Layout

```text
tests/
  mock-chatgpt/
    index.html
    mock-chatgpt.js
    mock-chatgpt.css
  e2e/
    fixture.js
    core.spec.js
    handoff.spec.js
    intermediate.spec.js
    recovery.spec.js
    regressions.spec.js
```

## Mock ChatGPT

`window.__mockChatGPT` exposes a deterministic scenario API used by Playwright and available in the manual lab.

Important capabilities include:

- queued normal Assistant responses;
- streamed chunks;
- endless/held generation;
- `Stopped thinking` / terminal turns without an Assistant body;
- preferred Markdown Assistant wrapper and search-unit fallback wrapper;
- `Stop` and `Regenerate response` controls;
- regular and Project New Chat actions;
- delayed SPA-style chat clearing after navigation;
- stale duplicate composers;
- turn DOM replacement while retaining the same turn key;
- final text mutation after final response UI is already visible;
- an event timeline for exact send/generation/navigation ordering.

The mock composer handles the same programmatic paste path used by the production runner.

## Locator contract

The fixture intentionally exposes the important verified production selectors, including:

```text
[data-turn-key]
[data-user-message-bubble="true"]
[data-markdown-text-style="assistant-message"]
[contenteditable="true"][data-composer-markdown]
button[aria-label="Send"]
button[aria-label="Stop"]
button[aria-label="Regenerate response"]
nav[aria-label="Breadcrumb"] a[href$="/project"]
button[aria-label^="New chat in "]
button[aria-label="New chat"]
```

When a real ChatGPT DOM probe changes this contract, update production selectors and the mock together as appropriate. Do not invent unverified selectors merely to make the fixture convenient.

## Bookmarklet regression

`scripts/build-bookmarklet.mjs` mechanically minifies `runner.js`, builds the bookmarklet transport, decodes it once, and verifies that the decoded JavaScript is byte-for-byte identical to the minified payload.

This permanently protects the `%` transport failure that broke the v3.18 bookmarklet.

## CI diagnostics

The permanent regression workflow runs `npm test` on pull requests and `main`. On browser-test failure Playwright keeps a trace and screenshot so the exact browser state can be inspected.

The Mock ChatGPT event timeline is also available from:

```js
__mockChatGPT.getEvents()
```

Runner diagnostics remain available from:

```js
__sequenceRunner.getState()
__sequenceRunner.getLog()
__sequenceRunner.getMetrics()
```

## Scope boundary

This suite deterministically validates runner behavior against the DOM contract we know. It does not prove that the live ChatGPT site has not changed its DOM. A separate live-DOM smoke/recording tool can be added later for that complementary purpose.
