# Project Context and Direction

Read this file only for architecture, product-direction, or broader refactor decisions.

## Product direction

The long-term direction is a generic sequence/workflow runner, not a script permanently hard-coded to one Hebrew continuation prompt.

Potential extensions already identified include:

- configurable workflows
- presets/templates
- configurable first prompt
- configurable continuation prompt
- completion strategies such as exact last line, regex, keyword, max iterations, or custom predicate
- `maxSteps` safety guard
- pause/resume
- controlled retry
- session recovery
- exportable diagnostics
- automatic build
- bookmarklet output
- automated tests
- userscript/browser-extension packaging
- small workflow-configuration UI
- richer policies for when the Assistant should recommend automatic chat rollover

Do not build all of these at once.

## Architectural direction

A plausible future separation is:

```text
Engine
Config
DOM Adapter
Completion Strategy
```

A possible future repository shape is:

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

This is direction, not an instruction to refactor immediately.

Do not refactor merely for aesthetics. Introduce separation when it creates concrete maintainability, testing, reliability, or product value, and preserve the current behavior/invariants while doing so.
