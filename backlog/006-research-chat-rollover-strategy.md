# 006 — Research Chat Rollover Strategy

Status: Open

Priority: P1

## Goal

Research and define a reliable policy for **when Sequence Runner should recommend or perform a handoff to a fresh chat**, with the goal of gaining focus from a clean context without losing durable project state.

This is intentionally a **research + design task first**. Do not jump directly to a hard-coded threshold or implementation.

## Why this matters

A fresh chat can materially improve focus when the previous chat has accumulated a large amount of completed work, discussion, failed attempts, or context that is no longer useful for the next work segment.

At the same time, moving too early can fragment work and lose important context if the durable project state has not been preserved.

The project owner has observed a particularly effective pattern in practice:

> Give one chat a large, meaningful amount of work, let it perform a serious coherent block of work, then move to a fresh chat for the next substantial block.

This resembles `Deep` work style combined with deliberate fresh-chat rollover and appears to work well because each chat gets enough scope to do meaningful work while the next chat starts with cleaner focus.

## Core principle to investigate

For repository-backed work, especially when GitHub is the source of truth, the chat should be treated as a **temporary working context**, not the durable memory of the project.

Before rollover, important continuation state should be persisted to the repository or another durable source of truth whenever appropriate.

The desired direction is:

1. complete a coherent work segment,
2. persist all durable state needed for continuation,
3. verify that a fresh chat can reconstruct the current state from the source of truth plus a minimal handoff prompt,
4. then prefer a fresh chat when the next substantial segment will benefit from cleaner focus.

Do **not** keep important state only in the current chat merely to justify staying in that chat.

## Required investigation

Research and evaluate the following before implementation:

1. **What is a good rollover boundary?**
   - completion of a meaningful work segment,
   - transition to a materially different phase or topic,
   - a large next segment that can stand on its own,
   - signs that old context is becoming noise rather than help.

2. **How should rollover interact with work style?**
   - `Steady` should not fragment work unnecessarily,
   - `Deep` may benefit from a stronger bias toward: large coherent segment -> persist state -> fresh chat -> next large segment.

3. **How should durable state be verified before handoff?**
   - code and tests,
   - planning/status/backlog documents when the project uses them,
   - architectural or product decisions not obvious from code,
   - unresolved failures / known issues,
   - next responsibility when it cannot be reliably inferred from the repository.

4. **How much should be placed in `NEXT_CHAT_PROMPT`?**
   - prefer the shortest sufficient bootstrap,
   - do not duplicate state that a fresh chat can reliably reconstruct from the source of truth,
   - include only essential information that cannot reasonably be persisted or reconstructed.

5. **What signals should not be sufficient by themselves?**
   - number of messages,
   - elapsed time,
   - number of technical actions,
   - completion of an ordinary small step.

   These may be supporting signals, but should not become arbitrary hard thresholds without evidence.

6. **How can the policy be validated empirically?**
   - compare long single-chat execution with deliberate segment + rollover execution,
   - test whether fresh chats make fewer stale-context mistakes,
   - test whether the next chat can resume correctly using repository state only,
   - observe whether Deep + planned rollover produces better sustained execution quality.

7. **Should rollover policy become configurable?**
   Consider whether a future version needs a separate rollover preference/strategy, or whether good default behavior derived from `Steady` / `Deep` is sufficient. Avoid adding configuration before the behavioral rule is understood.

## Important distinction

Do not conflate these two decisions:

- **Work segmentation** — how much coherent work the assistant should complete before a checkpoint.
- **Chat segmentation / rollover** — when the next coherent work segment should begin in a fresh chat.

A `Deep` run may do a lot of work in one assistant turn or one chat and still use frequent *well-chosen* chat boundaries between large segments.

## Candidate direction from current experience

A promising policy to evaluate is:

> Finish a substantial coherent segment, persist the state needed for continuation, and start the next substantial independent segment in a fresh chat when doing so is expected to improve focus.

For `Deep`, the threshold for choosing a fresh chat may intentionally be lower once the current large segment is fully closed and persisted.

For `Steady`, staying in the current chat may remain preferred unless a fresh chat offers a clear focus benefit.

This is a hypothesis to validate, not yet the final contract.

## Reliability constraints

- Never hand off in the middle of an unsafe/incomplete operation merely to get a fresh context.
- Do not lose important project state during rollover.
- Prefer durable repository state over copying large conversation summaries into the next prompt.
- Do not create handoff loops or unnecessary chat churn.
- Preserve the existing explicit handoff markers and state-machine guarantees.
- Any future implementation must remain diagnosable and testable.
- Do not introduce arbitrary message-count/time thresholds without evidence.

## Expected outcome

Produce a documented rollover policy that answers:

- when to stay in the current chat,
- when to persist state and move,
- how `Steady` and `Deep` should differ,
- what must be durable before moving,
- what belongs in the next-chat prompt,
- whether a separate user-configurable rollover mode is actually useful.

Only after that policy is agreed should the runner prompt/behavior be changed.

## Acceptance criteria

- [ ] Real project sessions are reviewed for successful and unsuccessful rollover patterns.
- [ ] The observed success of large `Deep` work segments followed by fresh-chat continuation is explicitly evaluated.
- [ ] A clear distinction between work segmentation and chat segmentation is documented.
- [ ] The policy is designed around durable source-of-truth state rather than chat-history dependence.
- [ ] A concrete rule for when to stay vs. hand off is documented.
- [ ] `Steady` and `Deep` rollover behavior are explicitly addressed.
- [ ] Minimal `NEXT_CHAT_PROMPT` behavior is preserved.
- [ ] Arbitrary message/time thresholds are rejected or justified by evidence.
- [ ] The policy is tested against representative repository-backed workflows before implementation.
- [ ] Any resulting implementation receives regression coverage for repeated handoffs and state preservation.
