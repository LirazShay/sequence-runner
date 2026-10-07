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

function replaceFunction(content, startMarker, endMarker, replacement, label) {
  const start = content.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Function start not found: ${label}`);
  }
  const end = content.indexOf(endMarker, start + startMarker.length);
  if (end < 0) {
    throw new Error(`Function end not found: ${label}`);
  }
  return content.slice(0, start) + replacement + content.slice(end);
}

function replaceWithin(content, startMarker, endMarker, search, replacement, label) {
  const start = content.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Range start not found: ${label}`);
  }
  const end = content.indexOf(endMarker, start + startMarker.length);
  if (end < 0) {
    throw new Error(`Range end not found: ${label}`);
  }
  const section = content.slice(start, end);
  const patched = replaceOnce(section, search, replacement, label);
  return content.slice(0, start) + patched + content.slice(end);
}

const path = "runner.js";
let source = read(path);

source = replaceOnce(source, '    const VERSION = "3.36";', '    const VERSION = "3.37";', "version");

source = replaceOnce(
  source,
  '        LONG_WAIT_WAKE_SHORT_MESSAGE: "מה קורה?",\n',
  '        LONG_WAIT_WAKE_SHORT_MESSAGE: "מה קורה?",\n' +
    '        LONG_WAIT_SPLIT_MIN_MINUTES: 1,\n' +
    '        LONG_WAIT_SPLIT_MAX_MINUTES: 20,\n' +
    '        LONG_WAIT_SPLIT_DEFAULT_MINUTES: 10,\n' +
    '        LONG_WAIT_SPLIT_DEFAULT_MESSAGE: "העבודה הזו מתארכת יותר מדי לתשובה אחת. עצור בנקודת checkpoint בטוחה: סיים ואמת רק את המקטע הנוכחי. אם מה שנשאר גדול, חלק אותו למקטעים לפי התכנון, סכם בקצרה מה הושלם ומה המקטע הבא, ואז עצור וחכה ל\\\'תמשיך לשלב הבא\\\'. אל תתחיל את המקטע הבא באותה תשובה.",\n' +
    '        LONG_WAIT_SPLIT_SHORT_MESSAGE: "פצל את העבודה עכשיו: סיים checkpoint בטוח, סכם מה הושלם ומה הבא, עצור, והמשך רק אחרי \\\'תמשיך לשלב הבא\\\'.",\n',
  "split config"
);

source = replaceOnce(
  source,
  `        '<div style="font-size:10px;color:#94a3b8">ההודעה נשלחת לכל היותר פעם אחת לכל תשובה פעילה, בלי ללחוץ Stop ובלי לדרוס טקסט שכבר הוקלד.</div>',\n        '</div>',\n        '<div data-role="diagnostic" style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-top:10px">',`,
  `        '<div style="font-size:10px;color:#94a3b8">הודעת הבדיקה נשלחת לכל היותר פעם אחת לכל תשובה פעילה, בלי ללחוץ Stop ובלי לדרוס טקסט שכבר הוקלד.</div>',\n        '<div style="border-top:1px solid rgba(255,255,255,.10);padding-top:8px;margin-top:9px">',\n        '<div style="font-weight:700;margin-bottom:5px">פיצול עבודה ארוכה</div>',\n        '<div style="font-size:11px;color:#cbd5e1;margin-bottom:4px">שלח הוראת פיצול אחרי:</div>',\n        '<select data-input="split-after-minutes" style="width:100%;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px;margin-bottom:6px">' +\n            Array.from(\n                {\n                    length:\n                        CONFIG.LONG_WAIT_SPLIT_MAX_MINUTES -\n                        CONFIG.LONG_WAIT_SPLIT_MIN_MINUTES +\n                        1\n                },\n                function (_, index) {\n                    const minutes =\n                        CONFIG.LONG_WAIT_SPLIT_MIN_MINUTES +\n                        index;\n\n                    return (\n                        '<option value="' +\n                        minutes +\n                        '"' +\n                        (minutes ===\n                        CONFIG.LONG_WAIT_SPLIT_DEFAULT_MINUTES\n                            ? ' selected'\n                            : '') +\n                        '>' +\n                        minutes +\n                        (minutes === 1\n                            ? ' דקה'\n                            : ' דקות') +\n                        '</option>'\n                    );\n                }\n            ).join('') +\n            '</select>',\n        '<div style="font-size:11px;color:#cbd5e1;margin-bottom:4px">הוראת פיצול:</div>',\n        '<select data-input="split-message-preset" style="width:100%;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px;margin-bottom:6px">',\n        '<option value="split">' + escapeHtml(CONFIG.LONG_WAIT_SPLIT_DEFAULT_MESSAGE) + '</option>',\n        '<option value="short">' + escapeHtml(CONFIG.LONG_WAIT_SPLIT_SHORT_MESSAGE) + '</option>',\n        '<option value="custom">מותאם אישית</option>',\n        '</select>',\n        '<textarea data-input="split-message" rows="4" style="width:100%;box-sizing:border-box;resize:vertical;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:7px;margin-bottom:6px">' + escapeHtml(CONFIG.LONG_WAIT_SPLIT_DEFAULT_MESSAGE) + '</textarea>',\n        '<div style="font-size:10px;color:#94a3b8">ברירת המחדל היא 10 דקות. אם הודעת הבדיקה נשלחה קודם, שעון הפיצול ממשיך מהתגובה הארוכה המקורית ולא מתחיל מחדש. הוראת הפיצול נשלחת פעם אחת, בלי ללחוץ Stop ובלי לדרוס טקסט קיים.</div>',\n        '</div>',\n        '</div>',\n        '<div data-role="diagnostic" style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-top:10px">',`,
  "split panel controls"
);

source = replaceOnce(
  source,
  `    let selectedWakeMessage =\n        CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;\n    let runnerStartedAt = null;`,
  `    let selectedWakeMessage =\n        CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;\n    let selectedSplitAfterMinutes =\n        CONFIG.LONG_WAIT_SPLIT_DEFAULT_MINUTES;\n    let selectedSplitMessage =\n        CONFIG.LONG_WAIT_SPLIT_DEFAULT_MESSAGE;\n    let longWorkStartedAt = null;\n    let splitState = "idle";\n    let splitThresholdReachedAt = null;\n    let splitDeferredReason = null;\n    let splitSentAt = null;\n    let runnerStartedAt = null;`,
  "split state variables"
);

source = replaceOnce(
  source,
  `        return "custom";\n    }\n\n    function isDone(text) {`,
  `        return "custom";\n    }\n\n    function normalizeSplitAfterMinutes(value) {\n        if (value == null || value === "") {\n            return CONFIG.LONG_WAIT_SPLIT_DEFAULT_MINUTES;\n        }\n\n        const parsed = Number(value);\n\n        if (\n            !Number.isInteger(parsed) ||\n            parsed < CONFIG.LONG_WAIT_SPLIT_MIN_MINUTES ||\n            parsed > CONFIG.LONG_WAIT_SPLIT_MAX_MINUTES\n        ) {\n            throw new Error(\n                "Long-wait split delay must be an integer from " +\n                    CONFIG.LONG_WAIT_SPLIT_MIN_MINUTES +\n                    " to " +\n                    CONFIG.LONG_WAIT_SPLIT_MAX_MINUTES +\n                    " minutes."\n            );\n        }\n\n        return parsed;\n    }\n\n    function normalizeSplitMessage(value) {\n        if (value == null) {\n            return CONFIG.LONG_WAIT_SPLIT_DEFAULT_MESSAGE;\n        }\n\n        const message = normalizeText(value);\n\n        if (!message) {\n            throw new Error(\n                "Long-wait split message cannot be empty."\n            );\n        }\n\n        return message;\n    }\n\n    function getSplitMessagePreset(value) {\n        const message = normalizeText(value);\n\n        if (\n            message ===\n            normalizeText(\n                CONFIG.LONG_WAIT_SPLIT_DEFAULT_MESSAGE\n            )\n        ) {\n            return "split";\n        }\n\n        if (\n            message ===\n            normalizeText(\n                CONFIG.LONG_WAIT_SPLIT_SHORT_MESSAGE\n            )\n        ) {\n            return "short";\n        }\n\n        return "custom";\n    }\n\n    function resetLongWorkSplitTracking(reason) {\n        const hadTracking =\n            longWorkStartedAt != null ||\n            splitState !== "idle";\n\n        if (hadTracking) {\n            record("long-wait-split-reset", {\n                reason: reason || null,\n                startedAt: longWorkStartedAt,\n                splitState\n            });\n        }\n\n        longWorkStartedAt = null;\n        splitState = "idle";\n        splitThresholdReachedAt = null;\n        splitDeferredReason = null;\n        splitSentAt = null;\n    }\n\n    function isDone(text) {`,
  "split normalizers"
);

source = replaceWithin(
  source,
  "    function setupPanelInteractions() {",
  "    function clearComposer(composer) {",
  `        const wakeMessageArea = panel.querySelector(\n            '[data-input="wake-message"]'\n        );\n`,
  `        const wakeMessageArea = panel.querySelector(\n            '[data-input="wake-message"]'\n        );\n\n        const splitAfterMinutesSelect = panel.querySelector(\n            '[data-input="split-after-minutes"]'\n        );\n\n        const splitMessagePresetSelect = panel.querySelector(\n            '[data-input="split-message-preset"]'\n        );\n\n        const splitMessageArea = panel.querySelector(\n            '[data-input="split-message"]'\n        );\n`,
  "split panel references"
);

source = replaceWithin(
  source,
  "    function setupPanelInteractions() {",
  "    function clearComposer(composer) {",
  `        wakeMessageArea?.addEventListener(\n            "input",\n            syncWakePresetFromMessage\n        );\n`,
  `        wakeMessageArea?.addEventListener(\n            "input",\n            syncWakePresetFromMessage\n        );\n\n        const syncSplitPresetFromMessage = function () {\n            if (!splitMessagePresetSelect) {\n                return;\n            }\n\n            splitMessagePresetSelect.value =\n                getSplitMessagePreset(\n                    splitMessageArea?.value || ""\n                );\n        };\n\n        splitMessagePresetSelect?.addEventListener(\n            "change",\n            function () {\n                if (!splitMessageArea) {\n                    return;\n                }\n\n                if (\n                    splitMessagePresetSelect.value ===\n                    "split"\n                ) {\n                    splitMessageArea.value =\n                        CONFIG.LONG_WAIT_SPLIT_DEFAULT_MESSAGE;\n                } else if (\n                    splitMessagePresetSelect.value ===\n                    "short"\n                ) {\n                    splitMessageArea.value =\n                        CONFIG.LONG_WAIT_SPLIT_SHORT_MESSAGE;\n                }\n            }\n        );\n\n        splitMessageArea?.addEventListener(\n            "input",\n            syncSplitPresetFromMessage\n        );\n`,
  "split preset interactions"
);

source = replaceWithin(
  source,
  "    function setupPanelInteractions() {",
  "    function clearComposer(composer) {",
  `                    wakeAfterMinutesSelect?.value,\n                    wakeMessageArea?.value\n                ).catch(function (err) {`,
  `                    wakeAfterMinutesSelect?.value,\n                    wakeMessageArea?.value,\n                    splitAfterMinutesSelect?.value,\n                    splitMessageArea?.value\n                ).catch(function (err) {`,
  "start split settings"
);

source = replaceWithin(
  source,
  "    function resetPanelForNewRun() {",
  "    async function restartRunner() {",
  `        const wakeMessage = panel.querySelector(\n            '[data-input="wake-message"]'\n        );\n`,
  `        const wakeMessage = panel.querySelector(\n            '[data-input="wake-message"]'\n        );\n\n        const splitAfterMinutes = panel.querySelector(\n            '[data-input="split-after-minutes"]'\n        );\n\n        const splitMessagePreset = panel.querySelector(\n            '[data-input="split-message-preset"]'\n        );\n\n        const splitMessage = panel.querySelector(\n            '[data-input="split-message"]'\n        );\n`,
  "reset split panel references"
);

source = replaceWithin(
  source,
  "    function resetPanelForNewRun() {",
  "    async function restartRunner() {",
  `        if (wakeMessage) {\n            wakeMessage.value =\n                CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;\n        }\n`,
  `        if (wakeMessage) {\n            wakeMessage.value =\n                CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;\n        }\n\n        if (splitAfterMinutes) {\n            splitAfterMinutes.value = String(\n                CONFIG.LONG_WAIT_SPLIT_DEFAULT_MINUTES\n            );\n        }\n\n        if (splitMessagePreset) {\n            splitMessagePreset.value = "split";\n        }\n\n        if (splitMessage) {\n            splitMessage.value =\n                CONFIG.LONG_WAIT_SPLIT_DEFAULT_MESSAGE;\n        }\n`,
  "reset split panel defaults"
);

source = replaceWithin(
  source,
  "    async function restartRunner() {",
  "    function stop(reason, completed) {",
  `        selectedWakeMessage =\n            CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;\n        runnerStartedAt`,
  `        selectedWakeMessage =\n            CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;\n        selectedSplitAfterMinutes =\n            CONFIG.LONG_WAIT_SPLIT_DEFAULT_MINUTES;\n        selectedSplitMessage =\n            CONFIG.LONG_WAIT_SPLIT_DEFAULT_MESSAGE;\n        resetLongWorkSplitTracking("restart");\n        runnerStartedAt`,
  "restart split state"
);

source = replaceWithin(
  source,
  "    function adoptExternalTurn(",
  "    function adoptExternalTurnForContinuation(",
  `        currentCycle = {`,
  `        resetLongWorkSplitTracking("external-turn-adopted");\n\n        currentCycle = {`,
  "external turn split reset"
);

source = replaceWithin(
  source,
  "    async function sendImmediateInjection(text, options) {",
  "    async function sendPrompt(",
  `            sendLocked = true;\n\n            const id = ++cycleSeq;`,
  `            if (\n                source !== "long-wait-wake" &&\n                source !== "long-wait-split"\n            ) {\n                resetLongWorkSplitTracking(\n                    "immediate-message"\n                );\n            }\n\n            sendLocked = true;\n\n            const id = ++cycleSeq;`,
  "immediate split tracking preservation"
);

source = replaceWithin(
  source,
  "    async function sendPrompt(",
  "    async function performChatHandoff(",
  `        const id = ++cycleSeq;\n\n        currentCycle = {`,
  `        resetLongWorkSplitTracking(\n            "runner-send"\n        );\n\n        const id = ++cycleSeq;\n\n        currentCycle = {`,
  "normal send split reset"
);

source = replaceWithin(
  source,
  "    async function recoverDeliveryFailure(cycle, failure) {",
  "    function sleep(ms) {",
  `        cycle.wakeSentAt = null;\n\n        record("delivery-retry-clicked", {`,
  `        cycle.wakeSentAt = null;\n        resetLongWorkSplitTracking(\n            "delivery-retry"\n        );\n\n        record("delivery-retry-clicked", {`,
  "delivery retry split reset"
);

const longWaitFunction = `    function updateLongRunningWake(cycle, stopButton) {\n        const now = Date.now();\n\n        if (!stopButton) {\n            if (\n                cycle.activeGenerationStartedAt != null &&\n                cycle.wakeState !== "sent" &&\n                cycle.wakeState !== "sending"\n            ) {\n                if (cycle.wakeState === "deferred") {\n                    record("long-wait-wake-cancelled", {\n                        id: cycle.id,\n                        turnKey: cycle.turnKey,\n                        reason: "generation-ended-before-send"\n                    });\n                }\n\n                cycle.activeGenerationStartedAt = null;\n                cycle.wakeState = "idle";\n                cycle.wakeThresholdReachedAt = null;\n                cycle.wakeDeferredReason = null;\n            }\n\n            if (longWorkStartedAt != null) {\n                if (splitState === "deferred") {\n                    record("long-wait-split-cancelled", {\n                        reason: "generation-ended-before-send"\n                    });\n                }\n\n                resetLongWorkSplitTracking(\n                    "generation-ended"\n                );\n            }\n\n            return false;\n        }\n\n        if (cycle.activeGenerationStartedAt == null) {\n            cycle.activeGenerationStartedAt = now;\n\n            record("generation-active-tracked", {\n                id: cycle.id,\n                turnKey: cycle.turnKey\n            });\n        }\n\n        if (longWorkStartedAt == null) {\n            longWorkStartedAt =\n                cycle.activeGenerationStartedAt || now;\n\n            record("long-work-split-tracked", {\n                id: cycle.id,\n                turnKey: cycle.turnKey,\n                startedAt: longWorkStartedAt\n            });\n        }\n\n        const splitElapsedMs =\n            now - longWorkStartedAt;\n\n        if (\n            splitElapsedMs >=\n                selectedSplitAfterMinutes * 60 * 1000 &&\n            splitState !== "sent" &&\n            splitState !== "sending" &&\n            splitState !== "failed"\n        ) {\n            if (!splitThresholdReachedAt) {\n                splitThresholdReachedAt = now;\n\n                record("long-wait-split-threshold", {\n                    id: cycle.id,\n                    turnKey: cycle.turnKey,\n                    elapsedMs: splitElapsedMs,\n                    afterMinutes:\n                        selectedSplitAfterMinutes,\n                    message:\n                        selectedSplitMessage\n                });\n            }\n\n            const deferredReason =\n                getComposerText()\n                    ? "composer-occupied"\n                    : null;\n\n            if (deferredReason) {\n                if (\n                    splitState !== "deferred" ||\n                    splitDeferredReason !==\n                        deferredReason\n                ) {\n                    record("long-wait-split-deferred", {\n                        id: cycle.id,\n                        turnKey: cycle.turnKey,\n                        reason: deferredReason,\n                        elapsedMs: splitElapsedMs\n                    });\n                }\n\n                splitState = "deferred";\n                splitDeferredReason =\n                    deferredReason;\n\n                setState(\n                    "GENERATING",\n                    "⏰ עבר זמן הפיצול שהוגדר (" +\n                        formatWakeDelay(\n                            selectedSplitAfterMinutes\n                        ) +\n                        "); יש טקסט בתיבת ההודעה ולכן ממתין רק כדי לא לדרוס אותו.",\n                    "#b45309"\n                );\n\n                return true;\n            }\n\n            splitState = "sending";\n            splitDeferredReason = null;\n\n            record("long-wait-split-sending", {\n                id: cycle.id,\n                turnKey: cycle.turnKey,\n                elapsedMs: splitElapsedMs\n            });\n\n            sendImmediateInjection(\n                selectedSplitMessage,\n                {\n                    label: "split",\n                    source: "long-wait-split",\n                    countAsInjection: false,\n                    sentStatusMessage:\n                        "✂️ נשלחה הוראת פיצול אחרי " +\n                        formatWakeDelay(\n                            selectedSplitAfterMinutes\n                        ) +\n                        "; ממתין ל-checkpoint של העבודה...",\n                    sentStatusColor: "#b45309"\n                }\n            ).then(function () {\n                splitState = "sent";\n                splitSentAt = Date.now();\n\n                record("long-wait-split-sent", {\n                    id: cycle.id,\n                    turnKey: cycle.turnKey,\n                    elapsedMs: splitElapsedMs\n                });\n            }).catch(function (err) {\n                splitState = "failed";\n\n                record("long-wait-split-failed", {\n                    id: cycle.id,\n                    turnKey: cycle.turnKey,\n                    elapsedMs: splitElapsedMs,\n                    error:\n                        err?.message ||\n                        String(err || "")\n                });\n\n                if (!stopped) {\n                    setState(\n                        "GENERATING",\n                        "⚠️ לא ניתן היה לשלוח את הוראת הפיצול בבטחה; ממשיך להמתין לתגובה.",\n                        "#b45309"\n                    );\n                }\n            });\n\n            return true;\n        }\n\n        if (\n            splitState === "sending" ||\n            splitState === "sent" ||\n            splitState === "deferred"\n        ) {\n            return splitState === "sending" ||\n                splitState === "deferred";\n        }\n\n        const elapsedMs =\n            now - cycle.activeGenerationStartedAt;\n\n        if (\n            elapsedMs <\n            selectedWakeAfterMinutes * 60 * 1000\n        ) {\n            return false;\n        }\n\n        if (\n            cycle.wakeState === "sent" ||\n            cycle.wakeState === "sending" ||\n            cycle.wakeState === "failed"\n        ) {\n            return cycle.wakeState === "sending";\n        }\n\n        if (!cycle.wakeThresholdReachedAt) {\n            cycle.wakeThresholdReachedAt = now;\n\n            record("long-wait-wake-threshold", {\n                id: cycle.id,\n                turnKey: cycle.turnKey,\n                elapsedMs,\n                afterMinutes:\n                    selectedWakeAfterMinutes,\n                message:\n                    selectedWakeMessage\n            });\n        }\n\n        const deferredReason =\n            getComposerText()\n                ? "composer-occupied"\n                : null;\n\n        if (deferredReason) {\n            if (\n                cycle.wakeState !== "deferred" ||\n                cycle.wakeDeferredReason !== deferredReason\n            ) {\n                record("long-wait-wake-deferred", {\n                    id: cycle.id,\n                    turnKey: cycle.turnKey,\n                    reason: deferredReason,\n                    elapsedMs\n                });\n            }\n\n            cycle.wakeState = "deferred";\n            cycle.wakeDeferredReason = deferredReason;\n\n            setState(\n                "GENERATING",\n                "⏰ עבר זמן הבדיקה שהוגדר (" +\n                    formatWakeDelay(\n                        selectedWakeAfterMinutes\n                    ) +\n                    "); יש טקסט בתיבת ההודעה ולכן ממתין רק כדי לא לדרוס אותו.",\n                "#b45309"\n            );\n\n            return true;\n        }\n\n        cycle.wakeState = "sending";\n        cycle.wakeDeferredReason = null;\n\n        record("long-wait-wake-sending", {\n            id: cycle.id,\n            turnKey: cycle.turnKey,\n            elapsedMs\n        });\n\n        sendImmediateInjection(\n            selectedWakeMessage,\n            {\n                label: "wake",\n                source: "long-wait-wake",\n                countAsInjection: false,\n                sentStatusMessage:\n                    "⏰ נשלחה הודעת בדיקה אחרי " +\n                    formatWakeDelay(\n                        selectedWakeAfterMinutes\n                    ) +\n                    "; עוקב אחר התגובה החדשה...",\n                sentStatusColor: "#b45309"\n            }\n        ).then(function () {\n            cycle.wakeState = "sent";\n            cycle.wakeSentAt = Date.now();\n\n            record("long-wait-wake-sent", {\n                id: cycle.id,\n                turnKey: cycle.turnKey,\n                elapsedMs\n            });\n        }).catch(function (err) {\n            cycle.wakeState = "failed";\n\n            record("long-wait-wake-failed", {\n                id: cycle.id,\n                turnKey: cycle.turnKey,\n                elapsedMs,\n                error: err?.message || String(err || "")\n            });\n\n            if (!stopped && currentCycle === cycle) {\n                setState(\n                    "GENERATING",\n                    "⚠️ לא ניתן היה לשלוח את הודעת ההתעוררות בבטחה; ממשיך להמתין לתגובה.",\n                    "#b45309"\n                );\n            }\n        });\n\n        return true;\n    }\n\n`;

source = replaceFunction(
  source,
  "    function updateLongRunningWake(cycle, stopButton) {",
  "    function clearPendingFirstSend(reason) {",
  longWaitFunction,
  "long wait split escalation"
);

source = replaceWithin(
  source,
  "    async function beginRun(",
  "    async function initialize() {",
  `        wakeAfterMinutes,\n        wakeMessage\n    ) {`,
  `        wakeAfterMinutes,\n        wakeMessage,\n        splitAfterMinutes,\n        splitMessage\n    ) {`,
  "beginRun split signature"
);

source = replaceWithin(
  source,
  "    async function beginRun(",
  "    async function initialize() {",
  `        const normalizedWakeMessage =\n            normalizeWakeMessage(\n                wakeMessage\n            );\n`,
  `        const normalizedWakeMessage =\n            normalizeWakeMessage(\n                wakeMessage\n            );\n\n        const normalizedSplitAfterMinutes =\n            normalizeSplitAfterMinutes(\n                splitAfterMinutes\n            );\n\n        const normalizedSplitMessage =\n            normalizeSplitMessage(\n                splitMessage\n            );\n`,
  "beginRun split normalization"
);

source = replaceWithin(
  source,
  "    async function beginRun(",
  "    async function initialize() {",
  `        selectedWakeMessage =\n            normalizedWakeMessage;\n\n        runStarted = true;`,
  `        selectedWakeMessage =\n            normalizedWakeMessage;\n        selectedSplitAfterMinutes =\n            normalizedSplitAfterMinutes;\n        selectedSplitMessage =\n            normalizedSplitMessage;\n        resetLongWorkSplitTracking(\n            "run-start"\n        );\n\n        runStarted = true;`,
  "beginRun split selection"
);

source = replaceWithin(
  source,
  "    async function beginRun(",
  "    async function initialize() {",
  `            wakeMessage:\n                selectedWakeMessage,\n            hasTaskText:`,
  `            wakeMessage:\n                selectedWakeMessage,\n            splitAfterMinutes:\n                selectedSplitAfterMinutes,\n            splitMessage:\n                selectedSplitMessage,\n            hasTaskText:`,
  "run-start split diagnostics"
);

source = replaceWithin(
  source,
  "    window.__sequenceRunner = Object.freeze({",
  "    // Backward-compatible alias",
  `                longWaitWake: {\n                    afterMinutes:\n                        selectedWakeAfterMinutes,\n                    message:\n                        selectedWakeMessage\n                },`,
  `                longWaitWake: {\n                    afterMinutes:\n                        selectedWakeAfterMinutes,\n                    message:\n                        selectedWakeMessage\n                },\n                longWaitSplit: {\n                    afterMinutes:\n                        selectedSplitAfterMinutes,\n                    message:\n                        selectedSplitMessage,\n                    startedAt:\n                        longWorkStartedAt,\n                    state: splitState,\n                    thresholdReachedAt:\n                        splitThresholdReachedAt,\n                    deferredReason:\n                        splitDeferredReason,\n                    sentAt: splitSentAt\n                },`,
  "public split state"
);

source = replaceWithin(
  source,
  "    window.__sequenceRunner = Object.freeze({",
  "    // Backward-compatible alias",
  `            wakeAfterMinutes,\n            wakeMessage\n        ) {\n            return beginRun(\n                "existing",\n                "",\n                workStyle,\n                decisionMode,\n                skipFirstMessage,\n                wakeAfterMinutes,\n                wakeMessage\n            );`,
  `            wakeAfterMinutes,\n            wakeMessage,\n            splitAfterMinutes,\n            splitMessage\n        ) {\n            return beginRun(\n                "existing",\n                "",\n                workStyle,\n                decisionMode,\n                skipFirstMessage,\n                wakeAfterMinutes,\n                wakeMessage,\n                splitAfterMinutes,\n                splitMessage\n            );`,
  "startExistingContext split args"
);

source = replaceWithin(
  source,
  "    window.__sequenceRunner = Object.freeze({",
  "    // Backward-compatible alias",
  `            wakeAfterMinutes,\n            wakeMessage\n        ) {\n            return beginRun(\n                "new",\n                taskText,\n                workStyle,\n                decisionMode,\n                false,\n                wakeAfterMinutes,\n                wakeMessage\n            );`,
  `            wakeAfterMinutes,\n            wakeMessage,\n            splitAfterMinutes,\n            splitMessage\n        ) {\n            return beginRun(\n                "new",\n                taskText,\n                workStyle,\n                decisionMode,\n                false,\n                wakeAfterMinutes,\n                wakeMessage,\n                splitAfterMinutes,\n                splitMessage\n            );`,
  "startWithTask split args"
);

write(path, source);
console.log("Patched configurable long-work splitting nudge.");
