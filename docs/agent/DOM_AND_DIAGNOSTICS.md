# DOM Integration and Diagnostics

Read this file for selector changes, composer insertion, ChatGPT UI integration, diagnostics, handoff navigation, or live-site behavior.

## Verified DOM selectors

The current implementation was designed from an actual ChatGPT DOM probe. Do not guess replacements when the UI changes; verify the new structure first.

Verified selectors:

```js
// Turn
[data-turn-key]

// User message
[data-user-message-bubble="true"]

// Assistant body
[data-markdown-text-style="assistant-message"]

// Composer
[contenteditable="true"][data-composer-markdown]

// Send
button[aria-label="Send"]

// Generation signal
button[aria-label="Stop"]

// Project breadcrumb
nav[aria-label="Breadcrumb"] a[href$="/project"]

// Project new chat
button[aria-label^="New chat in "]

// Regular new chat
button[aria-label="New chat"]

// Composer mode group
[role="group"][aria-label="Composer mode"]
```

When Composer mode exists, visible `Chat` is selected only when `aria-pressed="true"`. Automatic handoff must confirm/select Chat before sending the first prompt in the fresh chat.

For new-chat selectors, use the visible element. In a Project, require an exact `New chat in <current project>` label.

Selectors known not to work in the verified UI and not to be reintroduced without a fresh DOM probe:

```js
[data-message-author-role="assistant"]
[data-is-streaming="true"]
```

## Prompt insertion

The verified UI accepted both synthetic paste and `document.execCommand("insertText")`.

Fallback mechanisms are allowed, but the hard invariant before Send is:

```text
requested text == actual composer text
```

Never overwrite an existing user draft.

Do not use direct `innerHTML` mutation as the primary insertion mechanism.

## SPA and handoff navigation

After clicking New Chat, wait for the URL to change before writing to the composer. This prevents the old-composer SPA race.

Only after navigation completes may the new empty visible composer be used.

In a Project, use the exact current Project’s new-chat action. Outside a Project, use the visible general New Chat action. Do not construct Project conversation URLs manually when a verified UI action exists.

If Composer mode is present, select and confirm Chat before inserting the handoff prompt. If the toggle exists but Chat cannot be selected, fail safely. A UI variant with no mode toggle may continue normally.

## Response DOM behavior

Re-resolve the current turn against the post-send DOM when necessary because virtualization may replace nodes.

Assistant-content detection must retain fallbacks for assistant search-unit and selection-message containers, not only the preferred Markdown wrapper.

When a selection-message container exists, treat it as the authoritative full Assistant response before considering individual Markdown fragments; a later auxiliary fragment must never hide an earlier handoff block.

The final UI may appear shortly before final text mutations settle. Once final UI is present, wait for `STABLE_MS` of unchanged Assistant text before evaluation.

## Debugging API

While active:

```js
__sequenceRunner.getState()
__sequenceRunner.getLog()
__sequenceRunner.stop()
```

A compatibility alias also exists:

```js
__chatgptAutoContinueV3
```

When debugging a failure:

1. inspect state,
2. inspect log,
3. identify the exact state where progress stopped,
4. determine the root cause,
5. fix the correct layer instead of adding arbitrary waits or broad retries.

## Diagnostic snapshot contract

The built-in diagnostic contract is versioned and non-mutating:

```js
__sequenceRunner.createDiagnosticSnapshot()
__sequenceRunner.downloadDiagnosticSnapshot()
```

The management panel exposes the same snapshot through **דווח תקלה / הורד צילום מצב**.

Diagnostic capture must never:

- send a message,
- click Stop,
- clear or overwrite the composer,
- trigger recovery,
- otherwise mutate Runner state.

The report may intentionally include visible conversation text and page DOM because those are useful for diagnosing selector/SPA failures.

It must not intentionally collect:

- cookies,
- authentication tokens or authorization headers,
- local/session browser storage,
- saved credentials,
- arbitrary network bodies.

When production DOM selectors change, update the diagnostic selector inventory in the same change.

Unexpected DOM shapes should produce partial evidence plus capture errors rather than crashing the entire snapshot.
