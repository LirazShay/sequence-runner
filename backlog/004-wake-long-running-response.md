# 004 — Wake Long-Running Response

Status: Done

## Post-completion regression fix

`v3.22 live-UI regression fix`: the wake path must not require the Send button to be available before inserting `מה קורה?`. In the live ChatGPT UI, Send may remain unavailable while generation is active until composer text is inserted. At the 10-minute threshold, an empty composer therefore enters the existing immediate-send path immediately; that path inserts the text first and then waits briefly for Send. Only an occupied user composer may defer the wake. A regression test simulates Send being unavailable until composer input occurs.

## Goal

When the same Assistant response remains actively generating for more than 10 minutes, automatically send a short wake-up message such as:

```text
מה קורה?
```

The purpose is to nudge a response that may be stuck or stalled without requiring the user to notice it and intervene manually.

## Implemented

Implemented in Sequence Runner `v3.20` and merged through PR #12.

The runner now tracks continuous active generation for the exact current response. After 10 minutes it sends one `מה קורה?` wake nudge through the existing immediate composer/send path. It never clicks `Stop`, never resends the runner continuation prompt, and never overwrites occupied composer text. Wake eligibility resets for the next tracked response.

The implementation adds explicit wake diagnostics for threshold, deferred, sending, sent, failed, and cancelled states. Dedicated E2E coverage verifies completion before the threshold, one-shot sending after the threshold, eligibility reset on the next response, and safe deferral when the composer is occupied.

Validation at merge time: bookmarklet check passed and the full regression suite passed `26/26` tests.

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

The final implementation reconciles this feature with the `AGENTS.md` long-running-response rule as an explicit, narrowly scoped one-shot policy rather than a general timer-based retry mechanism.
