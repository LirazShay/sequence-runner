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

function replaceBlock(content, startAnchor, endAnchor, replacement, label) {
  const start = content.indexOf(startAnchor);
  const end = content.indexOf(endAnchor, start + startAnchor.length);
  if (start < 0 || end < 0) {
    throw new Error(`Patch block anchor not found: ${label}`);
  }
  return content.slice(0, start) + replacement + content.slice(end);
}

function patchRunner() {
  const path = "runner.js";
  let s = read(path);

  s = replaceOnce(s, 'const VERSION = "3.35";', 'const VERSION = "3.36";', "version");

  s = replaceBlock(
    s,
    "    function adoptExternalTurn(\n",
    "    function adoptExternalTurnForContinuation(\n",
    `    function adoptExternalTurn(
        baselineTurnKeys,
        trigger,
        pending,
        eventName,
        existingTurn,
        options
    ) {
        const opts = options || {};
        const baseline =
            normalizeTurnKeySnapshot(
                baselineTurnKeys
            );

        const turn =
            existingTurn ||
            findNewTurn(
                new Set(baseline)
            );

        if (
            !turn &&
            !opts.allowMissingTurn
        ) {
            return false;
        }

        const turnKey = getTurnKey(turn);
        const stopButton = getStopButton();

        if (!opts.preservePendingAutoSend) {
            pendingAutoSend = null;
        }
        sendLocked = false;

        currentCycle = {
            id:
                opts.id ||
                "external-" + Date.now(),
            label:
                opts.label || "external",
            prompt: null,
            beforeKeys: new Set(baseline),
            sentAt:
                opts.startedAt || Date.now(),
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
            countsTowardCompletedResponses:
                opts.countsTowardCompletedResponses !== false,
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
                turnKey,
                preservePendingAutoSend:
                    !!opts.preservePendingAutoSend,
                countsTowardCompletedResponses:
                    currentCycle.countsTowardCompletedResponses
            }
        );

        setState(
            stopButton
                ? "GENERATING"
                : "WAITING_FOR_RESPONSE",
            opts.statusMessage ||
                "👤 זוהתה הודעת משתמש חדשה; בודק קודם את התשובה החדשה...",
            "#b45309"
        );

        renderPanel();
        scheduleEvaluate();
        return true;
    }

`,
    "external turn adoption"
  );

  s = replaceOnce(
    s,
    `    function adoptExternalHandoffForPendingFirst(
`,
    `    function adoptExistingReadyActiveResponse(
        trigger,
        pending
    ) {
        if (
            !selectedSkipFirstMessage ||
            !getStopButton()
        ) {
            return false;
        }

        const turns = getTurns();
        const latestTurn =
            turns.at(-1) || null;
        const baseline =
            turns
                .slice(0, -1)
                .map(getTurnKey)
                .filter(Boolean);

        return adoptExternalTurn(
            baseline,
            trigger,
            pending,
            "existing-ready-active-response-adopted",
            latestTurn,
            {
                allowMissingTurn: true,
                preservePendingAutoSend: true,
                label: "external-startup",
                countsTowardCompletedResponses: false,
                statusMessage:
                    "👀 עוקב אחרי התגובה שכבר הייתה פעילה כשהריצה התחילה..."
            }
        );
    }

    function adoptExternalHandoffForPendingFirst(
`,
    "existing-ready active response adoption"
  );

  s = replaceOnce(
    s,
    `            (
                pendingAutoSend.label === "first" &&
                adoptExternalHandoffForPendingFirst(
                    pendingAutoSend.baselineTurnKeys,
                    "pending-resume",
                    pendingAutoSend
                )
            )
`,
    `            (
                pendingAutoSend.label === "first" &&
                (
                    adoptExistingReadyActiveResponse(
                        "pending-resume",
                        pendingAutoSend
                    ) ||
                    adoptExternalHandoffForPendingFirst(
                        pendingAutoSend.baselineTurnKeys,
                        "pending-resume",
                        pendingAutoSend
                    )
                )
            )
`,
    "pending first active response adoption"
  );

  s = replaceOnce(
    s,
    `            if (pendingAutoSend) {
                record(
                    "pending-auto-send-replaced-by-immediate-message",
                    {
                        label:
                            pendingAutoSend.label,
                        reason:
                            pendingAutoSend.reason
                    }
                );

                pendingAutoSend = null;
            }
`,
    `            if (pendingAutoSend) {
                if (
                    pendingAutoSend.label ===
                    "first"
                ) {
                    record(
                        "pending-first-send-preserved-by-immediate-message",
                        {
                            reason:
                                pendingAutoSend.reason,
                            source
                        }
                    );
                } else {
                    record(
                        "pending-auto-send-replaced-by-immediate-message",
                        {
                            label:
                                pendingAutoSend.label,
                            reason:
                                pendingAutoSend.reason
                        }
                    );

                    pendingAutoSend = null;
                }
            }
`,
    "preserve pending first across immediate send"
  );

  s = replaceOnce(
    s,
    `                deferAutoSend(
                    prompt,
                    label,
                    "chatgpt-busy",
                    deferBaselineTurnKeys
                );
                return false;
`,
    `                deferAutoSend(
                    prompt,
                    label,
                    "chatgpt-busy",
                    deferBaselineTurnKeys
                );

                if (
                    label === "first" &&
                    selectedSkipFirstMessage
                ) {
                    adoptExistingReadyActiveResponse(
                        "first-send-deferred",
                        pendingAutoSend
                    );
                }

                return false;
`,
    "adopt existing-ready response immediately when first send is blocked"
  );

  s = replaceOnce(
    s,
    `    function completeCycle(cycle, text, options) {
`,
    `    function clearPendingFirstSend(reason) {
        if (
            !pendingAutoSend ||
            pendingAutoSend.label !== "first"
        ) {
            return false;
        }

        record("pending-first-send-cleared", {
            reason,
            pendingReason:
                pendingAutoSend.reason
        });

        pendingAutoSend = null;
        renderPanel();
        return true;
    }

    function completeCycle(cycle, text, options) {
`,
    "pending first clear helper"
  );

  s = replaceOnce(
    s,
    `        cycle.processed = true;
        processedTurnKeys.add(cycle.turnKey);
        sendLocked = false;
        completedResponseCount++;
        renderPanel();
`,
    `        cycle.processed = true;
        processedTurnKeys.add(cycle.turnKey);
        sendLocked = false;

        const countsTowardCompletedResponses =
            cycle.countsTowardCompletedResponses !== false;

        if (countsTowardCompletedResponses) {
            completedResponseCount++;
        }

        renderPanel();
`,
    "external startup response count semantics"
  );

  s = replaceOnce(
    s,
    `            handoffValid:
                handoff.requested &&
                !handoff.error
        });
`,
    `            handoffValid:
                handoff.requested &&
                !handoff.error,
            counted:
                countsTowardCompletedResponses
        });
`,
    "response complete counted diagnostic"
  );

  s = replaceOnce(
    s,
    `        if (handoff.requested) {
            setState(
`,
    `        if (handoff.requested) {
            clearPendingFirstSend(
                "handoff"
            );

            setState(
`,
    "clear pending first on handoff"
  );

  s = replaceOnce(
    s,
    `        if (responseDone) {
            stop("done-keyword", true);
            return;
        }

        continuationCount++;
`,
    `        if (responseDone) {
            clearPendingFirstSend(
                "sequence-complete"
            );
            stop("done-keyword", true);
            return;
        }

        if (
            pendingAutoSend?.label ===
            "first"
        ) {
            setState(
                "READY_TO_SEND_FIRST",
                "🔐 התגובה הפעילה הסתיימה; שולח עכשיו את חוזה הבטיחות הראשון...",
                "#0369a1"
            );

            const completedCycle = cycle;

            setTimeout(function () {
                if (
                    stopped ||
                    currentCycle !==
                        completedCycle
                ) {
                    return;
                }

                currentCycle = null;

                resumePendingAutoSend(
                    false
                ).catch(function (err) {
                    fail(err.message, err);
                });
            }, CONFIG.CONTINUE_DELAY_MS);

            return;
        }

        continuationCount++;
`,
    "resume pending first before ordinary continuation"
  );

  s = replaceOnce(
    s,
    `        if (!turn) {
            if (stopButton) {
`,
    `        if (!turn) {
            const connectionInterrupted =
                getConnectionInterruptedStatus(
                    null
                );

            if (connectionInterrupted) {
                updateLongRunningWake(
                    cycle,
                    false
                );

                setState(
                    "WAITING_FOR_INTERRUPTED_RESPONSE",
                    "⚠️ החיבור נקטע; ממתין להתאוששות ChatGPT לפני פעולה נוספת.",
                    "#b45309"
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

            if (stopButton) {
`,
    "wake while tracked turn is temporarily unavailable"
  );

  const initialIdleStart = s.indexOf(`        if (getStopButton()) {\n            const idleWait = {\n                longWaitNoticeBucket: -1\n            };\n`);
  const initialSendStart = s.indexOf(`        try {\n            await sendPrompt(\n                firstPrompt,\n                "first"\n            );\n`, initialIdleStart);
  if (initialIdleStart < 0 || initialSendStart < 0) {
    throw new Error("Patch block anchor not found: initial idle bypass");
  }
  s = s.slice(0, initialIdleStart) + s.slice(initialSendStart);

  s = replaceOnce(
    s,
    `        const stopSelector = snapshot.selectors['button[aria-label="Stop"]'];
        const stopVisible = !!stopSelector && stopSelector.visibleCount > 0;
        if (
`,
    `        const stopSelector = snapshot.selectors['button[aria-label="Stop"]'];
        const stopVisible = !!stopSelector && stopSelector.visibleCount > 0;

        if (
            stopVisible &&
            snapshot.runner.runStarted &&
            !snapshot.runner.currentCycle &&
            !snapshot.runner.pendingAutoSend
        ) {
            observations.push({
                code: "UNTRACKED_ACTIVE_GENERATION",
                message: "ChatGPT is actively generating, but the runner has neither a tracked cycle nor a pending automatic send."
            });
        }

        if (
`,
    "diagnose untracked active generation"
  );

  s = replaceOnce(
    s,
    `            deliveryRetryClickedAt: cycle.deliveryRetryClickedAt ?? null,
            processed: !!cycle.processed,
`,
    `            deliveryRetryClickedAt: cycle.deliveryRetryClickedAt ?? null,
            countsTowardCompletedResponses:
                cycle.countsTowardCompletedResponses !== false,
            processed: !!cycle.processed,
`,
    "cycle diagnostic count flag"
  );

  write(path, s);
}

function patchCoreTests() {
  const path = "tests/e2e/core.spec.js";
  let s = read(path);

  s = replaceOnce(
    s,
    '    version: "3.35",\n',
    '    version: "3.36",\n',
    "bookmarklet version expectation"
  );

  const anchor = `test("compact existing-ready contract preserves work style and decision mode", async ({ harness }) => {`;
  const insertion = `test("existing-ready adopts an already-active opening response before sending its compact first contract", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "Opening response complete.", finishDelayMs: 180 },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => {
    window.__mockChatGPT.setComposerText("OPENING_ALREADY_SENT");
    document.querySelector('form[data-chatgpt-composer] button[aria-label="Send"]').click();
  });

  await expect.poll(
    () => harness.page.evaluate(() => window.__mockChatGPT.getState().activeGenerations)
  ).toBe(1);

  await harness.page.evaluate(() =>
    window.__sequenceRunner.startExistingContext("steady", "autonomous", true)
  );
  await harness.waitForState("DONE", 4000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[0]).toBe("OPENING_ALREADY_SENT");
  expect(sent[1]).toMatch(/^תמשיך לשלב הבא\./);
  expect(sent[1]).toContain("[[SEQUENCE_RUNNER_NEW_CHAT]]");

  const state = await harness.runnerState();
  expect(state.completedResponseCount).toBe(1);

  const metrics = await harness.page.evaluate(() => window.__sequenceRunner.getMetrics());
  expect(metrics.runner.sent).toBe(1);

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "existing-ready-active-response-adopted")).toBeTruthy();
});

test("existing-ready honors completion from the opening response already in flight", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "סיימתי", finishDelayMs: 180 }
    ]
  });

  await harness.page.evaluate(() => {
    window.__mockChatGPT.setComposerText("OPENING_ALREADY_SENT_DONE");
    document.querySelector('form[data-chatgpt-composer] button[aria-label="Send"]').click();
  });

  await expect.poll(
    () => harness.page.evaluate(() => window.__mockChatGPT.getState().activeGenerations)
  ).toBe(1);

  await harness.page.evaluate(() =>
    window.__sequenceRunner.startExistingContext("steady", "autonomous", true)
  );
  await harness.waitForState("DONE", 4000);

  expect(await harness.sentMessages()).toEqual(["OPENING_ALREADY_SENT_DONE"]);
  const metrics = await harness.page.evaluate(() => window.__sequenceRunner.getMetrics());
  expect(metrics.runner.sent).toBe(0);
  expect(metrics.runner.completed).toBe(0);
});

`;

  s = replaceOnce(s, anchor, insertion + anchor, "existing-ready active response tests");
  write(path, s);
}

function patchWakeTests() {
  const path = "tests/e2e/wake.spec.js";
  let s = read(path);

  const addition = `

test("existing-ready wakes the opening response that was already generating and preserves the pending compact contract", async ({ harness }) => {
  await harness.load();
  await installWakeClock(harness);
  await harness.setScenario({
    responses: [
      { type: "hold" },
      {
        type: "normal",
        replaceActiveGeneration: true,
        text: "Wake acknowledged."
      },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => {
    window.__mockChatGPT.setComposerText("OPENING_ALREADY_SENT_LONG");
    document.querySelector('form[data-chatgpt-composer] button[aria-label="Send"]').click();
  });

  await expect.poll(
    () => harness.page.evaluate(() => window.__mockChatGPT.getState().activeGenerations)
  ).toBe(1);

  await harness.page.evaluate(() =>
    window.__sequenceRunner.startExistingContext("steady", "autonomous", true)
  );

  await expect.poll(
    () => harness.page.evaluate(() => window.__sequenceRunner.getState().currentCycle?.label)
  ).toBe("external-startup");

  await advanceWakeClock(harness, 5 * 60 * 1000 + 1000);
  await harness.waitForState("DONE", 4000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(3);
  expect(sent[0]).toBe("OPENING_ALREADY_SENT_LONG");
  expect(sent[1]).toBe(DEFAULT_WAKE_MESSAGE);
  expect(sent[2]).toMatch(/^תמשיך לשלב הבא\./);
  expect(sent[2]).toContain("[[SEQUENCE_RUNNER_NEW_CHAT]]");

  const events = await harness.events();
  expect(events.some((event) => event.type === "stop-click")).toBeFalsy();

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "pending-first-send-preserved-by-immediate-message")).toBeTruthy();
  expect(log.filter((entry) => entry.event === "long-wait-wake-sent")).toHaveLength(1);
});

test("existing-ready connection interruption suppresses wake even when Stop lingers", async ({ harness }) => {
  await harness.load();
  await installWakeClock(harness);
  await harness.setScenario({
    responses: [
      { type: "connection-interrupted", text: "Partial interrupted response" }
    ]
  });

  await harness.page.evaluate(() => {
    window.__mockChatGPT.setComposerText("OPENING_ALREADY_SENT_INTERRUPTED");
    document.querySelector('form[data-chatgpt-composer] button[aria-label="Send"]').click();
  });

  await expect.poll(
    () => harness.page.evaluate(() => window.__mockChatGPT.getState().activeGenerations)
  ).toBe(1);

  await harness.page.evaluate(() =>
    window.__sequenceRunner.startExistingContext("steady", "autonomous", true)
  );
  await harness.waitForState("WAITING_FOR_INTERRUPTED_RESPONSE", 3000);

  await advanceWakeClock(harness, 5 * 60 * 1000 + 1000);
  await new Promise((resolve) => setTimeout(resolve, 120));

  expect(await harness.sentMessages()).toEqual(["OPENING_ALREADY_SENT_INTERRUPTED"]);
  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "long-wait-wake-sent")).toBeFalsy();

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});

test("tracked generation still wakes when its turn DOM is temporarily unavailable", async ({ harness }) => {
  await harness.load();
  await installWakeClock(harness);
  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await expect.poll(
    () => harness.page.evaluate(() => window.__sequenceRunner.getState().currentCycle?.activeGenerationStartedAt)
  ).not.toBeNull();

  await harness.page.evaluate(() => {
    document.querySelector('[data-turn-key]')?.remove();
  });

  await advanceWakeClock(harness, 5 * 60 * 1000 + 1000);
  await harness.waitForSentCount(2);

  const sent = await harness.sentMessages();
  expect(sent[1]).toBe(DEFAULT_WAKE_MESSAGE);
  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.filter((entry) => entry.event === "long-wait-wake-sent")).toHaveLength(1);

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});

test("ordinary startup defers behind unrelated generation without nudging it", async ({ harness }) => {
  await harness.load();
  await installWakeClock(harness);
  await harness.setScenario({
    responses: [
      { type: "normal", text: "Unrelated response.", finishDelayMs: 300 },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => {
    window.__mockChatGPT.setComposerText("UNRELATED_PRE_RUN_MESSAGE");
    document.querySelector('form[data-chatgpt-composer] button[aria-label="Send"]').click();
  });

  await expect.poll(
    () => harness.page.evaluate(() => window.__mockChatGPT.getState().activeGenerations)
  ).toBe(1);

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await advanceWakeClock(harness, 5 * 60 * 1000 + 1000);
  await new Promise((resolve) => setTimeout(resolve, 120));

  expect(await harness.sentMessages()).toEqual(["UNRELATED_PRE_RUN_MESSAGE"]);
  const preCompletionLog = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(preCompletionLog.some((entry) => entry.event === "long-wait-wake-sent")).toBeFalsy();

  await harness.waitForState("DONE", 4000);
  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).not.toBe(DEFAULT_WAKE_MESSAGE);
  expect(sent[1]).toContain("בכל פעם שאכתוב 'תמשיך לשלב הבא'");
});
`;

  s += addition;
  write(path, s);
}

function patchRecoveryTests() {
  const path = "tests/e2e/recovery.spec.js";
  let s = read(path);

  const anchor = `test("stale visible composer does not steal runner insertion from the current composer", async ({ harness }) => {`;
  const insertion = `test("a deferred first contract survives an explicit immediate message", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "hold" },
      {
        type: "normal",
        replaceActiveGeneration: true,
        text: "Immediate message handled."
      },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => {
    window.__mockChatGPT.setComposerText("UNRELATED_BUSY_RESPONSE");
    document.querySelector('form[data-chatgpt-composer] button[aria-label="Send"]').click();
  });

  await expect.poll(
    () => harness.page.evaluate(() => window.__mockChatGPT.getState().activeGenerations)
  ).toBe(1);

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("WAITING_FOR_EXTERNAL_ACTIVITY");

  await harness.page.evaluate(() =>
    window.__sequenceRunner.sendMessageImmediately("MANUAL_INTERMEDIATE")
  );
  await harness.waitForState("DONE", 4000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(3);
  expect(sent[0]).toBe("UNRELATED_BUSY_RESPONSE");
  expect(sent[1]).toBe("MANUAL_INTERMEDIATE");
  expect(sent[2]).toContain("בכל פעם שאכתוב 'תמשיך לשלב הבא'");

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "pending-first-send-preserved-by-immediate-message")).toBeTruthy();
});

`;

  s = replaceOnce(s, anchor, insertion + anchor, "pending first preservation test");
  write(path, s);
}

function patchAgents() {
  const path = "AGENTS.md";
  let s = read(path);

  const anchor = `The one explicit automatic long-wait exception is a one-shot wake nudge for the same continuously active tracked Assistant response. Its per-run delay must stay within 1–20 minutes and defaults to 5. Its default message is \`לוקח לך הרבה זמן, הכל בסדר? אם העבודה גדולה מדי, אתה יכול לחלק אותה ולהמשיך בהודעה נוספת.\`, with \`מה קורה?\` available as a preset and arbitrary non-empty custom text allowed. When the configured delay elapses, immediately attempt to send the configured wake message once through the existing immediate composer/send path. Never wait for the active response to finish, never preflight on Send availability before inserting the wake text, never click Stop, never resend the interrupted runner prompt, never overwrite user composer text, and never send the nudge more than once for the same tracked response. If the composer already contains user text, defer only to preserve that draft; otherwise insert the wake text immediately and let the immediate-send path wait briefly for Send to become available after insertion. Eligibility resets for the next tracked Assistant response.\n`;
  const extra = `\nStartup activity must use the same tracked-response machinery rather than a separate untracked wait loop. In existing-ready mode, if ChatGPT is already generating when the Runner starts, adopt that in-flight response as an external startup cycle so wake, interruption, completion and handoff rules still apply. That observed startup response does not increment Runner-response counters because the Runner did not send its opening message. Keep the compact first safety contract pending until it is actually sent or the sequence finishes/handoffs; a wake or explicit immediate message must not silently discard it. For ordinary existing/new-task startup, pre-existing unrelated ChatGPT generation may defer the first Runner send but must not receive an automatic wake nudge. A tracked cycle must continue wake timing even if its turn DOM is temporarily unavailable.\n`;
  s = replaceOnce(s, anchor, anchor + extra, "startup activity reliability rules");

  const testAnchor = `- a bare \`סיימתי\` under connection interruption does not complete the run, and a deferred first send yields only to an unambiguous newer handoff\n`;
  const testExtra = `- existing-ready startup adopts an already-active opening response, including wake and connection-interruption behavior\n- the compact first safety contract survives wake/immediate-message supersession and is sent after the adopted response unless completion or handoff makes it unnecessary\n- ordinary startup waits behind unrelated pre-existing generation without nudging it\n- wake timing survives temporary loss/replacement of the tracked turn DOM\n`;
  s = replaceOnce(s, testAnchor, testAnchor + testExtra, "startup cross-path regression coverage");

  write(path, s);
}

function patchReadme() {
  const path = "README.md";
  let s = read(path);

  const anchor = `- For each run, the start panel lets the user configure the long-running-response wake delay from 1–20 minutes and choose or edit the wake message. The default is 5 minutes with \`לוקח לך הרבה זמן, הכל בסדר? אם העבודה גדולה מדי, אתה יכול לחלק אותה ולהמשיך בהודעה נוספת.\`; \`מה קורה?\` is also available as a preset, and custom text is supported. When the exact same tracked Assistant response remains actively generating past the configured delay, the runner immediately attempts that one wake message through the same immediate composer/send path used by **Send now**, without clicking Stop or resending the original runner prompt. It does not wait for the active response to finish and does not require Send to be available before inserting the wake text; after insertion the immediate-send path waits briefly for Send to become available. The nudge is one-shot per response and defers only when the composer already contains user text, so that text is never overwritten.\n`;
  const extra = `- Startup no longer uses a separate untracked busy-wait path. If **Existing task + opening message already sent** is started while its opening response is already generating, that response is adopted into the normal tracked-cycle machinery, so wake, connection-interruption, completion and handoff behavior remain consistent. The compact first safety contract stays pending through wake or explicit immediate-message supersession and is sent afterward unless the adopted response already completes or hands off the sequence. The adopted pre-run response is not counted as a Runner response. Ordinary existing/new-task startup still defers behind unrelated pre-existing generation without nudging it.\n- Wake tracking is cycle-based rather than turn-node-based: temporary loss of the tracked turn DOM does not disable the one-shot long-response wake while generation is still active.\n`;
  s = replaceOnce(s, anchor, anchor + extra, "startup wake behavior docs");

  write(path, s);
}

function patchTestsReadme() {
  const path = "tests/README.md";
  let s = read(path);

  const anchor = `- an event timeline for exact send/generation/navigation ordering.\n`;
  const extra = `- pre-existing generation before Runner startup, including existing-ready adoption versus ordinary deferral;\n- tracked-generation tests where the turn DOM disappears while the global generation signal remains active.\n`;
  s = replaceOnce(s, anchor, anchor + extra, "mock capability coverage docs");

  write(path, s);
}

patchRunner();
patchCoreTests();
patchWakeTests();
patchRecoveryTests();
patchAgents();
patchReadme();
patchTestsReadme();

console.log("Applied active startup response tracking patch.");
