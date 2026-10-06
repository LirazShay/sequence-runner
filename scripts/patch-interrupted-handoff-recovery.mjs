import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceOnce(content, search, replacement, label) {
  const index = content.indexOf(search);
  if (index < 0) {
    throw new Error(`Patch anchor not found: ${label}`);
  }
  if (content.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Patch anchor is not unique: ${label}`);
  }
  return content.slice(0, index) + replacement + content.slice(index + search.length);
}

function patchRunner() {
  const path = "runner.js";
  let s = read(path);

  s = replaceOnce(s, 'const VERSION = "3.34";', 'const VERSION = "3.35";', "version");

  s = replaceOnce(
    s,
    '        DELIVERY_TIMEOUT_MESSAGE: "Message delivery timed out. Please try again.",\n',
    '        DELIVERY_TIMEOUT_MESSAGE: "Message delivery timed out. Please try again.",\n' +
      '        CONNECTION_INTERRUPTED_MESSAGE: "Connection interrupted. Waiting for the complete answer",\n',
    "connection interrupted config"
  );

  s = replaceOnce(
    s,
    '        \'aside[role="alert"]\',\n',
    '        \'aside[role="alert"]\',\n' +
      '        \'[role="status"] .text-chatgpt-recovery\',\n',
    "diagnostic recovery selector"
  );

  s = replaceOnce(
    s,
    '    function getTurns() {\n',
    `    function parseInterruptedHandoff(text) {
        const normalized = normalizeText(text);
        const normal = parseHandoff(normalized);

        if (normal.requested && !normal.error) {
            return {
                ...normal,
                recoveredOuterEnd: false
            };
        }

        const outerStartIndex =
            normalized.lastIndexOf(
                CONFIG.HANDOFF_OUTER_START
            );

        if (outerStartIndex < 0) {
            return {
                requested: normal.requested,
                nextChatPrompt: null,
                error: normal.error,
                recoveredOuterEnd: false
            };
        }

        const outerEndIndex =
            normalized.indexOf(
                CONFIG.HANDOFF_OUTER_END,
                outerStartIndex +
                    CONFIG.HANDOFF_OUTER_START.length
            );

        const duplicateOuterStartIndex =
            normalized.indexOf(
                CONFIG.HANDOFF_OUTER_START,
                outerStartIndex +
                    CONFIG.HANDOFF_OUTER_START.length
            );

        const promptStartIndex =
            normalized.indexOf(
                CONFIG.HANDOFF_PROMPT_START,
                outerStartIndex +
                    CONFIG.HANDOFF_OUTER_START.length
            );

        const promptEndIndex =
            promptStartIndex < 0
                ? -1
                : normalized.indexOf(
                      CONFIG.HANDOFF_PROMPT_END,
                      promptStartIndex +
                          CONFIG.HANDOFF_PROMPT_START.length
                  );

        const duplicatePromptStartIndex =
            promptStartIndex < 0
                ? -1
                : normalized.indexOf(
                      CONFIG.HANDOFF_PROMPT_START,
                      promptStartIndex +
                          CONFIG.HANDOFF_PROMPT_START.length
                  );

        const duplicatePromptEndIndex =
            promptEndIndex < 0
                ? -1
                : normalized.indexOf(
                      CONFIG.HANDOFF_PROMPT_END,
                      promptEndIndex +
                          CONFIG.HANDOFF_PROMPT_END.length
                  );

        const safelyMissingOnlyOuterEnd =
            outerEndIndex < 0 &&
            duplicateOuterStartIndex < 0 &&
            promptStartIndex > outerStartIndex &&
            promptEndIndex > promptStartIndex &&
            duplicatePromptStartIndex < 0 &&
            duplicatePromptEndIndex < 0 &&
            normalized.endsWith(
                CONFIG.HANDOFF_PROMPT_END
            );

        if (!safelyMissingOnlyOuterEnd) {
            return {
                requested: true,
                nextChatPrompt: null,
                error: "The interrupted handoff is not safely recoverable.",
                recoveredOuterEnd: false
            };
        }

        const nextChatPrompt = normalizeText(
            normalized.slice(
                promptStartIndex +
                    CONFIG.HANDOFF_PROMPT_START.length,
                promptEndIndex
            )
        );

        if (!nextChatPrompt) {
            return {
                requested: true,
                nextChatPrompt: null,
                error: "The next-chat prompt is empty.",
                recoveredOuterEnd: false
            };
        }

        return {
            requested: true,
            nextChatPrompt,
            error: null,
            recoveredOuterEnd: true
        };
    }

    function getTurns() {
`,
    "interrupted handoff parser"
  );

  s = replaceOnce(
    s,
    '    function getTerminalResponseMarker(turn) {\n',
    `    function getConnectionInterruptedStatus(turn) {
        const candidates = [
            ...document.querySelectorAll(
                '[role="status"],.text-chatgpt-recovery'
            )
        ];

        for (const candidate of candidates) {
            if (!isElementVisible(candidate)) {
                continue;
            }

            const text = normalizeText(
                candidate.innerText ||
                candidate.textContent ||
                ""
            );

            if (
                text !==
                CONFIG.CONNECTION_INTERRUPTED_MESSAGE
            ) {
                continue;
            }

            const ownerTurn =
                candidate.closest(SELECTORS.turn);

            if (
                ownerTurn &&
                turn &&
                getTurnKey(ownerTurn) !==
                    getTurnKey(turn)
            ) {
                continue;
            }

            return {
                element: candidate,
                message:
                    CONFIG.CONNECTION_INTERRUPTED_MESSAGE
            };
        }

        return null;
    }

    function getTerminalResponseMarker(turn) {
`,
    "connection interrupted detector"
  );

  const adoptionStart = s.indexOf('    function adoptExternalTurnForContinuation(\n');
  const adoptionEnd = s.indexOf('    function deferAutoSend(\n', adoptionStart);
  if (adoptionStart < 0 || adoptionEnd < 0) {
    throw new Error("Patch anchor not found: external turn adoption block");
  }
  s = s.slice(0, adoptionStart) + `    function adoptExternalTurn(
        baselineTurnKeys,
        trigger,
        pending,
        eventName,
        existingTurn
    ) {
        const baseline =
            normalizeTurnKeySnapshot(
                baselineTurnKeys
            );

        const turn =
            existingTurn ||
            findNewTurn(
                new Set(baseline)
            );

        if (!turn) {
            return false;
        }

        const turnKey = getTurnKey(turn);
        const stopButton = getStopButton();

        pendingAutoSend = null;
        sendLocked = false;

        currentCycle = {
            id: "external-" + Date.now(),
            label: "external",
            prompt: null,
            beforeKeys: new Set(baseline),
            sentAt: Date.now(),
            turnKey,
            sawStop: !!stopButton,
            lastText: null,
            lastTextChangedAt: 0,
            longWaitNoticeBucket: -1,
            activeGenerationStartedAt: null,
            wakeState: "idle",
            wakeThresholdReachedAt: null,
            wakeDeferredReason: null,
            wakeSentAt: null,
            deliveryRetryAttempts: 0,
            deliveryRetryState: "idle",
            deliveryRetryClickedAt: null,
            processed: false
        };

        record(
            eventName ||
                "pending-auto-send-superseded-by-external-turn",
            {
                trigger,
                pendingLabel:
                    pending?.label || null,
                pendingReason:
                    pending?.reason || null,
                turnKey
            }
        );

        setState(
            stopButton
                ? "GENERATING"
                : "WAITING_FOR_RESPONSE",
            "👤 זוהתה הודעת משתמש חדשה; בודק קודם את התשובה החדשה...",
            "#b45309"
        );

        renderPanel();
        scheduleEvaluate();
        return true;
    }

    function adoptExternalTurnForContinuation(
        baselineTurnKeys,
        trigger,
        pending
    ) {
        return adoptExternalTurn(
            baselineTurnKeys,
            trigger,
            pending,
            "continuation-superseded-by-external-turn"
        );
    }

    function adoptExternalHandoffForPendingFirst(
        baselineTurnKeys,
        trigger,
        pending
    ) {
        const baseline =
            normalizeTurnKeySnapshot(
                baselineTurnKeys
            );

        const turn = findNewTurn(
            new Set(baseline)
        );

        if (!turn) {
            return false;
        }

        const text = getAssistantText(turn);
        if (!text) {
            return false;
        }

        const interrupted =
            getConnectionInterruptedStatus(turn);

        const handoff = interrupted
            ? parseInterruptedHandoff(text)
            : parseHandoff(text);

        const responseIsSafelyFinal =
            !!interrupted ||
            !getStopButton() ||
            hasFinalUi(turn);

        if (
            !responseIsSafelyFinal ||
            !handoff.requested ||
            handoff.error
        ) {
            return false;
        }

        return adoptExternalTurn(
            baseline,
            trigger,
            pending,
            "first-send-superseded-by-external-handoff",
            turn
        );
    }

` + s.slice(adoptionEnd);

  s = replaceOnce(
    s,
    `        if (
            pendingAutoSend.label === "continue" &&
            adoptExternalTurnForContinuation(
                pendingAutoSend.baselineTurnKeys,
                "pending-resume",
                pendingAutoSend
            )
        ) {
            return true;
        }
`,
    `        if (
            (
                pendingAutoSend.label === "continue" &&
                adoptExternalTurnForContinuation(
                    pendingAutoSend.baselineTurnKeys,
                    "pending-resume",
                    pendingAutoSend
                )
            ) ||
            (
                pendingAutoSend.label === "first" &&
                adoptExternalHandoffForPendingFirst(
                    pendingAutoSend.baselineTurnKeys,
                    "pending-resume",
                    pendingAutoSend
                )
            )
        ) {
            return true;
        }
`,
    "resume pending first handoff adoption"
  );

  s = replaceOnce(
    s,
    '    function completeCycle(cycle, text) {\n',
    '    function completeCycle(cycle, text, options) {\n',
    "complete cycle options"
  );

  s = replaceOnce(
    s,
    `        const handoff =
            parseHandoff(text);
`,
    `        const handoff =
            options?.handoff ||
            parseHandoff(text);
`,
    "handoff override"
  );

  s = replaceOnce(
    s,
    `        if (
            updateLongRunningWake(
                cycle,
                !!stopButton
            )
        ) {
            return;
        }

        const finalUiSeen =
            hasFinalUi(turn);

        const text =
            getAssistantText(turn);
`,
    `        const text =
            getAssistantText(turn);

        const connectionInterrupted =
            getConnectionInterruptedStatus(turn);

        if (connectionInterrupted) {
            updateLongRunningWake(
                cycle,
                false
            );

            if (
                text &&
                text !== cycle.lastText
            ) {
                cycle.lastText = text;
                cycle.lastTextChangedAt =
                    Date.now();

                record(
                    "assistant-text-changed",
                    {
                        id: cycle.id,
                        length: text.length
                    }
                );
            }

            const interruptedHandoff =
                text
                    ? parseInterruptedHandoff(text)
                    : {
                          requested: false,
                          nextChatPrompt: null,
                          error: null,
                          recoveredOuterEnd: false
                      };

            if (
                !text ||
                !interruptedHandoff.requested ||
                interruptedHandoff.error
            ) {
                setState(
                    "WAITING_FOR_INTERRUPTED_RESPONSE",
                    "⚠️ החיבור נקטע; התגובה החלקית אינה בטוחה להמשך אוטומטי ולכן ממתין להתאוששות ChatGPT.",
                    "#b45309"
                );
                return;
            }

            const interruptedStableFor =
                Date.now() -
                cycle.lastTextChangedAt;

            if (
                interruptedStableFor <
                CONFIG.STABLE_MS
            ) {
                setState(
                    "WAITING_FOR_INTERRUPTED_HANDOFF_STABLE",
                    "⏳ החיבור נקטע, אך נמצא handoff שלם מספיק; ממתין ליציבות הטקסט לפני המעבר...",
                    "#b45309"
                );
                return;
            }

            record(
                "connection-interrupted-handoff-recovered",
                {
                    id: cycle.id,
                    turnKey: cycle.turnKey,
                    recoveredOuterEnd:
                        !!interruptedHandoff.recoveredOuterEnd,
                    promptLength:
                        interruptedHandoff.nextChatPrompt.length,
                    stableFor:
                        interruptedStableFor
                }
            );

            setState(
                "EVALUATING",
                "🔎 החיבור נקטע, אך ה-handoff ניתן לשחזור בטוח; ממשיך למעבר...",
                "#17a2b8"
            );

            completeCycle(
                cycle,
                text,
                {
                    handoff:
                        interruptedHandoff
                }
            );
            return;
        }

        if (
            updateLongRunningWake(
                cycle,
                !!stopButton
            )
        ) {
            return;
        }

        const finalUiSeen =
            hasFinalUi(turn);
`,
    "connection interrupted evaluation"
  );

  write(path, s);
}

function patchMock() {
  const path = "tests/mock-chatgpt/mock-chatgpt.js";
  let s = read(path);

  s = replaceOnce(
    s,
    '  function runDeliveryTimeout(turn, response) {\n',
    `  function runConnectionInterrupted(turn, response) {
    beginGeneration();

    schedule(() => {
      const body = createAssistantBody(
        turn,
        response.wrapper || "markdown"
      );
      body.textContent = String(
        response.text ?? "Mock interrupted response"
      );

      const status = document.createElement("div");
      status.setAttribute("role", "status");

      const message = document.createElement("span");
      message.className = "text-chatgpt-recovery";
      message.textContent =
        "Connection interrupted. Waiting for the complete answer";

      status.appendChild(message);
      turn.appendChild(status);

      record("connection-interrupted", {
        turnKey: turn.getAttribute("data-turn-key"),
        text: normalize(body.textContent)
      });
    }, Number(response.delayMs ?? 80));
  }

  function runDeliveryTimeout(turn, response) {
`,
    "mock interrupted response"
  );

  s = replaceOnce(
    s,
    `    if (selected.type === "delivery-timeout") {
      runDeliveryTimeout(turn, selected);
      return;
    }
`,
    `    if (selected.type === "connection-interrupted") {
      runConnectionInterrupted(turn, selected);
      return;
    }

    if (selected.type === "delivery-timeout") {
      runDeliveryTimeout(turn, selected);
      return;
    }
`,
    "mock interrupted dispatch"
  );

  write(path, s);
}

function patchRegressions() {
  const path = "tests/e2e/regressions.spec.js";
  let s = read(path);
  const addition = `

test("connection interruption recovers a handoff when only the outer closing marker is missing", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      {
        type: "connection-interrupted",
        text: [
          "Current chat segment complete.",
          "סיימתי",
          "[[SEQUENCE_RUNNER_NEW_CHAT]]",
          "בשלב זה מומלץ לעבור לצ'אט חדש.",
          "[[NEXT_CHAT_PROMPT]]",
          "אני צאט 22 תתחיל",
          "[[/NEXT_CHAT_PROMPT]]"
        ].join("\\n")
      },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE", 8000);

  const state = await harness.page.evaluate(() => window.__sequenceRunner.getState());
  expect(state.handoffCount).toBe(1);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toContain("אני צאט 22 תתחיל");

  const events = await harness.events();
  expect(events.some((entry) => entry.type === "stop-click")).toBeFalsy();

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) =>
    entry.event === "connection-interrupted-handoff-recovered" &&
    entry.recoveredOuterEnd === true
  )).toBeTruthy();
});

test("connection interruption never promotes a bare completion marker to DONE", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "connection-interrupted", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("WAITING_FOR_INTERRUPTED_RESPONSE", 5000);

  const state = await harness.page.evaluate(() => window.__sequenceRunner.getState());
  expect(state.stopped).toBe(false);
  expect(state.state).toBe("WAITING_FOR_INTERRUPTED_RESPONSE");
  expect(await harness.sentMessages()).toHaveLength(1);

  await harness.page.evaluate(() => window.__sequenceRunner.stop());
});

test("pending first send yields to a newer interrupted external handoff instead of sending stale setup", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      {
        type: "connection-interrupted",
        text: [
          "Current chat segment complete.",
          "סיימתי",
          "[[SEQUENCE_RUNNER_NEW_CHAT]]",
          "בשלב זה מומלץ לעבור לצ'אט חדש.",
          "[[NEXT_CHAT_PROMPT]]",
          "אני צאט 22 תתחיל",
          "[[/NEXT_CHAT_PROMPT]]"
        ].join("\\n")
      },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => {
    window.__mockChatGPT.setComposerText("MANUAL_OVERRIDE");
  });
  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("WAITING_FOR_COMPOSER", 4000);
  await harness.page.locator('button[aria-label="Send"]').click();
  await harness.waitForState("DONE", 8000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[0]).toBe("MANUAL_OVERRIDE");
  expect(sent[1]).toContain("אני צאט 22 תתחיל");

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) =>
    entry.event === "first-send-superseded-by-external-handoff" &&
    entry.pendingLabel === "first"
  )).toBeTruthy();
  expect(log.some((entry) =>
    entry.event === "connection-interrupted-handoff-recovered"
  )).toBeTruthy();
});
`;

  if (s.includes('test("connection interruption recovers a handoff')) {
    throw new Error("Regression tests already patched");
  }
  s += addition;
  write(path, s);
}

function patchDocsAndVersions() {
  let s = read("README.md");
  s = replaceOnce(
    s,
    '- A watchdog wakes the state machine if a DOM mutation is missed; it does not independently decide to send.\n',
    '- If ChatGPT shows the exact recovery UI `Connection interrupted. Waiting for the complete answer`, that interruption state takes precedence over a lingering global Stop control. A handoff may be recovered only when the full `NEXT_CHAT_PROMPT` is present and non-empty and the only missing handoff marker is the final outer `[[/SEQUENCE_RUNNER_NEW_CHAT]]`. Any other partial response remains waiting for ChatGPT recovery; a bare `סיימתי` is never promoted to completion while the connection-interrupted UI is present. A deferred first Runner send also yields to a newer external turn only when that turn contains an unambiguous safe handoff.\n' +
      '- A watchdog wakes the state machine if a DOM mutation is missed; it does not independently decide to send.\n',
    "README interruption rule"
  );
  write("README.md", s);

  s = read("AGENTS.md");
  s = replaceOnce(
    s,
    'Stable-text timing remains a fallback when final UI is unavailable; with final UI present, the short stability window protects against evaluating an incomplete final DOM snapshot.\n\n### Long-running responses\n',
    'Stable-text timing remains a fallback when final UI is unavailable; with final UI present, the short stability window protects against evaluating an incomplete final DOM snapshot.\n\nIf ChatGPT shows the exact recovery UI `Connection interrupted. Waiting for the complete answer`, treat that interruption as stronger evidence than a lingering global Stop button. Do not evaluate arbitrary partial content. A handoff is recoverable only when `[[SEQUENCE_RUNNER_NEW_CHAT]]`, `[[NEXT_CHAT_PROMPT]]`, a non-empty prompt and `[[/NEXT_CHAT_PROMPT]]` are present in order, the prompt-end marker is the final response text, and the only missing handoff marker is the final outer `[[/SEQUENCE_RUNNER_NEW_CHAT]]`. Keep malformed or otherwise partial interrupted responses waiting for ChatGPT recovery, and never treat a bare interrupted `סיימתי` as global completion. If the first Runner send is deferred and a newer external turn appears, it may supersede that pending first send only when the turn has an unambiguous safe handoff under these rules.\n\n### Long-running responses\n',
    "AGENTS interruption authority"
  );
  s = replaceOnce(
    s,
    '- a valid handoff marker block is parsed only when it is complete and at the end of the response\n',
    '- a valid handoff marker block is parsed only when it is complete and at the end of the response\n' +
      '- an exact connection-interrupted response recovers a handoff only when the `NEXT_CHAT_PROMPT` is complete and only the final outer handoff close is missing\n' +
      '- a bare `סיימתי` under connection interruption does not complete the run, and a deferred first send yields only to an unambiguous newer handoff\n',
    "AGENTS regression coverage"
  );
  write("AGENTS.md", s);

  for (const path of [
    "tests/e2e/core.spec.js",
    "tests/e2e/diagnostic.spec.js"
  ]) {
    const current = read(path);
    if (!current.includes('"3.34"')) {
      throw new Error(`Version expectation not found in ${path}`);
    }
    write(path, current.replaceAll('"3.34"', '"3.35"'));
  }
}

patchRunner();
patchMock();
patchRegressions();
patchDocsAndVersions();
console.log("Interrupted handoff recovery patch applied.");
