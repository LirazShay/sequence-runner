# Runner Invariants

Read this file for any change to `runner.js`, runner state, sending behavior, prompt contracts, handoff, wake/split behavior, intermediate messages, run limits, restart, pause/resume, or completion logic.

## Product contract

`sequence-runner` is a browser-side state-machine runner that advances a ChatGPT conversation through repeated steps.

Current loop:

1. send an initial prompt once,
2. wait for a new Assistant turn,
3. wait until that response is complete,
4. inspect only that newly completed Assistant response,
5. stop on true completion,
6. otherwise send exactly one continuation,
7. repeat.

Current protocol:

- continuation prompt: `תמשיך לשלב הבא`
- completion marker: `סיימתי`
- a bare final `סיימתי` means the entire sequence is complete
- `סיימתי` immediately before a valid final handoff block means only the current chat is complete; the handoff takes precedence

Work style and decision mode are independent per-run prompt contracts:

- `steady`: one meaningful work segment per Assistant response, organized by goals/results rather than tiny technical actions
- `deep`: same boundary rule, but push toward a larger coherent verified segment
- if the selected segment becomes too large, stop at a safe checkpoint and leave the remainder for the next continuation
- `autonomous`: choose the best reasonable option and continue; ask only when essential information cannot be inferred or approval is required
- `collaborative`: significant ambiguous choices become checkpoints; routine/safely inferable choices do not
- preserve selected work style and decision mode across automatic handoff
- chat rollover policy remains separate from checkpoint/decision wording

## State-machine invariant

Intended flow:

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

> Normal automatic runner sends preserve one sent prompt per newly completed Assistant turn.

Do not replace this with timer logic such as “if ChatGPT looks idle, send again”.

## Send safety

- Never allow duplicate sends for the same cycle.
- Before sending, capture the currently known turn keys.
- After sending, the newest turn created after that send is authoritative. If the user sends another message while ChatGPT is working, follow the newest post-send turn rather than remaining pinned to the Runner prompt text.
- A processed turn must never trigger another continuation.
- Never scan old Assistant messages for completion; evaluate only the Assistant body in the current tracked turn.
- Existing composer text must never be overwritten automatically.
- After programmatic insertion, verify that actual composer text equals requested text before clicking Send.
- Never use direct `innerHTML` mutation as the primary insertion mechanism.

Three deliberate send-while-generating exceptions exist and none may click Stop:

1. explicit user-triggered immediate intermediate message,
2. one-shot long-running-response wake nudge,
3. one-shot long-work split escalation.

All use the immediate composer/send path and safely supersede the currently tracked cycle when they send.

## Completion and response-finality

Do not use substring matching such as `text.includes("סיימתי")`; text like `עדיין לא סיימתי` must not complete the run.

Completion is determined from the final non-empty line of the current Assistant response, subject to valid handoff precedence.

The Stop button is a strong generation signal, but very fast responses may complete without the runner observing it.

For the currently verified UI, a `Regenerate response` action inside the tracked turn while no Stop button is active is authoritative completion evidence.

Once final UI appears, wait until Assistant text remains unchanged for `STABLE_MS` before evaluation. This is a DOM-settle guard, not a replacement completion heuristic.

Do not leave a turn in `WAITING_FOR_RESPONSE` when final response UI is already present; use `WAITING_FOR_STABLE_RESPONSE` only while final text is settling.

If a tracked turn explicitly terminates with UI such as `Stopped thinking` and has no Assistant body, do not wait indefinitely and do not automatically resend the interrupted prompt. If a queued intermediate message is already due it may supersede that terminated cycle; otherwise stop with a diagnosable error.

Assistant-content detection must retain fallbacks for search-unit and selection-message containers. When a selection-message container is available, treat it as authoritative full Assistant response before individual Markdown fragments; a later auxiliary fragment must never hide an earlier handoff block.

Re-resolve the tracked turn when virtualization replaces DOM nodes.

## Delivery timeout and interruption recovery

If the tracked Runner-sent turn shows the verified `Message delivery timed out. Please try again.` alert with a Retry button:

- click Retry inside that tracked turn exactly once,
- keep the same Runner cycle,
- do not increment send/continuation counters,
- never click Stop,
- if Retry is unavailable, does not start, or the same cycle reaches the timeout again, stop with a diagnosable error,
- never use a page-global Retry when a tracked-turn-scoped control is required.

If ChatGPT shows the exact recovery UI `Connection interrupted. Waiting for the complete answer`, that interruption is stronger evidence than a lingering global Stop button.

Do not evaluate arbitrary partial content. Recover a handoff only when:

- `[[SEQUENCE_RUNNER_NEW_CHAT]]` is present,
- `[[NEXT_CHAT_PROMPT]]` is present,
- prompt content is non-empty,
- `[[/NEXT_CHAT_PROMPT]]` is present,
- the prompt-end marker is the final response text,
- the only missing handoff marker is the final outer `[[/SEQUENCE_RUNNER_NEW_CHAT]]`.

Otherwise keep waiting for recovery. Never promote a bare interrupted `סיימתי` to global completion. A deferred first Runner send may yield to a newer external turn only when that turn contains an unambiguous safe handoff.

## Long-running responses

Do not terminate a valid generation merely because an arbitrary wall-clock timeout elapsed.

The wake nudge is one-shot per tracked Assistant response:

- delay range 1–20 minutes; default 10
- delay/message are live runtime settings until that response’s wake starts sending
- lowering the delay below elapsed generation time makes it eligible on next evaluation
- raising the delay postpones it from the original generation start; do not restart the clock
- once sent/started, edits must never create a second wake for that response
- default message: `לוקח לך הרבה זמן, הכל בסדר? אם העבודה גדולה מדי, אתה יכול לחלק אותה ולהמשיך בהודעה נוספת.`
- `מה קורה?` is an available preset; arbitrary non-empty custom text is allowed
- never wait for generation to finish before attempting the wake
- never click Stop, resend the interrupted Runner prompt, or overwrite a user draft
- do not require Send to be available before inserting; after insertion the immediate-send path may briefly wait for Send to become available
- if composer text already exists, defer only to preserve that draft

The long-work split escalation is one-shot per continuous long-work episode:

- independent delay range 1–20 minutes
- delay/message are live runtime settings until that episode’s split starts sending
- eligibility is recalculated from the preserved original episode start
- editing after split is sent applies to the next episode and must not duplicate the current split
- the default instruction tells the Assistant to finish and verify only the current segment, split remaining work, summarize the next segment, stop at a safe checkpoint, and wait for `תמשיך לשלב הבא`
- same immediate-send safety rules as wake: no Stop, no draft overwrite
- split timing belongs to the continuous long-work episode; an earlier automatic wake must not restart the split clock
- a user/manual message, ordinary Runner send, retry, completed generation, or newly adopted unrelated work starts a new long-work episode

Startup must use the same tracked-response machinery rather than a separate busy-wait loop.

In `existing-ready` mode, if ChatGPT is already generating when Runner starts, adopt that in-flight response as an external startup cycle so wake, interruption, completion, and handoff rules still apply. Do not count that observed pre-run response as a Runner response. Keep the compact first safety contract pending until it is actually sent or completion/handoff makes it unnecessary; wake or explicit immediate send must not silently discard it.

For ordinary existing/new-task startup, unrelated pre-existing generation may defer the first Runner send but must not receive an automatic wake. Wake tracking must survive temporary loss/replacement of the tracked turn DOM.

Do not implement automatic resend loops. Manual stop remains the safe escape hatch.

## Automatic handoff

A valid handoff response ends with:

```text
[[SEQUENCE_RUNNER_NEW_CHAT]]
בשלב זה מומלץ לעבור לצ'אט חדש.
[[NEXT_CHAT_PROMPT]]
...minimal sufficient continuation prompt...
[[/NEXT_CHAT_PROMPT]]
[[/SEQUENCE_RUNNER_NEW_CHAT]]
```

Rules:

- handoff is not global completion
- a `סיימתי` line immediately before the valid block marks only the current chat segment complete
- bare final `סיימתי` is reserved for true end-of-sequence completion
- if another chat is ready/assigned/still has work, the response must not end with bare `סיימתי`
- choose handoff proactively when a fresh chat materially improves focus/precision/continuation quality; do not hand off merely because an ordinary step completed
- NEXT_CHAT_PROMPT must be minimal but sufficient; prefer a durable-source pointer over duplicating recoverable state
- persist missing essential context to the canonical source when appropriate, otherwise include only that missing context
- handoff block must be final content and NEXT_CHAT_PROMPT must be non-empty
- malformed markers are an error, not ordinary continuation
- explicit step-limit safety has highest priority
- a due user-queued intermediate message keeps its existing boundary precedence over valid handoff
- in a Project, use the exact current-Project New Chat action; outside a Project, use the visible general New Chat action
- after clicking New Chat, wait for URL change before touching the composer
- only use the new empty visible composer after navigation completes
- if the verified Composer mode toggle exists, select/confirm visible `Chat` (`aria-pressed="true"`) before sending; fail safely if Chat cannot be selected; absence of the toggle remains compatible
- treat extracted continuation text as a new task in the fresh chat and reinstall the standard runner contract so later rollovers still work
- do not construct Project conversation URLs manually when verified UI actions exist

## Start modes and intermediate messages

Loading the script prepares the panel/runner but must not send until explicit Start or equivalent public API call.

Supported start modes:

- existing-context: original continuation behavior
- existing-ready: peer mode, not a checkbox; first send is a compact safety contract beginning with `תמשיך לשלב הבא`, then later cycles use plain continuation
- new-task: embeds user-supplied task text in the opening prompt

Existing-ready must not alter automatic handoff behavior.

Intermediate messages may be queued for the next safe boundary, queued for N additional completed Runner responses, or explicitly sent immediately by the user while ChatGPT is responding.

Immediate send is a user-only override. It must use the normal composer/send path, never click Stop, safely supersede the old tracked cycle, and track the new sent message as active.

At the same boundary, explicit step-limit safety outranks intermediate messages; a due user-queued intermediate message outranks ordinary completion/handoff processing according to existing boundary precedence.

Queued messages must preserve one-send/one-completed-turn and must not cause duplicate continuation sends.

If automatic continuation is blocked by composer text or external/manual activity, do not fail. Preserve the pending automatic send and its original pre-continuation turn snapshot. Before retrying, check whether a newer user-created turn appeared after that snapshot. If yes, cancel the stale continuation and evaluate the newer Assistant response first. Otherwise resume only when composer is empty and ChatGPT is idle. Preserve the same snapshot across repeated deferrals.

The panel must expose queued intermediate messages, not only a count. Users must be able to edit text, change relative schedule, delete items, and reorder messages sharing the same target boundary without silently changing scheduling semantics across different boundaries.

## Management panel, limits, terminal reset

- panel body scrolls internally
- expanded panel is resizable and size is persisted
- minimizing collapses height rather than leaving an empty shell
- place controls by user utility/frequency: start config, live metrics, intermediate messages, run limits, long-running-response controls, diagnostics last unless a concrete usability reason overrides this
- step limit is a boundary between completed responses and must never interrupt active generation
- changing/clearing a limit must not create duplicate sends or violate one-send/one-turn
- after DONE, STOPPED, or ERROR, the mounted runner must support a fresh run without reinjection
- restart clears run-specific processed-turn keys, queues, pending sends, counters, and limits; restart observers/timers exactly once; preserve panel layout preferences

## Manual stop

Always preserve an immediate manual stop path distinct from normal automatic state progression.
