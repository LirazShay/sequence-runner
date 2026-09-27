# AGENTS.md — Sequence Runner

This file is the entry point for AI agents working on this repository.

## Start here

Before changing code:

1. Read this file.
2. Read `README.md`.
3. Read `runner.js` as the source of truth.
4. Treat `runner.min.js` as generated distribution output, not as an editable source.
5. Inspect the current GitHub state before relying on prior chat context.

Default conversation language with the project owner: Hebrew.
Code, identifiers and code comments: English.

## Project purpose

`sequence-runner` is a browser-side state-machine runner that advances a ChatGPT conversation through repeated steps.

Current behavior:

1. Send an initial prompt once.
2. Wait for a new assistant turn.
3. Wait until that response is actually complete.
4. Inspect only that newly completed assistant response.
5. If the completion condition is met, stop.
6. Otherwise send one continuation prompt.
7. Repeat.

Current workflow configuration:

- Continuation prompt: `תמשיך לשלב הבא`
- Completion marker: `סיימתי`
- A bare final `סיימתי` means the entire sequence is complete.
- When the current chat is complete but work must continue in a new chat, the assistant is instructed to write `סיימתי` and then the valid handoff block. Because the handoff block is the final content, the runner continues instead of treating that local chat completion as global completion.

The longer-term product direction is a generic sequence/workflow runner, not a script hard-coded forever to one Hebrew prompt.

## Source of truth

Repository: `LirazShay/sequence-runner`
Primary branch: `main`

### `runner.js`

Canonical implementation.

All logic changes happen here first.

Keep it:

- readable
- deterministic
- easy to debug
- state-machine based
- simple unless added complexity has clear value

### `runner.min.js`

Generated compact one-line **bookmarklet-ready** distribution.

It must always begin exactly with:

```text
javascript:
```

Do not edit it manually.

Whenever `runner.js` changes:

1. regenerate the compact payload from the readable source,
2. validate the JavaScript payload syntax before prefixing it,
3. prefix the final output with `javascript:`,
4. verify the compact file still represents the same behavior,
5. keep the entire file on exactly one line,
6. verify the committed file starts with `javascript:`.

This is a permanent build invariant. Never commit a `runner.min.js` that lacks the `javascript:` prefix.

### `README.md`

Product and technical overview.

Update it when architecture, behavior, selectors, debugging procedures or build rules materially change.

## Core architecture

The intended state flow is:

```text
START
  -> SEND
  -> WAIT_FOR_NEW_TURN
  -> WAIT_FOR_ASSISTANT
  -> WAIT_FOR_RESPONSE_COMPLETE
  -> EVALUATE
       -> DONE: STOP
       -> HANDOFF: OPEN NEW CHAT -> SEND HANDOFF PROMPT
       -> NOT DONE: SEND NEXT
```

Core invariant:

> Automatic runner sends must preserve one sent prompt per newly completed assistant turn.

The sole intentional exception is an explicit user-triggered immediate intermediate message. That action may supersede the current tracked cycle and send through the composer while ChatGPT is still responding. It must never click Stop.

Do not replace the normal workflow with timer-based logic such as "if ChatGPT looks idle, send again".

## Verified DOM integration

The current implementation was designed after an actual DOM probe of the ChatGPT web UI.

Selectors observed during that probe:

Turn:
```js
[data-turn-key]
```

User message:
```js
[data-user-message-bubble="true"]
```

Assistant message body:
```js
[data-markdown-text-style="assistant-message"]
```

Composer:
```js
[contenteditable="true"][data-composer-markdown]
```

Send:
```js
button[aria-label="Send"]
```

Generation signal:
```js
button[aria-label="Stop"]
```

Project breadcrumb:
```js
nav[aria-label="Breadcrumb"] a[href$="/project"]
```

Project new chat:
```js
button[aria-label^="New chat in "]
```

Regular new chat:
```js
button[aria-label="New chat"]
```

For the two new-chat selectors, select the visible element and, for a Project, require an exact `New chat in <current project>` label.

Selectors that did NOT work in the tested UI and must not be reintroduced without a fresh DOM probe:

```js
[data-message-author-role="assistant"]
[data-is-streaming="true"]
```

If ChatGPT changes its DOM, investigate and verify the new structure instead of guessing.

## Reliability rules

### Send lock

Never allow duplicate sends for the same cycle.

### New-turn isolation

Before sending, capture the currently known turn keys.

After sending, process only a new turn created for that sent prompt.

### New assistant response only

Never search the whole chat history for the completion marker.

Evaluate only the assistant body inside the current new turn.

### Process once

A turn that has already been processed must never trigger another continuation.

### Completion semantics

Do not use:

```js
text.includes("סיימתי")
```

because text such as:

```text
עדיין לא סיימתי
```

must not stop the workflow.

Current completion semantics inspect the final non-empty line of the current assistant response.

### Streaming / completion

The Stop button is a strong signal that generation is active, but very fast responses may complete without the runner observing it.

### Response-completion authority

For the currently verified UI, a `Regenerate response` action inside the current turn while no Stop button is active is authoritative evidence that the response has completed.

Do not leave a turn in `WAITING_FOR_RESPONSE` when its final response UI is already present.

Assistant-content detection must retain fallbacks for the assistant search-unit and selection-message containers, not only the preferred Markdown wrapper.

Re-resolve the current turn against the post-send DOM when necessary because virtualization may replace DOM nodes.

Stable-text timing is a fallback, not the primary completion signal.

### Long-running responses

Do not stop a valid ChatGPT generation merely because an arbitrary wall-clock timeout elapsed.

Responses may legitimately take many minutes. The runner should continue waiting while preserving the one-send/one-turn invariant.

After a long wait, status/diagnostic notices are allowed, but they must not terminate the run.

Do not implement automatic resend loops. Manual stop remains the safe escape hatch if a run is genuinely stuck.

### Composer safety

Never overwrite text already typed by the user.

After programmatic insertion, verify the actual composer contents before clicking Send.

### Automatic chat handoff

The first runner prompt installs a machine-readable handoff contract.

A valid handoff response ends with:

```text
[[SEQUENCE_RUNNER_NEW_CHAT]]
בשלב זה מומלץ לעבור לצ'אט חדש.
[[NEXT_CHAT_PROMPT]]
...self-contained continuation prompt...
[[/NEXT_CHAT_PROMPT]]
[[/SEQUENCE_RUNNER_NEW_CHAT]]
```

Rules:

- A handoff is not global completion.
- The assistant may place a `סיימתי` line immediately before a valid handoff block to mark the current chat segment complete.
- A bare final `סיימתי` is reserved for true end-of-sequence completion.
- If the response says or records that another chat is ready, assigned or still has work, it must not end with bare `סיימתי`; it must include the handoff block.
- The handoff block must be the final content of the newly completed assistant response.
- The next-chat prompt must be non-empty.
- Malformed handoff markers are an error; do not silently treat them as ordinary continuation.
- Explicit step-limit safety still has highest priority.
- A due user-queued intermediate message keeps its existing boundary precedence over a valid handoff.
- In a Project chat, remain in the same Project by using the exact current-Project new-chat action.
- Outside a Project, use the visible general New chat action.
- After clicking New chat, wait for the URL to change before touching the composer. This avoids the old-composer SPA race observed during probing.
- Only after navigation has completed may the new empty visible composer be used.
- Send the extracted continuation context together with the standard runner continuation/completion/handoff contract so later rollovers still work.
- Do not construct Project conversation URLs manually when a verified UI action is available.

### Manual stop

Always preserve an immediate manual stop path.

### Start-mode configuration

The runner must not assume that the task was already stated in the chat.

The management panel supports:

- existing-context mode, which preserves the original continuation behavior
- new-task mode, which embeds user-supplied free-form task text into the first runner prompt

Loading the script should prepare the runner and panel, not automatically send the first prompt. Sending begins only after an explicit Start action or an equivalent public API call.

### Intermediate messages

The runner supports free-form messages inserted during an active sequence.

Intermediate messages normally queue for response boundaries and never interrupt an assistant response that is still generating.

A message may be:

- queued for the next safe boundary
- queued for N additional completed runner-managed responses from the current point
- explicitly sent immediately by the user while ChatGPT is still responding

Immediate send is a user-only override. It must use the normal composer/send path, must not click Stop, must supersede the old tracked cycle safely, and must track the new sent message as the active cycle.

When an intermediate message is due at the same boundary as the ordinary completion marker, the user-queued message takes precedence so the user can revise the task or endpoint.

The explicit step-limit safety guard has higher priority than queued intermediate messages.

Queued messages must preserve the one-send/one-completed-turn invariant and must not cause duplicate continuation sends.

If an automatic send is blocked because the composer contains user text or ChatGPT is busy with external/manual activity, do not fail the runner. Preserve the pending automatic send, enter a recoverable waiting state, and resume only after the composer is empty and ChatGPT is idle. Never overwrite user text.

The management panel must expose the queued intermediate messages, not only a count. Users must be able to edit message text, change the relative schedule, delete individual messages and reorder messages that share the same target boundary. Reordering must not silently override scheduling semantics across different target boundaries.

### Management panel and run limits

The current runner includes a draggable/minimizable management panel.

The panel body must scroll internally instead of growing to cover most of the viewport. The expanded panel is user-resizable, and its size is persisted. Minimizing must collapse the height rather than leave an empty fixed-height shell.

The panel reports operational chat/run metrics and allows a safe step limit to be configured either as an absolute runner-response number or as N additional responses from the current point.

A step limit is a boundary between completed responses. Never implement it by interrupting a response that is currently generating.

Changing or clearing the limit during a run must not create duplicate sends or violate the one-send/one-turn invariant.

After any terminal state that leaves the panel mounted — successful completion, manual/limit stop, or error — the runner must be reusable without reinjecting the script. A new-run reset must clean run-specific state and restart observers/timers exactly once while preserving panel layout preferences. Do not carry processed-turn keys, queued messages, pending sends, counters or limits into the next run.

## Prompt insertion

The tested UI accepted both:

- synthetic paste
- `document.execCommand("insertText")`

The implementation may use verified fallbacks, but the critical requirement is:

```text
requested text == actual composer text
```

before Send is clicked.

Do not use direct `innerHTML` mutation as the primary mechanism.

## Debugging API

While active:

```js
__sequenceRunner.getState()
```

returns the current state.

```js
__sequenceRunner.getLog()
```

returns the internal event log.

```js
__sequenceRunner.stop()
```

stops the runner manually.

A compatibility alias currently also exists:

```js
__chatgptAutoContinueV3
```

When debugging a failure:

1. inspect state,
2. inspect log,
3. identify the exact state where progress stopped,
4. determine the root cause,
5. fix the correct layer instead of adding arbitrary delays or broad retries.

## Development principles

Prefer KISS.

Do not add frameworks or dependencies without clear value.

Before a meaningful change, decide whether the issue belongs to:

- workflow configuration,
- state-machine engine,
- ChatGPT DOM adapter,
- completion strategy,
- build/distribution.

Change the narrowest correct layer.

Prefer deterministic behavior over heuristics.

## Planned architectural direction

A likely future split is:

```text
Engine
Config
DOM Adapter
Completion Strategy
```

Possible future structure:

```text
src/
  engine.js
  chatgpt-adapter.js
  completion.js
  config.js

dist/
  runner.js
  runner.min.js
  bookmarklet.txt
```

Do not refactor just for aesthetics. Refactor when the separation produces concrete maintainability, testing or product value.

## Future product directions

Potential extensions already identified:

- configurable workflows
- presets/templates
- configurable first prompt
- configurable continuation prompt
- completion strategies: exact last line, regex, keyword, max iterations, custom predicate
- `maxSteps` safety guard
- pause/resume
- controlled retry
- session recovery
- exportable diagnostics
- automatic build
- bookmarklet output
- automated tests
- userscript/browser extension packaging
- small UI for workflow configuration
- richer policies for when the assistant should recommend an automatic chat rollover

Do not build all of these at once.

## Testing philosophy

Test public behavior, not implementation details.

Important behavioral cases include:

- start mode does not send before explicit user start
- new-task mode embeds the supplied task in the first prompt
- existing-context mode preserves the original first-prompt behavior
- an intermediate message queued for "now" waits until the current response is complete
- an explicit immediate intermediate message can be sent while a response is active without clicking Stop
- an immediate message supersedes the old tracked cycle without allowing a duplicate automatic continuation
- user text in the composer pauses an automatic send instead of causing a fatal error
- the pending automatic send resumes after the composer becomes empty and ChatGPT is idle
- an intermediate message scheduled after N responses is injected at the correct boundary
- a due intermediate message takes precedence over the ordinary completion marker
- the explicit step limit takes precedence over intermediate messages
- a valid handoff marker block is parsed only when it is complete and at the end of the response
- a response with `סיימתי` immediately before a valid final handoff block performs the handoff instead of stopping
- a bare final `סיימתי` stops only when no handoff block follows it
- a malformed handoff block fails safely instead of sending a continuation
- a Project handoff selects the exact current Project's new-chat action
- a non-Project handoff selects the visible general New chat action
- handoff navigation waits for the URL change before writing to the composer
- the handoff prompt reinstalls the runner contract so a second rollover remains possible
- initial prompt is sent once
- one completed non-final response causes exactly one continuation
- "עדיין לא סיימתי" does not stop the workflow
- a response whose final completion line is "סיימתי" stops the workflow
- many DOM mutations still cause only one send
- long-running responses keep waiting without duplicate sends or automatic timeout failure
- existing composer text is never overwritten
- a processed turn cannot be processed twice
- after DONE, STOPPED or ERROR, the user can start a fresh run without reloading the script
- restarting clears run-specific counters, limits, queues, pending sends and processed-turn tracking
- restarting does not duplicate observers/watchdogs or erase persisted panel layout preferences

Where possible, keep state-machine tests separate from real ChatGPT DOM integration tests.

## Build discipline

For code changes:

1. modify the readable source,
2. validate syntax,
3. run relevant tests if available,
4. regenerate compact output,
5. verify compact output is one line,
6. verify readable and compact behavior do not diverge,
7. update documentation when needed,
8. commit only after verification.

## GitHub working rules

When GitHub tools are available, work directly in the repository instead of asking the user to manually copy changes.

Before overwriting an existing file:

- fetch the latest version,
- use its current SHA,
- do not overwrite unreviewed changes.

After writing:

- fetch the affected file again,
- verify the expected content is present.

## New-chat behavior

If the user says things like:

- "continue with sequence-runner"
- "improve the runner"
- "there is a bug in the runner"
- "continue from where we were"

do not ask them to re-explain the whole project.

Read the repository first and continue from its current state.

If the user asks only for planning, do not start implementation.
If the user asks for implementation, make the change in the repository when tools allow it.
