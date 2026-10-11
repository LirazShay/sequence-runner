from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"{path}: expected one match, found {count}: {old[:120]!r}"
        )
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# runner.js
replace_once(
    "runner.js",
    '    const VERSION = "3.39";',
    '    const VERSION = "3.40";'
)

replace_once(
    "runner.js",
    '        HANDOFF_MIN_READY_MS: 1000,\n        STABLE_MS: 900,',
    '        HANDOFF_MIN_READY_MS: 1000,\n        COMPOSER_MODE_TIMEOUT_MS: 5000,\n        STABLE_MS: 900,'
)

replace_once(
    "runner.js",
    '        composer: \'[contenteditable="true"][data-composer-markdown]\',\n        sendButton:',
    '        composer: \'[contenteditable="true"][data-composer-markdown]\',\n        composerModeGroup: \'[role="group"][aria-label="Composer mode"]\',\n        sendButton:'
)

replace_once(
    "runner.js",
    '        \'[contenteditable="true"][data-composer-markdown]\',\n        \'#prompt-textarea\',',
    '        \'[contenteditable="true"][data-composer-markdown]\',\n        \'[role="group"][aria-label="Composer mode"]\',\n        \'[role="group"][aria-label="Composer mode"] button[aria-pressed]\',\n        \'#prompt-textarea\','
)

mode_guard = r'''    function getComposerModeGroup() {
        return getLastVisibleElement(
            SELECTORS.composerModeGroup
        );
    }

    function getComposerModeButton(group, modeName) {
        if (!group) {
            return null;
        }

        return [
            ...group.querySelectorAll("button")
        ].find(function (candidate) {
            const label = normalizeText(
                candidate.innerText ||
                candidate.textContent ||
                ""
            );

            return (
                label === modeName &&
                isElementVisible(candidate)
            );
        }) || null;
    }

    async function ensureChatComposerMode() {
        const group = getComposerModeGroup();

        if (!group) {
            record("composer-mode-toggle-not-present", {
                requestedMode: "Chat"
            });

            return {
                available: false,
                switched: false
            };
        }

        const chatButton =
            getComposerModeButton(
                group,
                "Chat"
            );

        if (!chatButton) {
            throw new Error(
                "The Composer mode toggle is present, but the Chat button was not found."
            );
        }

        if (
            chatButton.getAttribute(
                "aria-pressed"
            ) === "true"
        ) {
            record("composer-mode-chat-confirmed", {
                switched: false
            });

            return {
                available: true,
                switched: false
            };
        }

        if (chatButton.disabled) {
            throw new Error(
                "The Chat composer-mode button is disabled."
            );
        }

        record("composer-mode-switching-to-chat");
        chatButton.click();

        const selectedChatButton =
            await waitUntil(
                function () {
                    const currentGroup =
                        getComposerModeGroup();

                    const currentChatButton =
                        getComposerModeButton(
                            currentGroup,
                            "Chat"
                        );

                    return (
                        currentChatButton &&
                        currentChatButton.getAttribute(
                            "aria-pressed"
                        ) === "true"
                    )
                        ? currentChatButton
                        : null;
                },
                CONFIG.COMPOSER_MODE_TIMEOUT_MS,
                50
            );

        if (!selectedChatButton) {
            throw new Error(
                "Chat composer mode did not become selected before the handoff prompt was sent."
            );
        }

        record("composer-mode-chat-confirmed", {
            switched: true
        });

        return {
            available: true,
            switched: true
        };
    }

'''

replace_once(
    "runner.js",
    '    async function openFreshChatForHandoff() {',
    mode_guard + '    async function openFreshChatForHandoff() {'
)

replace_once(
    "runner.js",
    '''        if (!composer) {
            throw new Error(
                "The old chat did not clear or the new composer did not become ready."
            );
        }

        return {
            kind: target.kind,
            project: target.project,
            oldUrl,
            newUrl,
            composerReused:
                composer === oldComposer
        };''',
    '''        if (!composer) {
            throw new Error(
                "The old chat did not clear or the new composer did not become ready."
            );
        }

        const composerMode =
            await ensureChatComposerMode();

        return {
            kind: target.kind,
            project: target.project,
            oldUrl,
            newUrl,
            composerMode,
            composerReused:
                composer === oldComposer
        };'''
)

replace_once(
    "runner.js",
    '''                    composerReused:
                        navigation.composerReused
                }
            );''',
    '''                    composerReused:
                        navigation.composerReused,
                    composerModeAvailable:
                        navigation.composerMode.available,
                    composerModeSwitched:
                        navigation.composerMode.switched
                }
            );'''
)

# Mock ChatGPT UI and behavior.
replace_once(
    "tests/mock-chatgpt/index.html",
    '''      <header class="chat-header">
        <strong>ChatGPT Mock</strong>
        <code data-mock-role="route"></code>
      </header>

      <section id="conversation" aria-label="Conversation"></section>''',
    '''      <header class="chat-header">
        <strong>ChatGPT Mock</strong>
        <code data-mock-role="route"></code>
      </header>

      <div role="group" aria-label="Composer mode" data-mock-role="composer-mode">
        <button type="button" data-mock-mode="chat" aria-pressed="true">Chat</button>
        <button type="button" data-mock-mode="work" aria-pressed="false"><span>Work</span></button>
      </div>

      <section id="conversation" aria-label="Conversation"></section>'''
)

replace_once(
    "tests/mock-chatgpt/mock-chatgpt.js",
    '''  const eventLog = document.querySelector("#mock-event-log");
  const responseTextInput = document.querySelector('[data-mock-input="response-text"]');

  const timers = new Set();''',
    '''  const eventLog = document.querySelector("#mock-event-log");
  const responseTextInput = document.querySelector('[data-mock-input="response-text"]');
  const chatModeButton = document.querySelector('[data-mock-mode="chat"]');
  const workModeButton = document.querySelector('[data-mock-mode="work"]');

  const timers = new Set();'''
)

replace_once(
    "tests/mock-chatgpt/mock-chatgpt.js",
    '''    newChatCounter: 0,
    activeGenerations: 0,
    navigationClearDelayMs: 0
  };''',
    '''    newChatCounter: 0,
    activeGenerations: 0,
    navigationClearDelayMs: 0,
    composerMode: "chat"
  };'''
)

mode_mock = r'''  function setComposerMode(mode, source = "mock", shouldRecord = true) {
    const selected = mode === "work" ? "work" : "chat";
    state.composerMode = selected;

    chatModeButton?.setAttribute(
      "aria-pressed",
      selected === "chat" ? "true" : "false"
    );
    workModeButton?.setAttribute(
      "aria-pressed",
      selected === "work" ? "true" : "false"
    );

    if (shouldRecord) {
      record("composer-mode-changed", {
        mode: selected,
        source
      });
    }
  }

'''

replace_once(
    "tests/mock-chatgpt/mock-chatgpt.js",
    '  function renderEventLog() {',
    mode_mock + '  function renderEventLog() {'
)

replace_once(
    "tests/mock-chatgpt/mock-chatgpt.js",
    '''    record("send", {
      text,
      stopVisible: !!currentStopButton()
    });''',
    '''    record("send", {
      text,
      stopVisible: !!currentStopButton(),
      composerMode: state.composerMode
    });'''
)

replace_once(
    "tests/mock-chatgpt/mock-chatgpt.js",
    '''    state.events = [];
    state.turnCounter = 0;
    state.newChatCounter = 0;
    state.navigationClearDelayMs = Number(options.navigationClearDelayMs || 0);''',
    '''    state.events = [];
    state.turnCounter = 0;
    state.newChatCounter = 0;
    setComposerMode("chat", "reset", false);
    state.navigationClearDelayMs = Number(options.navigationClearDelayMs || 0);'''
)

replace_once(
    "tests/mock-chatgpt/mock-chatgpt.js",
    '''        navigationClearDelayMs: state.navigationClearDelayMs,
        path: location.pathname,
        composerText: normalize(composer.innerText || composer.textContent || ""),''',
    '''        navigationClearDelayMs: state.navigationClearDelayMs,
        path: location.pathname,
        composerMode: state.composerMode,
        composerText: normalize(composer.innerText || composer.textContent || ""),'''
)

replace_once(
    "tests/mock-chatgpt/mock-chatgpt.js",
    '''  sendButton.addEventListener("click", sendCurrentMessage);
  composerForm.addEventListener("submit", (event) => {''',
    '''  sendButton.addEventListener("click", sendCurrentMessage);

  chatModeButton?.addEventListener("click", () => {
    record("composer-mode-click", { mode: "chat" });
    setComposerMode("chat", "button");
  });

  workModeButton?.addEventListener("click", () => {
    record("composer-mode-click", { mode: "work" });
    setComposerMode("work", "button");
  });

  composerForm.addEventListener("submit", (event) => {'''
)

# Handoff regression.
regression = r'''test("handoff forces Chat composer mode before sending in the fresh chat", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: handoffResponse("CHAT_MODE_HANDOFF") },
      { type: "normal", text: "סיימתי" }
    ]
  });

  const workButton = harness.page.getByRole("button", {
    name: "Work",
    exact: true
  });
  await workButton.click();
  await expect(workButton).toHaveAttribute("aria-pressed", "true");

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const events = await harness.events();
  const readyIndex = events.findIndex((event) => event.type === "new-chat-ready");
  const chatModeClickIndex = events.findIndex(
    (event) => event.type === "composer-mode-click" && event.mode === "chat"
  );
  const sendIndices = events
    .map((event, index) => event.type === "send" ? index : -1)
    .filter((index) => index >= 0);

  expect(readyIndex).toBeGreaterThanOrEqual(0);
  expect(chatModeClickIndex).toBeGreaterThan(readyIndex);
  expect(sendIndices).toHaveLength(2);
  expect(sendIndices[1]).toBeGreaterThan(chatModeClickIndex);
  expect(events[sendIndices[1]].composerMode).toBe("chat");

  const mockState = await harness.page.evaluate(() => window.__mockChatGPT.getState());
  expect(mockState.composerMode).toBe("chat");
});

'''

replace_once(
    "tests/e2e/handoff.spec.js",
    'test("handoff reads the authoritative full assistant selection instead of a later markdown fragment", async ({ harness }) => {',
    regression + 'test("handoff reads the authoritative full assistant selection instead of a later markdown fragment", async ({ harness }) => {'
)

# AGENTS.md selector, handoff, and regression contracts.
replace_once(
    "AGENTS.md",
    '''Regular new chat:
```js
button[aria-label="New chat"]
```

For the two new-chat selectors, select the visible element and, for a Project, require an exact `New chat in <current project>` label.''',
    '''Regular new chat:
```js
button[aria-label="New chat"]
```

Composer mode group:
```js
[role="group"][aria-label="Composer mode"]
```

When that group is present, the visible `Chat` button is selected only when `aria-pressed="true"`; automatic handoff must confirm or select it before sending the first prompt in the fresh chat.

For the two new-chat selectors, select the visible element and, for a Project, require an exact `New chat in <current project>` label.'''
)

replace_once(
    "AGENTS.md",
    '''- After clicking New chat, wait for the URL to change before touching the composer. This avoids the old-composer SPA race observed during probing.
- Only after navigation has completed may the new empty visible composer be used.
- Treat the extracted continuation text as a new task in the fresh chat:''',
    '''- After clicking New chat, wait for the URL to change before touching the composer. This avoids the old-composer SPA race observed during probing.
- Only after navigation has completed may the new empty visible composer be used.
- Before inserting the handoff prompt, if the verified `Composer mode` toggle is present, require the visible `Chat` button to have `aria-pressed="true"`. If another mode such as Work is selected, click Chat and wait for that selected state; fail safely if the toggle exists but Chat cannot be selected. A UI variant with no mode toggle may continue normally.
- Treat the extracted continuation text as a new task in the fresh chat:'''
)

replace_once(
    "AGENTS.md",
    '''- handoff navigation waits for the URL change before writing to the composer
- the handoff prompt reinstalls the runner contract so a second rollover remains possible''',
    '''- handoff navigation waits for the URL change before writing to the composer
- a fresh-chat handoff selects and confirms Chat composer mode before sending when the Chat/Work mode toggle is present
- the handoff prompt reinstalls the runner contract so a second rollover remains possible'''
)

# README.md public behavior and DOM contract.
replace_once(
    "README.md",
    '''- Project new-chat action: `button[aria-label^="New chat in "]`
- Regular new-chat action: visible `button[aria-label="New chat"]`

Fallback selectors are included for a few controls.''',
    '''- Project new-chat action: `button[aria-label^="New chat in "]`
- Regular new-chat action: visible `button[aria-label="New chat"]`
- Composer mode group: `[role="group"][aria-label="Composer mode"]`; when present, `Chat` must be the visible button with `aria-pressed="true"` before an automatic handoff prompt is sent.

Fallback selectors are included for a few controls.'''
)

replace_once(
    "README.md",
    '''- Navigation must complete before the new composer is used. This prevents writing into the old composer during the SPA transition.
- The extracted handoff text is treated as a **new task** in the fresh chat:''',
    '''- Navigation must complete before the new composer is used. This prevents writing into the old composer during the SPA transition.
- Before the handoff prompt is inserted, the runner checks the verified Chat/Work `Composer mode` toggle when it exists. If Work (or any non-Chat state) is active, it clicks `Chat` and waits until that button reports `aria-pressed="true"`; if the toggle exists but Chat cannot be selected, the handoff fails instead of sending in the wrong mode. UI variants without that toggle continue normally.
- The extracted handoff text is treated as a **new task** in the fresh chat:'''
)

# Test-lab docs.
replace_once(
    "tests/README.md",
    '''- regular and Project New Chat actions;
- delayed SPA-style chat clearing after navigation;''',
    '''- regular and Project New Chat actions;
- a Chat/Work composer-mode toggle with `aria-pressed` state for handoff-mode regressions;
- delayed SPA-style chat clearing after navigation;'''
)

replace_once(
    "tests/README.md",
    '''button[aria-label^="New chat in "]
button[aria-label="New chat"]
```''',
    '''button[aria-label^="New chat in "]
button[aria-label="New chat"]
[role="group"][aria-label="Composer mode"]
```'''
)
