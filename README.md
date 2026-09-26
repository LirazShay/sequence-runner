# sequence-runner

Small browser-side sequence engine for advancing a chat through repeated steps until an explicit completion marker is returned.

## Files

- `runner.js` — readable source of truth. Edit and review this file.
- `runner.min.js` — compact one-line distribution generated from the readable source. Intended for convenient copy/paste or bookmarklet-style use.

## What it does

The runner turns a repeated manual workflow:

1. Send an initial instruction.
2. Wait for the assistant to finish.
3. Inspect only the new assistant response.
4. If the response is complete, stop.
5. Otherwise send the continuation prompt once.
6. Repeat.

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

The key product principle is that one sent instruction must correspond to one newly completed assistant turn before another instruction can be sent.

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
