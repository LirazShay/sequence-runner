# 003 — Split Runner into Modules

Status: Open

## Goal

Refactor the current large `runner.js` into a small, understandable set of source files/modules without changing observable runner behavior.

This is a maintainability refactor, not a product rewrite.

## Why

`runner.js` currently contains state-machine logic, ChatGPT DOM integration, prompt/handoff behavior, panel UI, diagnostics, intermediate-message handling and build/distribution concerns in one file. As features continue to grow, keeping all of that in one source file will make changes harder to review and regressions harder to isolate.

## Required design work

Before moving code, identify the smallest useful boundaries. Candidate responsibilities include:

- state-machine / run engine,
- ChatGPT DOM adapter,
- prompt and handoff contract,
- completion detection,
- management panel UI,
- intermediate-message and run-limit behavior,
- diagnostics/state reporting,
- entry point/configuration.

Do not create many tiny files merely for aesthetics. Prefer a few cohesive modules with clear ownership.

## Constraints

- Preserve current public behavior and state-machine invariants.
- Preserve the public `__sequenceRunner` API unless a deliberate compatibility change is separately approved.
- Keep KISS; do not introduce a framework just to split files.
- `runner.js` must remain the readable distributable entry/output expected by the project unless the build layout is deliberately updated and documented.
- `runner.min.js` remains generated, one-line, and bookmarklet-ready with the `javascript:` prefix.
- The build/regeneration process must stay simple and deterministic.
- Avoid mixing this refactor with unrelated feature changes.

## Suggested direction to evaluate

A possible structure to evaluate, not a mandatory final design:

```text
src/
  engine.js
  chatgpt-adapter.js
  handoff.js
  panel.js
  diagnostics.js
  config.js
  index.js
```

The exact split should be decided after inspecting coupling in the current implementation.

## Migration approach

Prefer an incremental refactor:

1. Define module boundaries and dependency direction.
2. Extract one cohesive responsibility at a time.
3. Keep behavior tests/regression checks green after each extraction.
4. Produce the same browser-ready `runner.js` behavior from the modular source.
5. Regenerate `runner.min.js` from the final readable output.

## Acceptance criteria

- [ ] Module boundaries are documented before the refactor begins.
- [ ] No unnecessary framework or heavy build system is introduced.
- [ ] The state-machine engine is separated from ChatGPT-specific DOM lookup logic.
- [ ] UI code is no longer mixed directly through the core workflow logic more than necessary.
- [ ] Handoff/completion logic has a clear ownership boundary.
- [ ] Existing public APIs and behavior remain compatible, unless explicitly documented otherwise.
- [ ] Readable distribution and bookmarklet distribution are generated deterministically.
- [ ] `runner.min.js` remains exactly one line and starts with `javascript:`.
- [ ] Relevant regression/E2E tests pass before and after the refactor.
- [ ] README/AGENTS architecture and build instructions are updated to match the new structure.
