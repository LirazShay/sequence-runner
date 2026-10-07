import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceOnce(content, search, replacement, label) {
  const index = content.indexOf(search);
  if (index < 0) throw new Error(`Patch anchor not found: ${label}`);
  if (content.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Patch anchor is not unique: ${label}`);
  }
  return content.slice(0, index) + replacement + content.slice(index + search.length);
}

let runner = read("runner.js");

runner = replaceOnce(
  runner,
  '    const VERSION = "3.37";',
  '    const VERSION = "3.38";',
  "version"
);

runner = replaceOnce(
  runner,
  '        \'<div style="font-size:10px;color:#94a3b8">הודעת הבדיקה נשלחת לכל היותר פעם אחת לכל תשובה פעילה, בלי ללחוץ Stop ובלי לדרוס טקסט שכבר הוקלד.</div>\',',
  '        \'<div style="font-size:10px;color:#94a3b8">הודעת הבדיקה נשלחת לכל היותר פעם אחת לכל תשובה פעילה, בלי ללחוץ Stop ובלי לדרוס טקסט שכבר הוקלד. שינוי זמן או הודעה בזמן ריצה נכנס לתוקף מיד אם עדיין ניתן להחיל אותו על התשובה הפעילה, ובכל מקרה חל על התשובות הבאות.</div>\',',
  "wake live help"
);

runner = replaceOnce(
  runner,
  '        \'<div style="font-size:10px;color:#94a3b8">ברירת המחדל היא 10 דקות. אם הודעת הבדיקה נשלחה קודם, שעון הפיצול ממשיך מהתגובה הארוכה המקורית ולא מתחיל מחדש. הוראת הפיצול נשלחת פעם אחת, בלי ללחוץ Stop ובלי לדרוס טקסט קיים.</div>\',',
  '        \'<div style="font-size:10px;color:#94a3b8">ברירת המחדל היא 10 דקות. אם הודעת הבדיקה נשלחה קודם, שעון הפיצול ממשיך מהתגובה הארוכה המקורית ולא מתחיל מחדש. הוראת הפיצול נשלחת פעם אחת, בלי ללחוץ Stop ובלי לדרוס טקסט קיים. שינוי זמן או הודעה בזמן ריצה חל מיד כל עוד הוראת הפיצול עדיין לא נשלחה; לאחר שנשלחה, ההגדרה החדשה תחול על פרק העבודה הבא.</div>\',',
  "split live help"
);

const resetSplitFunction = `    function resetLongWorkSplitTracking(reason) {\n        const hadTracking =\n            longWorkStartedAt != null ||\n            splitState !== "idle";\n\n        if (hadTracking) {\n            record("long-wait-split-reset", {\n                reason: reason || null,\n                startedAt: longWorkStartedAt,\n                splitState\n            });\n        }\n\n        longWorkStartedAt = null;\n        splitState = "idle";\n        splitThresholdReachedAt = null;\n        splitDeferredReason = null;\n        splitSentAt = null;\n    }\n`;

const liveHelpers = `${resetSplitFunction}\n    function resetWakeConfigEligibility(cycle, reason) {\n        if (\n            !cycle ||\n            cycle.wakeState === "sent" ||\n            cycle.wakeState === "sending"\n        ) {\n            return false;\n        }\n\n        const hadState =\n            cycle.wakeState !== "idle" ||\n            cycle.wakeThresholdReachedAt != null ||\n            cycle.wakeDeferredReason != null;\n\n        cycle.wakeState = "idle";\n        cycle.wakeThresholdReachedAt = null;\n        cycle.wakeDeferredReason = null;\n\n        if (hadState) {\n            record("long-wait-wake-config-reset", {\n                id: cycle.id,\n                turnKey: cycle.turnKey,\n                reason\n            });\n        }\n\n        return true;\n    }\n\n    function resetSplitConfigEligibility(reason) {\n        if (\n            splitState === "sent" ||\n            splitState === "sending"\n        ) {\n            return false;\n        }\n\n        const hadState =\n            splitState !== "idle" ||\n            splitThresholdReachedAt != null ||\n            splitDeferredReason != null;\n\n        splitState = "idle";\n        splitThresholdReachedAt = null;\n        splitDeferredReason = null;\n\n        if (hadState) {\n            record("long-wait-split-config-reset", {\n                reason,\n                startedAt: longWorkStartedAt\n            });\n        }\n\n        return true;\n    }\n\n    function updateLongWaitWakeConfig(\n        afterMinutes,\n        message,\n        source\n    ) {\n        const nextAfterMinutes =\n            normalizeWakeAfterMinutes(afterMinutes);\n        const nextMessage =\n            normalizeWakeMessage(message);\n        const delayChanged =\n            nextAfterMinutes !== selectedWakeAfterMinutes;\n        const messageChanged =\n            nextMessage !== selectedWakeMessage;\n\n        if (!delayChanged && !messageChanged) {\n            return false;\n        }\n\n        selectedWakeAfterMinutes = nextAfterMinutes;\n        selectedWakeMessage = nextMessage;\n\n        const currentResponseLocked =\n            currentCycle?.wakeState === "sent" ||\n            currentCycle?.wakeState === "sending";\n\n        if (\n            runStarted &&\n            !stopped &&\n            currentCycle &&\n            !currentResponseLocked\n        ) {\n            resetWakeConfigEligibility(\n                currentCycle,\n                "runtime-config-updated"\n            );\n        }\n\n        record("long-wait-wake-config-updated", {\n            source: source || "runtime",\n            afterMinutes: selectedWakeAfterMinutes,\n            message: selectedWakeMessage,\n            delayChanged,\n            messageChanged,\n            appliesToCurrentResponse:\n                !!currentCycle &&\n                !currentResponseLocked\n        });\n\n        renderPanel();\n\n        if (runStarted && !stopped) {\n            scheduleEvaluate();\n        }\n\n        return true;\n    }\n\n    function updateLongWaitSplitConfig(\n        afterMinutes,\n        message,\n        source\n    ) {\n        const nextAfterMinutes =\n            normalizeSplitAfterMinutes(afterMinutes);\n        const nextMessage =\n            normalizeSplitMessage(message);\n        const delayChanged =\n            nextAfterMinutes !== selectedSplitAfterMinutes;\n        const messageChanged =\n            nextMessage !== selectedSplitMessage;\n\n        if (!delayChanged && !messageChanged) {\n            return false;\n        }\n\n        selectedSplitAfterMinutes = nextAfterMinutes;\n        selectedSplitMessage = nextMessage;\n\n        const currentEpisodeLocked =\n            splitState === "sent" ||\n            splitState === "sending";\n\n        if (\n            runStarted &&\n            !stopped &&\n            !currentEpisodeLocked\n        ) {\n            resetSplitConfigEligibility(\n                "runtime-config-updated"\n            );\n        }\n\n        record("long-wait-split-config-updated", {\n            source: source || "runtime",\n            afterMinutes: selectedSplitAfterMinutes,\n            message: selectedSplitMessage,\n            delayChanged,\n            messageChanged,\n            appliesToCurrentEpisode:\n                !currentEpisodeLocked\n        });\n\n        renderPanel();\n\n        if (runStarted && !stopped) {\n            scheduleEvaluate();\n        }\n\n        return true;\n    }\n`;

runner = replaceOnce(
  runner,
  resetSplitFunction,
  liveHelpers,
  "live config helpers"
);

const wakePresetHandler = `        wakeMessagePresetSelect?.addEventListener(\n            "change",\n            function () {\n                if (!wakeMessageArea) {\n                    return;\n                }\n\n                if (\n                    wakeMessagePresetSelect.value ===\n                    "supportive"\n                ) {\n                    wakeMessageArea.value =\n                        CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;\n                } else if (\n                    wakeMessagePresetSelect.value ===\n                    "short"\n                ) {\n                    wakeMessageArea.value =\n                        CONFIG.LONG_WAIT_WAKE_SHORT_MESSAGE;\n                }\n            }\n        );\n\n        wakeMessageArea?.addEventListener(\n            "input",\n            syncWakePresetFromMessage\n        );\n`;

const wakeLiveHandler = `        const applyLiveWakeConfig = function (source) {\n            if (!runStarted || stopped) {\n                return;\n            }\n\n            const message = normalizeText(\n                wakeMessageArea?.value || ""\n            );\n\n            if (!message) {\n                return;\n            }\n\n            try {\n                updateLongWaitWakeConfig(\n                    wakeAfterMinutesSelect?.value,\n                    message,\n                    source\n                );\n            } catch (err) {\n                record("long-wait-wake-config-rejected", {\n                    source,\n                    error: err?.message || String(err || "")\n                });\n            }\n        };\n\n        wakeAfterMinutesSelect?.addEventListener(\n            "change",\n            function () {\n                applyLiveWakeConfig("panel-delay");\n            }\n        );\n\n        wakeMessagePresetSelect?.addEventListener(\n            "change",\n            function () {\n                if (!wakeMessageArea) {\n                    return;\n                }\n\n                if (\n                    wakeMessagePresetSelect.value ===\n                    "supportive"\n                ) {\n                    wakeMessageArea.value =\n                        CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;\n                } else if (\n                    wakeMessagePresetSelect.value ===\n                    "short"\n                ) {\n                    wakeMessageArea.value =\n                        CONFIG.LONG_WAIT_WAKE_SHORT_MESSAGE;\n                }\n\n                applyLiveWakeConfig("panel-preset");\n            }\n        );\n\n        wakeMessageArea?.addEventListener(\n            "input",\n            function () {\n                syncWakePresetFromMessage();\n                applyLiveWakeConfig("panel-message");\n            }\n        );\n`;

runner = replaceOnce(
  runner,
  wakePresetHandler,
  wakeLiveHandler,
  "wake live listeners"
);

const splitPresetHandler = `        splitMessagePresetSelect?.addEventListener(\n            "change",\n            function () {\n                if (!splitMessageArea) {\n                    return;\n                }\n\n                if (\n                    splitMessagePresetSelect.value ===\n                    "split"\n                ) {\n                    splitMessageArea.value =\n                        CONFIG.LONG_WAIT_SPLIT_DEFAULT_MESSAGE;\n                } else if (\n                    splitMessagePresetSelect.value ===\n                    "short"\n                ) {\n                    splitMessageArea.value =\n                        CONFIG.LONG_WAIT_SPLIT_SHORT_MESSAGE;\n                }\n            }\n        );\n\n        splitMessageArea?.addEventListener(\n            "input",\n            syncSplitPresetFromMessage\n        );\n`;

const splitLiveHandler = `        const applyLiveSplitConfig = function (source) {\n            if (!runStarted || stopped) {\n                return;\n            }\n\n            const message = normalizeText(\n                splitMessageArea?.value || ""\n            );\n\n            if (!message) {\n                return;\n            }\n\n            try {\n                updateLongWaitSplitConfig(\n                    splitAfterMinutesSelect?.value,\n                    message,\n                    source\n                );\n            } catch (err) {\n                record("long-wait-split-config-rejected", {\n                    source,\n                    error: err?.message || String(err || "")\n                });\n            }\n        };\n\n        splitAfterMinutesSelect?.addEventListener(\n            "change",\n            function () {\n                applyLiveSplitConfig("panel-delay");\n            }\n        );\n\n        splitMessagePresetSelect?.addEventListener(\n            "change",\n            function () {\n                if (!splitMessageArea) {\n                    return;\n                }\n\n                if (\n                    splitMessagePresetSelect.value ===\n                    "split"\n                ) {\n                    splitMessageArea.value =\n                        CONFIG.LONG_WAIT_SPLIT_DEFAULT_MESSAGE;\n                } else if (\n                    splitMessagePresetSelect.value ===\n                    "short"\n                ) {\n                    splitMessageArea.value =\n                        CONFIG.LONG_WAIT_SPLIT_SHORT_MESSAGE;\n                }\n\n                applyLiveSplitConfig("panel-preset");\n            }\n        );\n\n        splitMessageArea?.addEventListener(\n            "input",\n            function () {\n                syncSplitPresetFromMessage();\n                applyLiveSplitConfig("panel-message");\n            }\n        );\n`;

runner = replaceOnce(
  runner,
  splitPresetHandler,
  splitLiveHandler,
  "split live listeners"
);

runner = replaceOnce(
  runner,
  `        sendMessageImmediately:\n            sendImmediateInjection,\n        resume:\n            resumePendingAutoSend,`,
  `        sendMessageImmediately:\n            sendImmediateInjection,\n        setLongWaitWake: function (\n            afterMinutes,\n            message\n        ) {\n            return updateLongWaitWakeConfig(\n                afterMinutes == null\n                    ? selectedWakeAfterMinutes\n                    : afterMinutes,\n                message == null\n                    ? selectedWakeMessage\n                    : message,\n                "api"\n            );\n        },\n        setLongWaitSplit: function (\n            afterMinutes,\n            message\n        ) {\n            return updateLongWaitSplitConfig(\n                afterMinutes == null\n                    ? selectedSplitAfterMinutes\n                    : afterMinutes,\n                message == null\n                    ? selectedSplitMessage\n                    : message,\n                "api"\n            );\n        },\n        resume:\n            resumePendingAutoSend,`,
  "public live setters"
);

write("runner.js", runner);

let wakeSpec = read("tests/e2e/wake.spec.js");
wakeSpec += `\n\ntest("wake delay and message updates apply immediately to the active response", async ({ harness }) => {\n  await harness.load();\n  await installWakeClock(harness);\n  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });\n\n  await harness.page.selectOption('[data-input="wake-after-minutes"]', "10");\n  await harness.page.selectOption('[data-input="split-after-minutes"]', "20");\n  await harness.page.click('[data-action="start-run"]');\n  await waitForTrackedGeneration(harness);\n\n  await advanceWakeClock(harness, 4 * 60 * 1000);\n  await harness.page.locator('[data-input="wake-message"]').fill("LIVE_WAKE_UPDATED");\n  await harness.page.selectOption('[data-input="wake-after-minutes"]', "3");\n  await harness.waitForSentCount(2);\n\n  const sent = await harness.sentMessages();\n  expect(sent[1]).toBe("LIVE_WAKE_UPDATED");\n\n  const state = await harness.page.evaluate(() => window.__sequenceRunner.getState());\n  expect(state.longWaitWake).toEqual({ afterMinutes: 3, message: "LIVE_WAKE_UPDATED" });\n\n  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());\n  expect(log.some((entry) => entry.event === "long-wait-wake-config-updated")).toBeTruthy();\n\n  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));\n});\n\ntest("raising the wake delay during a response postpones the current wake", async ({ harness }) => {\n  await harness.load();\n  await installWakeClock(harness);\n  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });\n\n  await harness.page.selectOption('[data-input="split-after-minutes"]', "20");\n  await harness.page.click('[data-action="start-run"]');\n  await waitForTrackedGeneration(harness);\n\n  await advanceWakeClock(harness, 4 * 60 * 1000);\n  await harness.page.selectOption('[data-input="wake-after-minutes"]', "10");\n  await advanceWakeClock(harness, 6 * 60 * 1000);\n  await new Promise((resolve) => setTimeout(resolve, 120));\n  expect(await harness.sentMessages()).toHaveLength(1);\n\n  await advanceWakeClock(harness, 10 * 60 * 1000 + 1000);\n  await harness.waitForSentCount(2);\n  const sent = await harness.sentMessages();\n  expect(sent[1]).toBe(DEFAULT_WAKE_MESSAGE);\n\n  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));\n});\n`;
write("tests/e2e/wake.spec.js", wakeSpec);

let splitSpec = read("tests/e2e/split-nudge.spec.js");
splitSpec += `\n\ntest("split delay and message updates apply immediately to the active work episode", async ({ harness }) => {\n  await harness.load();\n  await installClock(harness);\n  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });\n\n  await harness.page.selectOption('[data-input="wake-after-minutes"]', "20");\n  await harness.page.click('[data-action="start-run"]');\n  await waitForTrackedGeneration(harness);\n\n  await advanceClock(harness, 4 * 60 * 1000);\n  await harness.page.locator('[data-input="split-message"]').fill("LIVE_SPLIT_UPDATED");\n  await harness.page.selectOption('[data-input="split-after-minutes"]', "3");\n  await harness.waitForSentCount(2);\n\n  const sent = await harness.sentMessages();\n  expect(sent[1]).toBe("LIVE_SPLIT_UPDATED");\n\n  const state = await harness.page.evaluate(() => window.__sequenceRunner.getState());\n  expect(state.longWaitSplit.afterMinutes).toBe(3);\n  expect(state.longWaitSplit.message).toBe("LIVE_SPLIT_UPDATED");\n  expect(state.longWaitSplit.state).toBe("sent");\n\n  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());\n  expect(log.some((entry) => entry.event === "long-wait-split-config-updated")).toBeTruthy();\n\n  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));\n});\n\ntest("changing split settings after the split was sent does not duplicate the same episode", async ({ harness }) => {\n  await harness.load();\n  await installClock(harness);\n  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });\n\n  await harness.page.selectOption('[data-input="wake-after-minutes"]', "20");\n  await harness.page.selectOption('[data-input="split-after-minutes"]', "2");\n  await harness.page.click('[data-action="start-run"]');\n  await waitForTrackedGeneration(harness);\n\n  await advanceClock(harness, 2 * 60 * 1000 + 1000);\n  await harness.waitForSentCount(2);\n\n  await harness.page.locator('[data-input="split-message"]').fill("NEXT_EPISODE_SPLIT");\n  await harness.page.selectOption('[data-input="split-after-minutes"]', "1");\n  await new Promise((resolve) => setTimeout(resolve, 160));\n\n  expect(await harness.sentMessages()).toHaveLength(2);\n  const state = await harness.page.evaluate(() => window.__sequenceRunner.getState());\n  expect(state.longWaitSplit.afterMinutes).toBe(1);\n  expect(state.longWaitSplit.message).toBe("NEXT_EPISODE_SPLIT");\n  expect(state.longWaitSplit.state).toBe("sent");\n\n  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));\n});\n`;
write("tests/e2e/split-nudge.spec.js", splitSpec);

let diagnostic = read("tests/e2e/diagnostic.spec.js");
diagnostic = diagnostic.replaceAll('toBe("3.37")', 'toBe("3.38")');
write("tests/e2e/diagnostic.spec.js", diagnostic);

let agents = read("AGENTS.md");
agents = replaceOnce(
  agents,
  "The first automatic long-wait action is a one-shot wake nudge for the same continuously active tracked Assistant response.",
  "The first automatic long-wait action is a one-shot wake nudge for the same continuously active tracked Assistant response. Wake delay and message are live runtime settings: changing either control during a run immediately updates the active response when that response has not already sent/started sending its wake, and always updates future responses. Lowering the delay below already-elapsed generation time makes the wake eligible on the next state-machine evaluation; raising it postpones the current wake from the original generation start. Once a wake has been sent for a response, editing the controls must never create a second wake for that same response.",
  "AGENTS live wake"
);
agents = replaceOnce(
  agents,
  "The second automatic long-wait action is a stronger one-shot work-splitting escalation.",
  "The second automatic long-wait action is a stronger one-shot work-splitting escalation. Split delay and message are also live runtime settings: changes apply immediately to the current continuous long-work episode until that episode's split is sending/sent, and always apply to the next episode. Recalculate eligibility from the preserved original episode start rather than restarting the clock. Once the split escalation has been sent for an episode, editing controls must not send another split inside that episode.",
  "AGENTS live split"
);
write("AGENTS.md", agents);

let readme = read("README.md");
readme = replaceOnce(
  readme,
  "Wake defaults to 5 minutes and split defaults to 10 minutes; both delays are independently selectable from 1–20 minutes and both messages can be chosen from presets or edited freely per run. An automatic wake does not restart the split clock.",
  "Wake defaults to 5 minutes and split defaults to 10 minutes; both delays are independently selectable from 1–20 minutes and both messages can be chosen from presets or edited freely. These runtime controls stay live after the run starts: valid edits take effect immediately when the current response/work episode has not already consumed that one-shot action, and always affect future responses/episodes. An automatic wake does not restart the split clock.",
  "README live overview"
);
readme = replaceOnce(
  readme,
  "- For each run, the start panel lets the user configure the long-running-response wake delay from 1–20 minutes and choose or edit the wake message.",
  "- For each run, the panel lets the user configure the long-running-response wake delay from 1–20 minutes and choose or edit the wake message. The wake delay/message remain live while the run is active: changing them updates the current response if its one-shot wake has not already started sending, otherwise the new values apply from the next response. Delay changes are measured from the current response's original generation start, so lowering a delay can make it immediately due and raising it postpones the wake without resetting elapsed time.",
  "README live wake"
);
readme = replaceOnce(
  readme,
  "- A second independently configurable long-work split escalation defaults to 10 minutes (range 1–20).",
  "- A second independently configurable long-work split escalation defaults to 10 minutes (range 1–20). Its delay/message remain live until the current work episode has started sending or sent its one-shot split. Runtime edits reuse the original episode start time; after the split was already sent, the new values are retained for the next work episode without duplicating the current one.",
  "README live split"
);
readme += `\nProgrammatic live updates are also available while the runner is loaded:\n\n\`\`\`js\n__sequenceRunner.setLongWaitWake(8, "CUSTOM_WAKE")\n__sequenceRunner.setLongWaitSplit(12, "CUSTOM_SPLIT")\n\`\`\`\n\nPassing \`null\`/\`undefined\` for one argument preserves its currently selected value. Start-contract fields such as task mode, work style and decision mode are not silently rewritten mid-run because those instructions have already been sent to the assistant; controls that represent actual runner runtime behavior are the ones intended to be live.\n`;
write("README.md", readme);
