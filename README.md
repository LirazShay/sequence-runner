# sequence-runner

Small browser-side sequence engine for advancing a chat through repeated steps until an explicit completion marker is returned.

## Files

- `runner.js` — readable source of truth. Edit and review this file.
- `runner.min.js` — compact one-line bookmarklet-ready distribution generated from the readable source. It always starts with `javascript:` and can be copied directly into a browser bookmark URL.

## What it does

The runner turns a repeated manual workflow:

1. Send an initial instruction.
2. Wait for the assistant to finish.
3. Inspect only the new assistant response.
4. If the response is complete, stop.
5. If the response requests a new-chat handoff, open a fresh chat in the same Project when applicable, transfer the handoff prompt and continue there.
6. Otherwise send the continuation prompt once.
7. Repeat.

The current configuration uses:

- Initial instruction: a multi-step continuation contract.
- Continuation instruction: `תמשיך לשלב הבא`
- Completion marker: `סיימתי`

A bare final completion marker is accepted only at the end of the newly completed assistant response, rather than anywhere in the conversation. If the current chat segment is complete but the sequence must continue in a new chat, the assistant writes `סיימתי` and then the handoff block; the final handoff block takes precedence over local chat completion.

## Product idea

The current script is a focused proof of concept for a more general sequential workflow runner.

It opens the door to:

- Long multi-step workflows without manually sending the same continuation message.
- Reusable workflow templates with different first prompts, continuation prompts and completion conditions.
- Repeat-until workflows.
- Progress/status UI.
- Pause/stop/restart behavior.
- Multiple completion strategies instead of a single keyword.
- Per-workflow configuration.
- Execution logs and diagnostics.
- Future packaging as a small browser extension or userscript instead of a raw bookmarklet/script.

The key product principle is that normal automatic runner traffic preserves one sent instruction per newly completed assistant turn. Two deliberate exceptions may send while ChatGPT is still responding without clicking Stop: an explicit user-triggered **Send now** action, and the one-shot 10-minute long-running-response wake nudge.

## Work style

The start panel exposes a per-run **Work Style** configuration with two deliberately simple flavours:

- **Steady** (default) — tells the assistant to keep progressing naturally until a sensible stopping point. It removes the old `one step only` pressure without forcing a large work block.
- **Deep** — tells the assistant to complete a substantial stage, including related sub-steps, checks and fixes, before stopping. It also strengthens chat-rollover planning: define natural boundaries, finish the current chat's work segment, decide what the next chat should own, persist durable state, and prefer a fresh chat when the next segment benefits from clean context.

The word `שלב` and the continuation command `תמשיך לשלב הבא` remain part of the protocol; the style changes how much coherent work the assistant is encouraged to complete for that continuation. A selected style is preserved automatically across an automatic chat handoff.

Programmatic starts accept the same optional style (`"steady"` or `"deep"`):

```js
__sequenceRunner.startExistingContext("deep")
__sequenceRunner.startWithTask("TASK_TEXT", "deep")
```

Unknown or omitted style values safely fall back to `steady`.

## Technical design

The implementation is state-machine based rather than timer-driven spam/polling.

### DOM signals verified during development

The current ChatGPT web UI was probed before implementation. The runner currently relies on:

- Turn container: `[data-turn-key]`
- User message: `[data-user-message-bubble="true"]`
- Assistant body: `[data-markdown-text-style="assistant-message"]`
- Composer: `[contenteditable="true"][data-composer-markdown]`
- Send button: `button[aria-label="Send"]`
- Generation indicator: `button[aria-label="Stop"]`
- Project breadcrumb: `nav[aria-label="Breadcrumb"] a[href$="/project"]`
- Project new-chat action: `button[aria-label^="New chat in "]`
- Regular new-chat action: visible `button[aria-label="New chat"]`

Fallback selectors are included for a few controls.

### State flow

```text
START
  -> SEND
  -> WAIT_FOR_NEW_TURN
  -> WAIT_FOR_ASSISTANT_BODY
  -> GENERATING / WAIT_FOR_STABLE_RESPONSE
  -> EVALUATE
       -> DONE: STOP
       -> HANDOFF: OPEN NEW CHAT -> SEND HANDOFF PROMPT
       -> NOT DONE: SEND CONTINUATION
```

### Important reliability rules

- A send lock prevents duplicate sends.
- Each cycle records the turn keys that existed before sending.
- After a Runner send, the newest turn created after that send is the active turn. If the user sends additional messages while ChatGPT is working, the Runner follows the newest post-send turn instead of staying pinned to the original Runner prompt text.
- A processed turn is never processed twice.
- The script never scans old assistant messages for completion.
- The Stop button is treated as a strong generation signal, but very fast responses can still complete without requiring that Stop was observed.
- Assistant text must remain stable for a short period before it is evaluated.
- A watchdog wakes the state machine if a DOM mutation is missed; it does not independently decide to send.
- Long-running responses do not fail because an arbitrary wall-clock timeout elapsed.
- After five minutes, the status badge shows elapsed waiting time while the runner continues waiting.
- If the exact same tracked Assistant response remains actively generating for 10 minutes, the runner immediately attempts one `מה קורה?` wake nudge through the same immediate composer/send path used by **Send now**, without clicking Stop or resending the original runner prompt. It does not wait for the active response to finish and does not require Send to be available before inserting the wake text; after insertion the immediate-send path waits briefly for Send to become available. The nudge is one-shot per response and defers only when the composer already contains user text, so that text is never overwritten.
- The user can always stop manually by clicking the status badge.
- Existing composer text is never overwritten automatically.
- Text insertion is verified before Send is clicked.
- Clicking the floating status badge stops the runner manually.

## Completion detection

The runner reads only the assistant body belonging to the current new turn.

It then checks the final non-empty line. A response such as:

```text
עדיין לא סיימתי
```

does not complete the run.

A response ending with:

```text
סיימתי
```

does, but only when that is truly the end of the complete sequence.

When the current chat has finished its assigned work but another chat must continue the sequence, the response instead ends with:

```text
סיימתי
[[SEQUENCE_RUNNER_NEW_CHAT]]
...
[[/SEQUENCE_RUNNER_NEW_CHAT]]
```

The handoff block is then the final content, so the runner performs the handoff rather than stopping.

Light punctuation/Markdown around the final marker is tolerated.

## Debugging

The panel title shows the exact runtime version. The same value is also available from:

```js
__sequenceRunner.version
```

`VERSION` in `runner.js` is the single source of truth for this value and is carried into the bookmarklet distribution.

While the runner is active:

```js
__sequenceRunner.getState()
```

returns the current state.

```js
__sequenceRunner.getLog()
```

returns the internal event log.

Manual stop:

```js
__sequenceRunner.stop()
```

A backward-compatible alias, `__chatgptAutoContinueV3`, is also currently exposed.

### Downloadable diagnostic snapshot

The management panel includes **דווח תקלה / הורד צילום מצב**. It generates a versioned JSON snapshot of the current Runner state and the observable ChatGPT page without attempting recovery or changing the active run. The report includes Runner state/metrics/log, current-cycle metadata, turn inventory, a deep snapshot of the tracked turn, selector/control evidence, composer state, deterministic diagnostic observations and the current page DOM.

The same builder is available programmatically:

```js
const snapshot = __sequenceRunner.createDiagnosticSnapshot()
__sequenceRunner.downloadDiagnosticSnapshot()
```

The report intentionally may include visible conversation text and page DOM because those are required to diagnose selector and SPA failures. It does **not** intentionally collect cookies, authentication tokens, authorization headers, `localStorage`, `sessionStorage`, IndexedDB contents, saved passwords, arbitrary network bodies, unrelated browser history or extension data. Snapshot generation prefers partial evidence plus `captureErrors` over failing completely when an unexpected DOM shape is encountered.

## Maintenance

`runner.js` is the canonical implementation.

Whenever it changes, regenerate `runner.min.js` from the same source. The compact file should not be edited independently.

The distribution file must be directly bookmarklet-safe while preserving the exact minified program. Minify `runner.js` without semantic rewrites, then protect literal percent characters by writing `%25` in the final bookmarklet URL. Do not manually rewrite or broadly re-encode the JavaScript. As a required verification, remove the `javascript:` prefix, URL-decode once, and require the result to be byte-for-byte identical to the freshly generated minified JavaScript payload; syntax-check that decoded payload as JavaScript. This prevents browser URL decoding from corrupting expressions such as the modulo operator in `value%3600`.

The integration depends on the ChatGPT web DOM, so selectors may require maintenance if the UI changes. The state-machine logic is intentionally separated from DOM lookup helpers to keep those changes localized.

## Current status

This version was designed after a dedicated DOM probe rather than by guessing selectors. The probe established the actual turn, assistant-message, composer, Send and Stop structures used by the tested ChatGPT UI.

The next useful evolution would be extracting the workflow configuration from the engine so multiple named sequences can reuse the same runner core.


## Control panel

The runner now includes a small floating management panel.

It can be dragged around the page, minimized, scrolled internally and resized from its lower-left resize handle. Position, size and minimized state are persisted in browser local storage.

The default panel size is intentionally compact so it does not cover most of the conversation. The header remains outside the scrolling body, while the controls and metrics scroll inside the panel when needed.

The panel exposes current, DOM-observable chat metrics:

- total user + assistant messages
- turn count
- user / assistant message counts
- combined visible text character count
- runner responses completed
- prompts sent by the runner
- runner elapsed time
- current state

These are operational indicators, not an official ChatGPT context-window or token counter.

### Start a fresh run

When a run reaches a terminal state — successful completion, manual/limit stop, or error — the panel shows **התחל ריצה חדשה**.

Restarting reuses the same loaded runner and panel but resets all run-specific state: counters, processed-turn tracking, step limits, queued intermediate messages, pending sends and handoff counters. Panel position, size and minimized preference remain intact. The start configuration is shown again so a different task can begin without reinjecting the bookmarklet.

Programmatic restart:

```js
__sequenceRunner.restart()
```

### Run limits

The panel supports two safe stop controls:

- **Stop at step #X** — stop after runner response X completes.
- **Stop after N more** — calculate a target relative to the number of runner responses already completed.

A run limit never interrupts an assistant response in the middle. It is evaluated after the current assistant response is fully completed and before the next continuation prompt is sent.

The limit can be changed or cleared while the runner is active.

The same controls are also exposed through the debug API:

```js
__sequenceRunner.setAbsoluteStepLimit(20)
__sequenceRunner.setRelativeStepLimit(5)
__sequenceRunner.clearStepLimit()
__sequenceRunner.getMetrics()
```


## Automatic chat rollover / handoff

The runner can continue a sequence in a fresh chat when the assistant explicitly returns this machine-readable block at the end of its response:

```text
[[SEQUENCE_RUNNER_NEW_CHAT]]
בשלב זה מומלץ לעבור לצ'אט חדש.
[[NEXT_CHAT_PROMPT]]
...minimal sufficient prompt for the next chat...
[[/NEXT_CHAT_PROMPT]]
[[/SEQUENCE_RUNNER_NEW_CHAT]]
```

The first runner prompt installs this contract automatically. A handoff is not treated as completion.

Behavior:

- If only the current chat segment is complete, the assistant writes `סיימתי` immediately before the handoff block.
- A bare final `סיימתי` is reserved for the true end of the complete sequence.
- If the assistant says another chat is ready, assigned or still contains work, it must include the handoff block instead of ending with bare `סיימתי`.
- The assistant may also decide on its own to hand off when a fresh chat would materially improve focus, precision or continuation quality — for example after a long/loaded chat, when the current topic is exhausted, when a substantially different stage begins, or when most old context is no longer needed.
- Finishing an ordinary step is not by itself a reason to open a new chat.
- The next-chat prompt is **minimal but sufficient**. Prefer keeping durable continuation state in a verified external source of truth. Before handoff, update that source when important state is missing; include in the prompt only essential context that cannot be reconstructed from it. The key test is whether a fresh chat can reconstruct the current state and continue correctly without the previous chat history.
- The handoff block must be the final content in the assistant response.
- The prompt between the `NEXT_CHAT_PROMPT` markers must be non-empty.
- Inside a Project chat, the runner identifies the current Project from the breadcrumb and clicks that Project's exact `New chat in <project>` action.
- Outside a Project, the runner clicks the visible general `New chat` action.
- Navigation must complete before the new composer is used. This prevents writing into the old composer during the SPA transition.
- The extracted handoff text is treated as a **new task** in the fresh chat: the runner wraps it with the same new-task opening format plus the sequence/completion/handoff contract, so the new chat immediately knows the task and can later emit completion or another handoff correctly.
- Runner counters, step limits and queued messages remain in the same in-page runner session across the SPA navigation.
- A malformed handoff marker block stops with an error instead of silently continuing.
- Priority at a response boundary remains: explicit step limit, malformed-handoff safety check, due intermediate message, valid handoff, normal completion, ordinary continuation.

Debugging:

```js
__sequenceRunner.parseHandoff(text)
__sequenceRunner.getState()
__sequenceRunner.getMetrics()
```


## Start modes

The runner no longer has to assume that the task was already described earlier in the conversation.

The control panel offers two start modes:

- **Existing task/context** — preserves the original behavior. The first runner prompt installs the step-by-step continuation, completion and new-chat handoff contract and asks the assistant to continue.
- **New task** — the user enters free-form task text in the panel. The runner embeds that task in the first prompt together with the continuation, completion and handoff contract, then asks the assistant to begin the first step.

The runner waits for an explicit Start action from the panel. It does not automatically send the first prompt merely because the script was loaded.

Equivalent API calls:

```js
__sequenceRunner.startExistingContext()
__sequenceRunner.startWithTask("...")
```


## Intermediate messages

A free-form user message can be injected into an active sequence without breaking the one-send/one-completed-turn invariant.

The panel supports:

- **Send at the next safe boundary** — queue the message for the first point at which the current assistant response has completed.
- **Send now — even during an active response** — insert and send immediately through ChatGPT's composer without clicking Stop.
- **Send after N responses** — queue the message for the boundary reached after N additional runner-managed assistant responses complete.

The safe-boundary modes never interrupt the current assistant response. The explicit immediate-send mode deliberately allows the user to supersede the runner's currently tracked cycle while ChatGPT is still responding. The runner does not click Stop; it tracks the newly sent message as the active cycle instead.

If a queued message becomes due at the same boundary where the assistant emits the normal completion marker, the queued manual message takes precedence. This allows the user to update the task or completion goal before the runner stops.

The explicit step-limit safety guard still has higher priority: if the configured step limit has been reached, the runner stops instead of sending another message.

Multiple intermediate messages may be queued. They are processed in target-order and then user-controlled order within the same target boundary.

The control panel includes a collapsible **intermediate-message manager**. It shows every queued message and lets the user:

- edit the message text
- change its relative schedule ("after N more responses")
- delete one queued message
- move a message up or down relative to other messages scheduled for the same boundary
- clear the complete queue

Reordering is intentionally limited to messages with the same target boundary. A message scheduled for a later response cannot silently jump ahead of an earlier scheduled boundary; change its "after N" value explicitly when the schedule itself should change.

Examples:

```js
// At the next safe response boundary:
const id = __sequenceRunner.queueMessage("עדכון למשימה...", 0)

// After 3 additional completed responses:
__sequenceRunner.queueMessage("שנה את נקודת הסיום ל...", 3)

// Inspect and manage queued messages:
__sequenceRunner.getQueuedMessages()
__sequenceRunner.updateQueuedMessage(id, "טקסט מעודכן...", 2)
__sequenceRunner.deleteQueuedMessage(id)
__sequenceRunner.moveQueuedMessage(id, "up")

__sequenceRunner.clearQueuedMessages()
```

Intermediate-message responses count as runner-managed completed responses and therefore contribute to chat growth metrics and step limits.

### Recovery from user text or manual chat activity

The runner never overwrites text that the user has typed into ChatGPT's composer.

If an automatic continuation becomes due while:

- the composer already contains user text, or
- ChatGPT is busy with another response,

the runner no longer treats that situation as a fatal error. Instead it stores the pending automatic send and enters a recoverable waiting state.

The runner automatically retries when the composer is empty and ChatGPT is idle. The panel also exposes **Continue automation** as a manual recovery action.

This means a user can type or send a message manually while the runner is active without permanently killing the sequence.

Relevant API:

```js
__sequenceRunner.sendMessageImmediately("עדכון מיידי...")
__sequenceRunner.resume()
```


## Response completion detection

Completion detection must prefer explicit final-turn UI over timing heuristics.

For the current tested ChatGPT DOM:

- `button[aria-label="Stop"]` means generation is still active.
- `button[aria-label="Regenerate response"]` inside the current turn, with no active Stop button, is treated as authoritative evidence that generation has completed.
- After final UI appears, the runner still waits until the assistant text has remained unchanged for `STABLE_MS` before evaluation. This prevents a race where the final controls render before the last response text — including completion or handoff markers — has finished settling in the DOM.
- Stable-text timing remains a fallback for fast or alternate UI cases where the final action is not observed.

Assistant text lookup is resilient to wrapper changes. The runner first uses:

```js
[data-markdown-text-style="assistant-message"]
```

and can fall back through the assistant search unit and selection-message containers.

The runner also re-resolves the current turn from its pre-send turn snapshot on every evaluation. This protects against React/virtualization replacing or duplicating a turn DOM node while preserving the same conversation turn.

A completed turn must never remain indefinitely in `WAITING_FOR_RESPONSE` merely because one preferred assistant wrapper was not found.

If the tracked turn explicitly ends with terminal UI such as `Stopped thinking` while no Stop button is active and no Assistant body exists, the runner must not wait forever. A due queued intermediate message may take over at that safe boundary. Otherwise the run stops with a clear error instead of automatically resending the interrupted prompt.


## Bookmarklet distribution

`runner.min.js` is the ready-to-paste bookmarklet artifact.

Permanent rules:

- the file starts with `javascript:`
- the complete file is exactly one line
- the executable payload is generated from `runner.js`
- the runtime `VERSION` value comes from `runner.js` and must remain identical in the compact artifact
- the compact file is never edited independently
- JavaScript syntax is validated on the payload before the `javascript:` prefix is added

After every source change, rebuild and verify both:

```text
startsWith("javascript:")
lineCount === 1
```


## Regression testing

The repository includes a deterministic Mock ChatGPT + Playwright regression laboratory that executes the real canonical `runner.js` in Chrome.

Run the complete release/change gate with:

```bash
npm test
```

Useful narrower commands:

```bash
npm run test:e2e
npm run check:bookmarklet
npm run mock
```

`npm run mock` opens the local Mock ChatGPT laboratory for interactive reproduction. The permanent CI workflow runs the regression suite for pull requests and `main`, and keeps Playwright trace/screenshot evidence on failures.

For reproducible bugs, prefer the permanent workflow: first create a failing Mock ChatGPT scenario, then fix `runner.js`, then keep the green test as regression coverage. See `tests/README.md` for architecture, scenarios and maintenance rules.

The mock protects behavior against the verified DOM contract; it does not replace occasional verification against the live ChatGPT DOM when selectors change.
