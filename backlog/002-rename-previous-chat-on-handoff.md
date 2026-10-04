# 002 — Rename Previous Chat on Handoff

Status: Open

## Goal

When Sequence Runner performs an automatic handoff to a new ChatGPT conversation, support renaming the chat that is being left behind so completed sequence segments are easier to identify later.

This is intentionally a **design + investigation + implementation** task. Do not jump directly to a guessed selector or naming format.

## Required investigation

Before implementation, determine the safest and simplest approach for the current ChatGPT web UI:

1. Verify how conversation rename currently works.
2. Determine whether rename should happen before opening the new chat or after navigation.
3. Determine how to reliably identify the outgoing conversation across SPA navigation.
4. Compare a verified UI-driven rename flow with any verified internal request/API path before choosing one.
5. Check whether Project chats and regular chats behave differently.
6. Decide what should happen when the user has already manually renamed the chat.
7. Decide how rename failure should affect handoff: renaming must not unnecessarily prevent the sequence from continuing.

## Naming design

Define a useful naming policy rather than hard-coding an arbitrary title.

Consider:

- sequence/chat number when known,
- original title preservation,
- completed-segment indication,
- whether the next chat number or current chat number belongs in the outgoing title,
- maximum useful title length,
- repeated handoffs,
- user-configurable naming later without over-engineering the first implementation.

The first implementation should remain simple and deterministic.

## Reliability constraints

- Do not break the existing handoff state machine.
- Do not lose or delay the next-chat prompt unnecessarily.
- Do not rename the wrong conversation.
- Do not rely on stale or hidden DOM controls after SPA navigation.
- Prefer verified DOM/UI behavior over guessed selectors.
- Preserve Project handoff behavior.
- A rename failure should be diagnosable in the runner log/status.

## Expected outcome

After the investigation, implement the chosen rename flow as part of automatic handoff and document the naming rule and failure behavior.

## Acceptance criteria

- [ ] Current ChatGPT rename mechanism is verified before implementation.
- [ ] A clear naming policy is documented.
- [ ] The outgoing chat can be renamed during automatic handoff.
- [ ] The correct outgoing chat is renamed across repeated handoffs.
- [ ] Project and non-Project behavior is verified.
- [ ] Existing user-defined titles have an explicit preservation/override policy.
- [ ] Rename failure does not create an unsafe or duplicate handoff.
- [ ] Failure location and reason are visible in diagnostics.
- [ ] Relevant E2E/regression coverage is added when the version E2E suite exists.
