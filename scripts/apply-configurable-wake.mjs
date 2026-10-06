import fs from "node:fs";

function replaceOnce(text, oldText, newText, label) {
  const first = text.indexOf(oldText);
  if (first < 0) {
    throw new Error(`Missing replacement target: ${label}`);
  }

  const second = text.indexOf(oldText, first + oldText.length);
  if (second >= 0) {
    throw new Error(`Replacement target is not unique: ${label}`);
  }

  return text.slice(0, first) + newText + text.slice(first + oldText.length);
}

function updateFile(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) {
    throw new Error(`No changes produced for ${path}`);
  }
  fs.writeFileSync(path, after, "utf8");
}

const defaultWakeMessage =
  "לוקח לך הרבה זמן, הכל בסדר? אם העבודה גדולה מדי, אתה יכול לחלק אותה ולהמשיך בהודעה נוספת.";
const shortWakeMessage = "מה קורה?";

updateFile("runner.js", (source) => {
  let text = source;

  text = replaceOnce(
    text,
    '    const VERSION = "3.30";',
    '    const VERSION = "3.31";',
    "version"
  );

  text = replaceOnce(
    text,
    `        LONG_WAIT_NOTICE_AFTER_MS: 5 * 60 * 1000,\n        LONG_WAIT_NOTICE_EVERY_MS: 60 * 1000,\n        LONG_WAIT_WAKE_AFTER_MS: 10 * 60 * 1000,\n        LONG_WAIT_WAKE_MESSAGE: "מה קורה?",`,
    `        LONG_WAIT_NOTICE_AFTER_MS: 5 * 60 * 1000,\n        LONG_WAIT_NOTICE_EVERY_MS: 60 * 1000,\n        LONG_WAIT_WAKE_MIN_MINUTES: 1,\n        LONG_WAIT_WAKE_MAX_MINUTES: 20,\n        LONG_WAIT_WAKE_DEFAULT_MINUTES: 5,\n        LONG_WAIT_WAKE_DEFAULT_MESSAGE: "${defaultWakeMessage}",\n        LONG_WAIT_WAKE_SHORT_MESSAGE: "${shortWakeMessage}",`,
    "wake config constants"
  );

  text = replaceOnce(
    text,
    `        '<div style="margin-top:6px;font-size:11px;color:#94a3b8">Steady ו־Deep עובדים במקטעים לפי מטרות ותוצאות; Deep דוחף למקטעים גדולים יותר. Autonomous מקבל החלטות סבירות וממשיך, Collaborative עוצר בהחלטות מהותיות. במצב “משימה חדשה” הטקסט משתלב בתוך הודעת הפתיחה.</div>',\n        '</div>',\n        '<div data-role="metrics" style="display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin-bottom:10px"></div>',`,
    `        '<div style="margin-top:6px;font-size:11px;color:#94a3b8">Steady ו־Deep עובדים במקטעים לפי מטרות ותוצאות; Deep דוחף למקטעים גדולים יותר. Autonomous מקבל החלטות סבירות וממשיך, Collaborative עוצר בהחלטות מהותיות. במצב “משימה חדשה” הטקסט משתלב בתוך הודעת הפתיחה.</div>',\n        '<div style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-top:10px">',\n        '<div style="font-weight:700;margin-bottom:7px">בדיקת תשובה ארוכה</div>',\n        '<div style="font-size:11px;color:#cbd5e1;margin-bottom:4px">שלח הודעת בדיקה אחרי:</div>',\n        '<select data-input="wake-after-minutes" style="width:100%;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px;margin-bottom:6px">' +\n            Array.from(\n                {\n                    length:\n                        CONFIG.LONG_WAIT_WAKE_MAX_MINUTES -\n                        CONFIG.LONG_WAIT_WAKE_MIN_MINUTES +\n                        1\n                },\n                function (_, index) {\n                    const minutes =\n                        CONFIG.LONG_WAIT_WAKE_MIN_MINUTES +\n                        index;\n\n                    return (\n                        '<option value="' +\n                        minutes +\n                        '"' +\n                        (minutes ===\n                        CONFIG.LONG_WAIT_WAKE_DEFAULT_MINUTES\n                            ? ' selected'\n                            : '') +\n                        '>' +\n                        minutes +\n                        (minutes === 1\n                            ? ' דקה'\n                            : ' דקות') +\n                        '</option>'\n                    );\n                }\n            ).join('') +\n            '</select>',\n        '<div style="font-size:11px;color:#cbd5e1;margin-bottom:4px">הודעת בדיקה:</div>',\n        '<select data-input="wake-message-preset" style="width:100%;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px;margin-bottom:6px">',\n        '<option value="supportive">' + escapeHtml(CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE) + '</option>',\n        '<option value="short">' + escapeHtml(CONFIG.LONG_WAIT_WAKE_SHORT_MESSAGE) + '</option>',\n        '<option value="custom">מותאם אישית</option>',\n        '</select>',\n        '<textarea data-input="wake-message" rows="3" style="width:100%;box-sizing:border-box;resize:vertical;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:7px;margin-bottom:6px">' + escapeHtml(CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE) + '</textarea>',\n        '<div style="font-size:10px;color:#94a3b8">ההודעה נשלחת לכל היותר פעם אחת לכל תשובה פעילה, בלי ללחוץ Stop ובלי לדרוס טקסט שכבר הוקלד.</div>',\n        '</div>',\n        '</div>',\n        '<div data-role="metrics" style="display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin-bottom:10px"></div>',`,
    "wake start controls"
  );

  text = replaceOnce(
    text,
    `    let selectedWorkStyle = "steady";\n    let selectedDecisionMode = "autonomous";\n    let runnerStartedAt = null;`,
    `    let selectedWorkStyle = "steady";\n    let selectedDecisionMode = "autonomous";\n    let selectedWakeAfterMinutes =\n        CONFIG.LONG_WAIT_WAKE_DEFAULT_MINUTES;\n    let selectedWakeMessage =\n        CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;\n    let runnerStartedAt = null;`,
    "wake runtime state"
  );

  text = replaceOnce(
    text,
    `    function normalizeDecisionMode(value) {\n        return value === "collaborative"\n            ? "collaborative"\n            : "autonomous";\n    }\n\n    function isDone(text) {`,
    `    function normalizeDecisionMode(value) {\n        return value === "collaborative"\n            ? "collaborative"\n            : "autonomous";\n    }\n\n    function normalizeWakeAfterMinutes(value) {\n        if (value == null || value === "") {\n            return CONFIG.LONG_WAIT_WAKE_DEFAULT_MINUTES;\n        }\n\n        const parsed = Number(value);\n\n        if (\n            !Number.isInteger(parsed) ||\n            parsed < CONFIG.LONG_WAIT_WAKE_MIN_MINUTES ||\n            parsed > CONFIG.LONG_WAIT_WAKE_MAX_MINUTES\n        ) {\n            throw new Error(\n                "Long-wait wake delay must be an integer from " +\n                    CONFIG.LONG_WAIT_WAKE_MIN_MINUTES +\n                    " to " +\n                    CONFIG.LONG_WAIT_WAKE_MAX_MINUTES +\n                    " minutes."\n            );\n        }\n\n        return parsed;\n    }\n\n    function normalizeWakeMessage(value) {\n        if (value == null) {\n            return CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;\n        }\n\n        const message = normalizeText(value);\n\n        if (!message) {\n            throw new Error(\n                "Long-wait wake message cannot be empty."\n            );\n        }\n\n        return message;\n    }\n\n    function getWakeMessagePreset(value) {\n        const message = normalizeText(value);\n\n        if (\n            message ===\n            normalizeText(\n                CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE\n            )\n        ) {\n            return "supportive";\n        }\n\n        if (\n            message ===\n            normalizeText(\n                CONFIG.LONG_WAIT_WAKE_SHORT_MESSAGE\n            )\n        ) {\n            return "short";\n        }\n\n        return "custom";\n    }\n\n    function isDone(text) {`,
    "wake normalizers"
  );

  text = replaceOnce(
    text,
    `    function formatDuration(ms) {\n        const totalSeconds = Math.max(0, Math.floor(ms / 1000));\n        const hours = Math.floor(totalSeconds / 3600);\n        const minutes = Math.floor((totalSeconds % 3600) / 60);\n        const seconds = totalSeconds % 60;\n\n        if (hours > 0) {\n            return hours + ":" +\n                String(minutes).padStart(2, "0") + ":" +\n                String(seconds).padStart(2, "0");\n        }\n\n        return minutes + ":" + String(seconds).padStart(2, "0");\n    }`,
    `    function formatDuration(ms) {\n        const totalSeconds = Math.max(0, Math.floor(ms / 1000));\n        const hours = Math.floor(totalSeconds / 3600);\n        const minutes = Math.floor((totalSeconds % 3600) / 60);\n        const seconds = totalSeconds % 60;\n\n        if (hours > 0) {\n            return hours + ":" +\n                String(minutes).padStart(2, "0") + ":" +\n                String(seconds).padStart(2, "0");\n        }\n\n        return minutes + ":" + String(seconds).padStart(2, "0");\n    }\n\n    function formatWakeDelay(minutes) {\n        return minutes === 1\n            ? "דקה"\n            : minutes + " דקות";\n    }`,
    "wake delay formatter"
  );

  text = replaceOnce(
    text,
    `        const decisionModeSelect = panel.querySelector(\n            '[data-input="decision-mode"]'\n        );\n\n        const syncStartModeControls = function () {`,
    `        const decisionModeSelect = panel.querySelector(\n            '[data-input="decision-mode"]'\n        );\n\n        const wakeAfterMinutesSelect = panel.querySelector(\n            '[data-input="wake-after-minutes"]'\n        );\n\n        const wakeMessagePresetSelect = panel.querySelector(\n            '[data-input="wake-message-preset"]'\n        );\n\n        const wakeMessageArea = panel.querySelector(\n            '[data-input="wake-message"]'\n        );\n\n        const syncWakePresetFromMessage = function () {\n            if (!wakeMessagePresetSelect) {\n                return;\n            }\n\n            wakeMessagePresetSelect.value =\n                getWakeMessagePreset(\n                    wakeMessageArea?.value || ""\n                );\n        };\n\n        wakeMessagePresetSelect?.addEventListener(\n            "change",\n            function () {\n                if (!wakeMessageArea) {\n                    return;\n                }\n\n                if (\n                    wakeMessagePresetSelect.value ===\n                    "supportive"\n                ) {\n                    wakeMessageArea.value =\n                        CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;\n                } else if (\n                    wakeMessagePresetSelect.value ===\n                    "short"\n                ) {\n                    wakeMessageArea.value =\n                        CONFIG.LONG_WAIT_WAKE_SHORT_MESSAGE;\n                }\n            }\n        );\n\n        wakeMessageArea?.addEventListener(\n            "input",\n            syncWakePresetFromMessage\n        );\n\n        const syncStartModeControls = function () {`,
    "wake control interactions"
  );

  text = replaceOnce(
    text,
    `                    workStyleSelect?.value || "steady",\n                    decisionModeSelect?.value || "autonomous",\n                    startMode === "existing-ready"\n                ).catch(function (err) {`,
    `                    workStyleSelect?.value || "steady",\n                    decisionModeSelect?.value || "autonomous",\n                    startMode === "existing-ready",\n                    wakeAfterMinutesSelect?.value,\n                    wakeMessageArea?.value\n                ).catch(function (err) {`,
    "start wake arguments"
  );

  text = replaceOnce(
    text,
    `        const decisionMode = panel.querySelector(\n            '[data-input="decision-mode"]'\n        );\n\n        const inputs = [`,
    `        const decisionMode = panel.querySelector(\n            '[data-input="decision-mode"]'\n        );\n\n        const wakeAfterMinutes = panel.querySelector(\n            '[data-input="wake-after-minutes"]'\n        );\n\n        const wakeMessagePreset = panel.querySelector(\n            '[data-input="wake-message-preset"]'\n        );\n\n        const wakeMessage = panel.querySelector(\n            '[data-input="wake-message"]'\n        );\n\n        const inputs = [`,
    "reset wake refs"
  );

  text = replaceOnce(
    text,
    `        if (decisionMode) {\n            decisionMode.value = "autonomous";\n        }\n\n        if (taskText) {`,
    `        if (decisionMode) {\n            decisionMode.value = "autonomous";\n        }\n\n        if (wakeAfterMinutes) {\n            wakeAfterMinutes.value = String(\n                CONFIG.LONG_WAIT_WAKE_DEFAULT_MINUTES\n            );\n        }\n\n        if (wakeMessagePreset) {\n            wakeMessagePreset.value = "supportive";\n        }\n\n        if (wakeMessage) {\n            wakeMessage.value =\n                CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;\n        }\n\n        if (taskText) {`,
    "reset wake values"
  );

  text = replaceOnce(
    text,
    `        selectedWorkStyle = "steady";\n        selectedDecisionMode = "autonomous";\n        runnerStartedAt = null;`,
    `        selectedWorkStyle = "steady";\n        selectedDecisionMode = "autonomous";\n        selectedWakeAfterMinutes =\n            CONFIG.LONG_WAIT_WAKE_DEFAULT_MINUTES;\n        selectedWakeMessage =\n            CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;\n        runnerStartedAt = null;`,
    "restart wake state"
  );

  text = replaceOnce(
    text,
    `                workStyle: selectedWorkStyle,\n                decisionMode: selectedDecisionMode,\n                currentCycle: diagnosticCycleSnapshot(currentCycle),`,
    `                workStyle: selectedWorkStyle,\n                decisionMode: selectedDecisionMode,\n                longWaitWake: {\n                    afterMinutes:\n                        selectedWakeAfterMinutes,\n                    message:\n                        selectedWakeMessage\n                },\n                currentCycle: diagnosticCycleSnapshot(currentCycle),`,
    "diagnostic wake state"
  );

  text = replaceOnce(
    text,
    `        if (\n            elapsedMs <\n            CONFIG.LONG_WAIT_WAKE_AFTER_MS\n        ) {`,
    `        if (\n            elapsedMs <\n            selectedWakeAfterMinutes * 60 * 1000\n        ) {`,
    "dynamic wake threshold"
  );

  text = replaceOnce(
    text,
    `            setState(\n                "GENERATING",\n                "⏰ עברו 10 דקות; יש טקסט בתיבת ההודעה ולכן ממתין רק כדי לא לדרוס אותו לפני שליחת ‘מה קורה?’.",\n                "#b45309"\n            );`,
    `            setState(\n                "GENERATING",\n                "⏰ עבר זמן הבדיקה שהוגדר (" +\n                    formatWakeDelay(\n                        selectedWakeAfterMinutes\n                    ) +\n                    "); יש טקסט בתיבת ההודעה ולכן ממתין רק כדי לא לדרוס אותו.",\n                "#b45309"\n            );`,
    "wake deferred status"
  );

  text = replaceOnce(
    text,
    `        sendImmediateInjection(\n            CONFIG.LONG_WAIT_WAKE_MESSAGE,\n            {\n                label: "wake",\n                source: "long-wait-wake",\n                countAsInjection: false,\n                sentStatusMessage:\n                    "⏰ נשלח ‘מה קורה?’ אחרי 10 דקות של אותה תשובה; עוקב אחר התגובה החדשה...",\n                sentStatusColor: "#b45309"\n            }\n        ).then(function () {`,
    `        sendImmediateInjection(\n            selectedWakeMessage,\n            {\n                label: "wake",\n                source: "long-wait-wake",\n                countAsInjection: false,\n                sentStatusMessage:\n                    "⏰ נשלחה הודעת בדיקה אחרי " +\n                    formatWakeDelay(\n                        selectedWakeAfterMinutes\n                    ) +\n                    "; עוקב אחר התגובה החדשה...",\n                sentStatusColor: "#b45309"\n            }\n        ).then(function () {`,
    "wake send message"
  );

  text = replaceOnce(
    text,
    `            record("long-wait-wake-threshold", {\n                id: cycle.id,\n                turnKey: cycle.turnKey,\n                elapsedMs\n            });`,
    `            record("long-wait-wake-threshold", {\n                id: cycle.id,\n                turnKey: cycle.turnKey,\n                elapsedMs,\n                afterMinutes:\n                    selectedWakeAfterMinutes,\n                message:\n                    selectedWakeMessage\n            });`,
    "wake threshold diagnostics"
  );

  text = replaceOnce(
    text,
    `    async function beginRun(\n        mode,\n        taskText,\n        workStyle,\n        decisionMode,\n        skipFirstMessage\n    ) {`,
    `    async function beginRun(\n        mode,\n        taskText,\n        workStyle,\n        decisionMode,\n        skipFirstMessage,\n        wakeAfterMinutes,\n        wakeMessage\n    ) {`,
    "beginRun signature"
  );

  text = replaceOnce(
    text,
    `        const decisions =\n            normalizeDecisionMode(decisionMode);\n\n        const shouldSkipFirstMessage =`,
    `        const decisions =\n            normalizeDecisionMode(decisionMode);\n\n        const normalizedWakeAfterMinutes =\n            normalizeWakeAfterMinutes(\n                wakeAfterMinutes\n            );\n\n        const normalizedWakeMessage =\n            normalizeWakeMessage(\n                wakeMessage\n            );\n\n        const shouldSkipFirstMessage =`,
    "beginRun wake normalization"
  );

  text = replaceOnce(
    text,
    `        selectedWorkStyle = style;\n        selectedDecisionMode = decisions;\n\n        runStarted = true;`,
    `        selectedWorkStyle = style;\n        selectedDecisionMode = decisions;\n        selectedWakeAfterMinutes =\n            normalizedWakeAfterMinutes;\n        selectedWakeMessage =\n            normalizedWakeMessage;\n\n        runStarted = true;`,
    "beginRun wake selection"
  );

  text = replaceOnce(
    text,
    `            workStyle: selectedWorkStyle,\n            decisionMode: selectedDecisionMode,\n            hasTaskText:`,
    `            workStyle: selectedWorkStyle,\n            decisionMode: selectedDecisionMode,\n            wakeAfterMinutes:\n                selectedWakeAfterMinutes,\n            wakeMessage:\n                selectedWakeMessage,\n            hasTaskText:`,
    "run-started wake log"
  );

  text = replaceOnce(
    text,
    `                workStyle: selectedWorkStyle,\n                decisionMode: selectedDecisionMode,\n                queuedIntermediateMessages:`,
    `                workStyle: selectedWorkStyle,\n                decisionMode: selectedDecisionMode,\n                longWaitWake: {\n                    afterMinutes:\n                        selectedWakeAfterMinutes,\n                    message:\n                        selectedWakeMessage\n                },\n                queuedIntermediateMessages:`,
    "public state wake config"
  );

  text = replaceOnce(
    text,
    `        startExistingContext: function (\n            workStyle,\n            decisionMode,\n            skipFirstMessage\n        ) {\n            return beginRun(\n                "existing",\n                "",\n                workStyle,\n                decisionMode,\n                skipFirstMessage\n            );\n        },\n        startWithTask: function (\n            taskText,\n            workStyle,\n            decisionMode\n        ) {\n            return beginRun(\n                "new",\n                taskText,\n                workStyle,\n                decisionMode\n            );\n        },`,
    `        startExistingContext: function (\n            workStyle,\n            decisionMode,\n            skipFirstMessage,\n            wakeAfterMinutes,\n            wakeMessage\n        ) {\n            return beginRun(\n                "existing",\n                "",\n                workStyle,\n                decisionMode,\n                skipFirstMessage,\n                wakeAfterMinutes,\n                wakeMessage\n            );\n        },\n        startWithTask: function (\n            taskText,\n            workStyle,\n            decisionMode,\n            wakeAfterMinutes,\n            wakeMessage\n        ) {\n            return beginRun(\n                "new",\n                taskText,\n                workStyle,\n                decisionMode,\n                false,\n                wakeAfterMinutes,\n                wakeMessage\n            );\n        },`,
    "public start wake args"
  );

  return text;
});

const wakeSpec = `import { test, expect } from "./fixture.js";\n\nconst DEFAULT_WAKE_MESSAGE =\n  "${defaultWakeMessage}";\n\nasync function installWakeClock(harness) {\n  await harness.page.evaluate(() => {\n    const realDateNow = Date.now.bind(Date);\n    window.__wakeClockOffsetMs = 0;\n    window.__wakeRealDateNow = realDateNow;\n    Date.now = () => realDateNow() + window.__wakeClockOffsetMs;\n  });\n}\n\nasync function advanceWakeClock(harness, offsetMs) {\n  await harness.page.evaluate((value) => {\n    window.__wakeClockOffsetMs = value;\n  }, offsetMs);\n}\n\nasync function waitForTrackedGeneration(harness) {\n  await expect.poll(\n    () => harness.page.evaluate(() => {\n      const cycle = window.__sequenceRunner.getState().currentCycle;\n      return !!cycle?.turnKey && !!document.querySelector('button[aria-label="Stop"]');\n    })\n  ).toBeTruthy();\n}\n\ntest("start panel exposes configurable wake defaults and presets", async ({ harness }) => {\n  await harness.load();\n\n  const config = await harness.page.evaluate(() => {\n    const delay = document.querySelector('[data-input="wake-after-minutes"]');\n    const preset = document.querySelector('[data-input="wake-message-preset"]');\n    const message = document.querySelector('[data-input="wake-message"]');\n\n    return {\n      delay: delay?.value || null,\n      delayOptions: delay ? [...delay.options].map((option) => option.value) : [],\n      preset: preset?.value || null,\n      presetOptions: preset ? [...preset.options].map((option) => option.value) : [],\n      message: message?.value || null\n    };\n  });\n\n  expect(config.delay).toBe("5");\n  expect(config.delayOptions).toEqual(\n    Array.from({ length: 20 }, (_, index) => String(index + 1))\n  );\n  expect(config.preset).toBe("supportive");\n  expect(config.presetOptions).toEqual(["supportive", "short", "custom"]);\n  expect(config.message).toBe(DEFAULT_WAKE_MESSAGE);\n\n  await harness.page.selectOption('[data-input="wake-message-preset"]', "short");\n  await expect(harness.page.locator('[data-input="wake-message"]')).toHaveValue("${shortWakeMessage}");\n\n  await harness.page.selectOption('[data-input="wake-message-preset"]', "supportive");\n  await expect(harness.page.locator('[data-input="wake-message"]')).toHaveValue(DEFAULT_WAKE_MESSAGE);\n});\n\ntest("edited wake delay and message are used for the active response", async ({ harness }) => {\n  await harness.load();\n  await installWakeClock(harness);\n  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });\n\n  await harness.page.selectOption('[data-input="wake-after-minutes"]', "2");\n  await harness.page.locator('[data-input="wake-message"]').fill("בדיקת התקדמות מותאמת");\n  await expect(harness.page.locator('[data-input="wake-message-preset"]')).toHaveValue("custom");\n  await harness.page.click('[data-action="start-run"]');\n  await waitForTrackedGeneration(harness);\n\n  await advanceWakeClock(harness, 2 * 60 * 1000 + 1000);\n  await harness.waitForSentCount(2);\n\n  const sent = await harness.sentMessages();\n  expect(sent[1]).toBe("בדיקת התקדמות מותאמת");\n\n  const state = await harness.page.evaluate(() => window.__sequenceRunner.getState());\n  expect(state.longWaitWake).toEqual({\n    afterMinutes: 2,\n    message: "בדיקת התקדמות מותאמת"\n  });\n\n  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));\n});\n\ntest("response that completes before five minutes is never nudged", async ({ harness }) => {\n  await harness.load();\n  await installWakeClock(harness);\n  await harness.setScenario({\n    responses: [{ type: "normal", text: "סיימתי", finishDelayMs: 120 }]\n  });\n\n  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());\n  await harness.waitForState("DONE");\n\n  expect(await harness.sentMessages()).toHaveLength(1);\n  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());\n  expect(log.some((entry) => entry.event === "long-wait-wake-sent")).toBeFalsy();\n});\n\ntest("same active response is nudged once after five minutes without clicking Stop", async ({ harness }) => {\n  await harness.load();\n  await installWakeClock(harness);\n  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });\n\n  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());\n  await waitForTrackedGeneration(harness);\n\n  await advanceWakeClock(harness, 5 * 60 * 1000 + 1000);\n  await harness.waitForSentCount(2);\n\n  await new Promise((resolve) => setTimeout(resolve, 120));\n\n  const sent = await harness.sentMessages();\n  expect(sent).toHaveLength(2);\n  expect(sent[1]).toBe(DEFAULT_WAKE_MESSAGE);\n  expect(sent).not.toContain("תמשיך לשלב הבא");\n\n  const events = await harness.events();\n  expect(events.some((event) => event.type === "stop-click")).toBeFalsy();\n\n  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());\n  expect(log.filter((entry) => entry.event === "long-wait-wake-threshold")).toHaveLength(1);\n  expect(log.filter((entry) => entry.event === "long-wait-wake-sent")).toHaveLength(1);\n\n  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));\n});\n\ntest("wake inserts text before requiring Send while generation is active", async ({ harness }) => {\n  await harness.load();\n  await installWakeClock(harness);\n  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });\n\n  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());\n  await waitForTrackedGeneration(harness);\n\n  await harness.page.evaluate(() => {\n    const composer = document.querySelector('[contenteditable="true"][data-composer-markdown]');\n    const sendButton = document.querySelector('button[aria-label="Send"]');\n\n    if (!composer || !sendButton) {\n      throw new Error("Mock composer/send controls not found");\n    }\n\n    sendButton.disabled = true;\n\n    composer.addEventListener("input", () => {\n      const text = String(composer.innerText || composer.textContent || "").trim();\n      if (text) {\n        sendButton.disabled = false;\n      }\n    });\n  });\n\n  await advanceWakeClock(harness, 5 * 60 * 1000 + 1000);\n  await harness.waitForSentCount(2);\n\n  const sent = await harness.sentMessages();\n  expect(sent[1]).toBe(DEFAULT_WAKE_MESSAGE);\n\n  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());\n  expect(log.some(\n    (entry) => entry.event === "long-wait-wake-deferred" && entry.reason === "send-unavailable"\n  )).toBeFalsy();\n  expect(log.filter((entry) => entry.event === "long-wait-wake-sent")).toHaveLength(1);\n\n  const events = await harness.events();\n  expect(events.some((event) => event.type === "stop-click")).toBeFalsy();\n\n  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));\n});\n\ntest("wake eligibility resets for the next tracked Assistant response", async ({ harness }) => {\n  await harness.load();\n  await installWakeClock(harness);\n  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }, { type: "hold" }] });\n\n  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());\n  await waitForTrackedGeneration(harness);\n\n  await advanceWakeClock(harness, 5 * 60 * 1000 + 1000);\n  await harness.waitForSentCount(2);\n\n  await expect.poll(\n    () => harness.page.evaluate(() => window.__sequenceRunner.getState().currentCycle?.id)\n  ).toBe(2);\n  await waitForTrackedGeneration(harness);\n\n  await advanceWakeClock(harness, 10 * 60 * 1000 + 2000);\n  await harness.waitForSentCount(3);\n\n  const sent = await harness.sentMessages();\n  expect(sent.slice(1)).toEqual([DEFAULT_WAKE_MESSAGE, DEFAULT_WAKE_MESSAGE]);\n\n  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());\n  expect(log.filter((entry) => entry.event === "long-wait-wake-sent")).toHaveLength(2);\n\n  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));\n});\n\ntest("occupied composer defers the wake without overwriting user text", async ({ harness }) => {\n  await harness.load();\n  await installWakeClock(harness);\n  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });\n\n  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());\n  await waitForTrackedGeneration(harness);\n\n  await harness.page.evaluate(() => window.__mockChatGPT.setComposerText("USER_DRAFT"));\n  await advanceWakeClock(harness, 5 * 60 * 1000 + 1000);\n\n  await expect.poll(\n    () => harness.page.evaluate(() => window.__sequenceRunner.getLog().some(\n      (entry) => entry.event === "long-wait-wake-deferred"\n    ))\n  ).toBeTruthy();\n\n  expect(await harness.sentMessages()).toHaveLength(1);\n  const draft = await harness.page.evaluate(() => window.__mockChatGPT.getState().composerText);\n  expect(draft).toBe("USER_DRAFT");\n\n  await harness.page.evaluate(() => window.__mockChatGPT.setComposerText(""));\n  await harness.waitForSentCount(2);\n\n  const sent = await harness.sentMessages();\n  expect(sent[1]).toBe(DEFAULT_WAKE_MESSAGE);\n\n  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));\n});\n`;
fs.writeFileSync("tests/e2e/wake.spec.js", wakeSpec, "utf8");

updateFile("README.md", (source) => {
  let text = source;

  text = replaceOnce(
    text,
    "Two deliberate exceptions may send while ChatGPT is still responding without clicking Stop: an explicit user-triggered **Send now** action, and the one-shot 10-minute long-running-response wake nudge.",
    "Two deliberate exceptions may send while ChatGPT is still responding without clicking Stop: an explicit user-triggered **Send now** action, and the one-shot configurable long-running-response wake nudge. The wake delay is selectable from 1–20 minutes (default 5), and its message can be chosen from presets or edited freely per run.",
    "README top wake summary"
  );

  text = replaceOnce(
    text,
    "- If the exact same tracked Assistant response remains actively generating for 10 minutes, the runner immediately attempts one `מה קורה?` wake nudge through the same immediate composer/send path used by **Send now**, without clicking Stop or resending the original runner prompt. It does not wait for the active response to finish and does not require Send to be available before inserting the wake text; after insertion the immediate-send path waits briefly for Send to become available. The nudge is one-shot per response and defers only when the composer already contains user text, so that text is never overwritten.",
    `- For each run, the start panel lets the user configure the long-running-response wake delay from 1–20 minutes and choose or edit the wake message. The default is 5 minutes with \`${defaultWakeMessage}\`; \`${shortWakeMessage}\` is also available as a preset, and custom text is supported. When the exact same tracked Assistant response remains actively generating past the configured delay, the runner immediately attempts that one wake message through the same immediate composer/send path used by **Send now**, without clicking Stop or resending the original runner prompt. It does not wait for the active response to finish and does not require Send to be available before inserting the wake text; after insertion the immediate-send path waits briefly for Send to become available. The nudge is one-shot per response and defers only when the composer already contains user text, so that text is never overwritten.`,
    "README long-running wake behavior"
  );

  text = replaceOnce(
    text,
    `Unknown or omitted values safely fall back to \`steady\` and \`autonomous\`.`,
    `Unknown or omitted work-style/decision values safely fall back to \`steady\` and \`autonomous\`. The wake settings can optionally be supplied programmatically as trailing arguments: \`startExistingContext(workStyle, decisionMode, skipFirstMessage, wakeAfterMinutes, wakeMessage)\` and \`startWithTask(taskText, workStyle, decisionMode, wakeAfterMinutes, wakeMessage)\`. Omitted wake values use the 5-minute default and default wake message.`,
    "README programmatic wake config"
  );

  return text;
});

updateFile("AGENTS.md", (source) => {
  let text = source;

  text = replaceOnce(
    text,
    "There are two deliberate send-while-generating exceptions, and neither may click Stop: an explicit user-triggered immediate intermediate message, and the one-shot 10-minute long-running-response wake nudge. Both use the immediate composer/send path and safely supersede the currently tracked cycle when they send.",
    "There are two deliberate send-while-generating exceptions, and neither may click Stop: an explicit user-triggered immediate intermediate message, and the one-shot configurable long-running-response wake nudge. The wake delay is a per-run setting from 1–20 minutes (default 5), and the wake message is selected/editable per run. Both exceptions use the immediate composer/send path and safely supersede the currently tracked cycle when they send.",
    "AGENTS send exceptions"
  );

  text = replaceOnce(
    text,
    "The one explicit automatic long-wait exception is a one-shot wake nudge for the same continuously active tracked Assistant response: after 10 minutes of active generation, immediately attempt to send `מה קורה?` once through the existing immediate composer/send path. Never wait for the active response to finish, never preflight on Send availability before inserting the wake text, never click Stop, never resend the interrupted runner prompt, never overwrite user composer text, and never send the nudge more than once for the same tracked response. If the composer already contains user text, defer only to preserve that draft; otherwise insert the wake text immediately and let the immediate-send path wait briefly for Send to become available after insertion. Eligibility resets for the next tracked Assistant response.",
    `The one explicit automatic long-wait exception is a one-shot wake nudge for the same continuously active tracked Assistant response. Its per-run delay must stay within 1–20 minutes and defaults to 5. Its default message is \`${defaultWakeMessage}\`, with \`${shortWakeMessage}\` available as a preset and arbitrary non-empty custom text allowed. When the configured delay elapses, immediately attempt to send the configured wake message once through the existing immediate composer/send path. Never wait for the active response to finish, never preflight on Send availability before inserting the wake text, never click Stop, never resend the interrupted runner prompt, never overwrite user composer text, and never send the nudge more than once for the same tracked response. If the composer already contains user text, defer only to preserve that draft; otherwise insert the wake text immediately and let the immediate-send path wait briefly for Send to become available after insertion. Eligibility resets for the next tracked Assistant response.`,
    "AGENTS long-wait wake contract"
  );

  return text;
});

updateFile("tests/README.md", (source) =>
  replaceOnce(
    source,
    `    intermediate.spec.js\n    recovery.spec.js\n    regressions.spec.js`,
    `    intermediate.spec.js\n    recovery.spec.js\n    regressions.spec.js\n    wake.spec.js`,
    "tests README wake layout"
  )
);

console.log("Applied configurable long-wait wake changes.");
