# 004 — Wake Long-Running Response

Status: Open

## Goal

When the same Assistant response remains actively generating for more than 10 minutes, automatically send a short wake-up message such as:

```text
מה קורה?
```

The purpose is to nudge a response that may be stuck or stalled without requiring the user to notice it and intervene manually.

## Desired behavior

- Measure elapsed time for the currently tracked Assistant response.
- If that exact response is still active after 10 minutes, send the wake-up message once.
- The wake-up must use the normal composer/send path.
- Never click `Stop` and never intentionally cancel the active response.
- After sending the wake-up message, safely track the resulting conversation state without causing a duplicate normal continuation.
- Do not send repeated wake-up messages every 10 minutes for the same response.
- Reset the wake-up eligibility when the tracked response changes or completes.

## Safety / state-machine constraints

This feature is a deliberate exception to the current passive long-running-response policy and must be integrated without weakening the runner's core invariants.

In particular:

- It must identify that the runner is still observing the same active response, not merely that 10 wall-clock minutes elapsed somewhere in the run.
- It must not fire after the response has already completed.
- It must not overwrite text already present in the composer.
- It must not create an automatic resend loop.
- It must not allow both the wake-up and an ordinary continuation to be sent for the same response boundary.
- It should reuse the existing safe immediate-message machinery where practical instead of creating a second independent send path.

## UX / diagnostics

The panel/log should make it clear when the 10-minute wake-up threshold was reached and whether the wake-up message was sent, deferred, or could not be sent safely.

If the composer is occupied or another condition makes immediate sending unsafe, the implementation should preserve deterministic behavior rather than overwrite user input.

## Acceptance criteria

This task is complete when:

1. A continuously active Assistant response becomes eligible for a wake-up after 10 minutes.
2. The runner sends `מה קורה?` at most once for that tracked response.
3. The runner never clicks `Stop` as part of this behavior.
4. A response that completes before 10 minutes never receives the wake-up.
5. The timer/eligibility resets for the next Assistant response.
6. The wake-up cannot cause a duplicate ordinary continuation send.
7. Existing composer-safety rules remain intact.
8. The event is visible in runner diagnostics/logging.
9. Regression coverage is added for the timeout, one-shot behavior, completion-before-threshold, and duplicate-send prevention.

## Implementation note

Before implementation, reconcile this feature with the current `AGENTS.md` long-running-response rule, which intentionally avoids automatic messages based only on elapsed wall-clock time. The final design should treat the 10-minute wake-up as an explicit, narrowly scoped one-shot policy rather than a general timer-based retry mechanism.
