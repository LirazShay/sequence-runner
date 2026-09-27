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

The completion marker is accepted only at the end of the newly completed assistant response, rather than anywhere in the conversation.

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

The key product principle is that automatic runner traffic preserves one sent instruction per newly completed assistant turn. The only exception is an explicit user-triggered **Send now** action, which may supersede the currently tracked cycle and send another message while ChatGPT is still responding.

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
- Only a newly created turn matching the sent user prompt is processed.
- A processed turn is never processed twice.
- The script never scans old assistant messages for completion.
- The Stop button is treated as a strong generation signal, but very fast responses can still complete without requiring that Stop was observed.
- Assistant text must remain stable for a short period before it is evaluated.
- A watchdog wakes the state machine if a DOM mutation is missed; it does not independently decide to send.
- Long-running responses do not fail because an arbitrary wall-clock timeout elapsed.
- After five minutes, the status badge shows elapsed waiting time while the runner continues waiting.
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

does.

Light punctuation/Markdown around the final marker is tolerated.

## Debugging

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

## Maintenance

`runner.js` is the canonical implementation.

Whenever it changes, regenerate `runner.min.js` from the same source. The compact file should not be edited independently.

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
...self-contained prompt for the next chat...
[[/NEXT_CHAT_PROMPT]]
[[/SEQUENCE_RUNNER_NEW_CHAT]]
```

The first runner prompt installs this contract automatically. A handoff is not treated as completion.

Behavior:

- The handoff block must be the final content in the assistant response.
- The prompt between the `NEXT_CHAT_PROMPT` markers must be non-empty.
- Inside a Project chat, the runner identifies the current Project from the breadcrumb and clicks that Project's exact `New chat in <project>` action.
- Outside a Project, the runner clicks the visible general `New chat` action.
- Navigation must complete before the new composer is used. This prevents writing into the old composer during the SPA transition.
- The extracted handoff prompt is sent in the new chat together with the same sequence/completion/handoff contract, so additional rollovers remain possible.
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
- `button[aria-label="Regenerate response"]` inside the current turn, with no active Stop button, is treated as authoritative evidence that the assistant response has completed.
- Stable-text timing remains only a fallback for fast or alternate UI cases where the final action is not observed.

Assistant text lookup is resilient to wrapper changes. The runner first uses:

```js
[data-markdown-text-style="assistant-message"]
```

and can fall back through the assistant search unit and selection-message containers.

The runner also re-resolves the current turn from its pre-send turn snapshot on every evaluation. This protects against React/virtualization replacing or duplicating a turn DOM node while preserving the same conversation turn.

A completed turn must never remain indefinitely in `WAITING_FOR_RESPONSE` merely because one preferred assistant wrapper was not found.


## Bookmarklet distribution

`runner.min.js` is the ready-to-paste bookmarklet artifact.

Permanent rules:

- the file starts with `javascript:`
- the complete file is exactly one line
- the executable payload is generated from `runner.js`
- the compact file is never edited independently
- JavaScript syntax is validated on the payload before the `javascript:` prefix is added

After every source change, rebuild and verify both:

```text
startsWith("javascript:")
lineCount === 1
```
