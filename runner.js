// Sequence Runner v3
// State-machine based automatic continuation runner for the current ChatGPT web UI.
// Click the status badge to stop manually.

(function () {
    "use strict";

    const CONFIG = Object.freeze({
        FIRST_PROMPT:
            "בכל פעם שאכתוב 'תמשיך לשלב הבא', תתקדם שלב אחד. כשתסיים את כל השלבים לחלוטין, תכתוב בסוף התשובה את המילה 'סיימתי' אך לפני כן אל תשתמש במילה הזו כלל. עכשיו, תמשיך לשלב הבא.",
        REGULAR_PROMPT: "תמשיך לשלב הבא",
        DONE_KEYWORD: "סיימתי",
        STABLE_MS: 900,
        FAST_RESPONSE_FALLBACK_MS: 2500,
        TURN_TIMEOUT_MS: 120000,
        WATCHDOG_MS: 400,
        CONTINUE_DELAY_MS: 350
    });

    const SELECTORS = Object.freeze({
        turn: "[data-turn-key]",
        userMessage: '[data-user-message-bubble="true"]',
        assistantMessage: '[data-markdown-text-style="assistant-message"]',
        composer: '[contenteditable="true"][data-composer-markdown]',
        sendButton: 'button[aria-label="Send"],button[aria-label="שלח"]',
        stopButton: 'button[aria-label="Stop"],button[aria-label="עצור"]',
        regenerateButton: 'button[aria-label="Regenerate response"]'
    });

    try {
        window.__chatgptAutoContinueV3?.stop?.("replaced");
    } catch (_) {}

    if (window.autoContinueTimer) {
        try {
            clearInterval(window.autoContinueTimer);
        } catch (_) {}
    }

    let statusDiv = document.getElementById("chatgpt-auto-status");

    if (!statusDiv) {
        statusDiv = document.createElement("div");
        statusDiv.id = "chatgpt-auto-status";
        statusDiv.style.cssText = [
            "position:fixed",
            "top:20px",
            "right:20px",
            "max-width:360px",
            "padding:10px 14px",
            "background:#333",
            "color:#fff",
            "border-radius:8px",
            "z-index:2147483647",
            "font-family:system-ui,sans-serif",
            "font-size:14px",
            "line-height:1.35",
            "box-shadow:0 4px 12px rgba(0,0,0,.3)",
            "cursor:pointer",
            "user-select:none"
        ].join(";");

        document.body.appendChild(statusDiv);
    }

    const log = [];
    const processedTurnKeys = new Set();

    let state = "INIT";
    let stopped = false;
    let observer = null;
    let watchdog = null;
    let evaluateScheduled = false;
    let sendLocked = false;
    let cycleSeq = 0;
    let continuationCount = 0;
    let currentCycle = null;

    function nowIso() {
        return new Date().toISOString();
    }

    function record(event, extra) {
        const entry = Object.assign(
            {
                time: nowIso(),
                state,
                event
            },
            extra || {}
        );

        log.push(entry);

        if (log.length > 1000) {
            log.shift();
        }

        console.log("[SequenceRunner]", event, extra || {});
    }

    function updateStatus(message, color) {
        if (!statusDiv || !statusDiv.isConnected) {
            return;
        }

        statusDiv.textContent = message;
        statusDiv.style.backgroundColor = color || "#333";
    }

    function setState(next, message, color) {
        if (state !== next) {
            record("state", {
                from: state,
                to: next
            });
        }

        state = next;

        if (message) {
            updateStatus(message, color);
        }
    }

    function normalizeText(value) {
        return String(value == null ? "" : value)
            .replace(/\u00a0/g, " ")
            .replace(/\r\n/g, "\n")
            .trim();
    }

    function isDone(text) {
        const lines = normalizeText(text)
            .split(/\n+/)
            .map(function (line) {
                return line.trim();
            })
            .filter(Boolean);

        if (!lines.length) {
            return false;
        }

        const lastLine = lines
            .at(-1)
            .replace(/^[-•▪◦]\s*/, "")
            .replace(/^[`*_~]+|[`*_~]+$/g, "")
            .trim();

        return new RegExp(
            "^" + CONFIG.DONE_KEYWORD + "[.!?]?$",
            "u"
        ).test(lastLine);
    }

    function getTurns() {
        return [...document.querySelectorAll(SELECTORS.turn)].filter(function (el) {
            return el.getAttribute("data-turn-key");
        });
    }

    function getTurnKey(turn) {
        return turn?.getAttribute("data-turn-key") || null;
    }

    function getTurnByKey(key) {
        if (!key) {
            return null;
        }

        return (
            getTurns().find(function (turn) {
                return getTurnKey(turn) === key;
            }) || null
        );
    }

    function getComposer() {
        return (
            document.querySelector(SELECTORS.composer) ||
            document.querySelector("#prompt-textarea") ||
            document.querySelector('div[contenteditable="true"][role="textbox"]')
        );
    }

    function getSendButton() {
        return (
            document.querySelector(SELECTORS.sendButton) ||
            document.querySelector('button[data-testid="send-button"]')
        );
    }

    function getStopButton() {
        return (
            document.querySelector(SELECTORS.stopButton) ||
            document.querySelector('button[data-testid="stop-button"]')
        );
    }

    function getAssistantMessage(turn) {
        if (!turn) {
            return null;
        }

        const found = [
            ...turn.querySelectorAll(SELECTORS.assistantMessage)
        ];

        return found.at(-1) || null;
    }

    function hasFinalUi(turn) {
        return !!turn?.querySelector(SELECTORS.regenerateButton);
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    async function waitUntil(predicate, timeoutMs, stepMs) {
        const started = Date.now();
        const step = stepMs || 50;

        while (!stopped && Date.now() - started < timeoutMs) {
            try {
                const value = predicate();

                if (value) {
                    return value;
                }
            } catch (_) {}

            await sleep(step);
        }

        return null;
    }

    function clearComposer(composer) {
        composer.focus();

        try {
            document.execCommand("selectAll", false, null);
        } catch (_) {}

        try {
            document.execCommand("delete", false, null);
        } catch (_) {}
    }

    async function setComposerText(text) {
        const composer = getComposer();

        if (!composer) {
            throw new Error("Composer not found.");
        }

        const existing = normalizeText(
            composer.innerText ||
                composer.textContent ||
                composer.value ||
                ""
        );

        if (existing) {
            throw new Error(
                "Composer is not empty; refusing to overwrite existing text."
            );
        }

        composer.focus();

        let pasteWorked = false;

        try {
            const dt = new DataTransfer();
            dt.setData("text/plain", text);

            composer.dispatchEvent(
                new ClipboardEvent("paste", {
                    clipboardData: dt,
                    bubbles: true,
                    cancelable: true
                })
            );

            await sleep(120);

            pasteWorked =
                normalizeText(
                    composer.innerText ||
                        composer.textContent ||
                        composer.value ||
                        ""
                ) === normalizeText(text);
        } catch (_) {}

        if (pasteWorked) {
            return composer;
        }

        clearComposer(composer);
        await sleep(50);
        composer.focus();

        let inserted = false;

        try {
            inserted = document.execCommand("insertText", false, text);
        } catch (_) {}

        await sleep(120);

        const actual = normalizeText(
            composer.innerText ||
                composer.textContent ||
                composer.value ||
                ""
        );

        if (!inserted || actual !== normalizeText(text)) {
            throw new Error(
                "Could not reliably insert prompt into the composer."
            );
        }

        return composer;
    }

    function cleanup() {
        try {
            observer?.disconnect();
        } catch (_) {}

        observer = null;

        if (watchdog) {
            clearInterval(watchdog);
        }

        watchdog = null;
        evaluateScheduled = false;
    }

    function stop(reason, success) {
        const stopReason = reason || "manual";
        const completedSuccessfully = !!success;

        if (stopped) {
            return;
        }

        stopped = true;
        cleanup();
        sendLocked = false;
        currentCycle = null;
        state = completedSuccessfully ? "DONE" : "STOPPED";

        record("stopped", {
            reason: stopReason,
            success: completedSuccessfully
        });

        if (completedSuccessfully) {
            updateStatus("✅ Process complete!", "#28a745");

            setTimeout(function () {
                statusDiv?.remove();
            }, 6000);
        } else if (stopReason === "manual") {
            updateStatus("🛑 Stopped manually.", "#dc3545");

            setTimeout(function () {
                statusDiv?.remove();
            }, 3500);
        } else if (stopReason === "replaced") {
            statusDiv?.remove();
        }
    }

    function fail(message, error) {
        if (stopped) {
            return;
        }

        record("error", {
            message,
            error: error?.message || String(error || "")
        });

        stopped = true;
        cleanup();
        sendLocked = false;
        currentCycle = null;
        state = "ERROR";

        updateStatus("🔴 " + message, "#dc3545");
        console.error("[SequenceRunner]", message, error || "");
    }

    function findNewTurn(beforeKeys, expectedPrompt) {
        const expected = normalizeText(expectedPrompt);

        const candidates = getTurns().filter(function (turn) {
            return !beforeKeys.has(getTurnKey(turn));
        });

        const matching = candidates.filter(function (turn) {
            const user = turn.querySelector(SELECTORS.userMessage);

            const userText = normalizeText(
                user?.innerText ||
                    user?.textContent ||
                    ""
            );

            return userText === expected;
        });

        return matching.at(-1) || null;
    }

    async function sendPrompt(prompt, label) {
        if (stopped || sendLocked) {
            return;
        }

        if (getStopButton()) {
            throw new Error(
                "ChatGPT is already generating a response."
            );
        }

        sendLocked = true;

        setState(
            "SENDING",
            label === "first"
                ? "➡️ Sending first prompt..."
                : "➡️ Sending continuation #" + (continuationCount + 1) + "...",
            "#0056b3"
        );

        const beforeKeys = new Set(
            getTurns().map(getTurnKey)
        );

        await setComposerText(prompt);

        const sendButton = await waitUntil(
            function () {
                const button = getSendButton();

                return button && !button.disabled
                    ? button
                    : null;
            },
            3000,
            50
        );

        if (!sendButton) {
            sendLocked = false;

            throw new Error(
                "Send button did not become available."
            );
        }

        const id = ++cycleSeq;

        currentCycle = {
            id,
            label,
            prompt,
            beforeKeys,
            sentAt: Date.now(),
            turnKey: null,
            sawStop: false,
            lastText: null,
            lastTextChangedAt: 0,
            processed: false
        };

        record("send", {
            id,
            label,
            beforeTurnCount: beforeKeys.size
        });

        sendButton.click();

        setState(
            "WAITING_FOR_TURN",
            "⏳ Waiting for ChatGPT...",
            "#d39e00"
        );

        scheduleEvaluate();
    }

    function completeCycle(cycle, text) {
        if (
            stopped ||
            currentCycle !== cycle ||
            cycle.processed
        ) {
            return;
        }

        cycle.processed = true;
        processedTurnKeys.add(cycle.turnKey);
        sendLocked = false;

        record("response-complete", {
            id: cycle.id,
            turnKey: cycle.turnKey,
            textLength: text.length,
            done: isDone(text)
        });

        if (isDone(text)) {
            stop("done-keyword", true);
            return;
        }

        continuationCount++;

        setState(
            "READY_TO_CONTINUE",
            "🔎 Response #" +
                continuationCount +
                " complete; continuing...",
            "#17a2b8"
        );

        const completedCycle = cycle;

        setTimeout(function () {
            if (
                stopped ||
                currentCycle !== completedCycle
            ) {
                return;
            }

            currentCycle = null;

            sendPrompt(
                CONFIG.REGULAR_PROMPT,
                "continue"
            ).catch(function (err) {
                fail(err.message, err);
            });
        }, CONFIG.CONTINUE_DELAY_MS);
    }

    function evaluate() {
        evaluateScheduled = false;

        if (stopped || !currentCycle) {
            return;
        }

        const cycle = currentCycle;

        if (cycle.processed) {
            return;
        }

        if (
            Date.now() - cycle.sentAt >
            CONFIG.TURN_TIMEOUT_MS
        ) {
            fail(
                "Timed out waiting for ChatGPT response."
            );
            return;
        }

        const stopButton = getStopButton();

        if (stopButton) {
            cycle.sawStop = true;
        }

        if (!cycle.turnKey) {
            const newTurn = findNewTurn(
                cycle.beforeKeys,
                cycle.prompt
            );

            if (newTurn) {
                cycle.turnKey = getTurnKey(newTurn);

                record("new-turn", {
                    id: cycle.id,
                    turnKey: cycle.turnKey
                });

                setState(
                    stopButton
                        ? "GENERATING"
                        : "WAITING_FOR_RESPONSE",
                    stopButton
                        ? "✍️ ChatGPT is generating..."
                        : "⏳ Waiting for assistant response...",
                    "#d39e00"
                );
            } else {
                if (stopButton) {
                    setState(
                        "GENERATING",
                        "✍️ ChatGPT is generating...",
                        "#d39e00"
                    );
                }

                return;
            }
        }

        const turn = getTurnByKey(cycle.turnKey);

        if (!turn) {
            return;
        }

        const assistant = getAssistantMessage(turn);

        if (!assistant) {
            setState(
                stopButton
                    ? "GENERATING"
                    : "WAITING_FOR_RESPONSE",
                stopButton
                    ? "✍️ ChatGPT is generating..."
                    : "⏳ Waiting for assistant response...",
                "#d39e00"
            );

            return;
        }

        const text = normalizeText(
            assistant.innerText ||
                assistant.textContent ||
                ""
        );

        if (text !== cycle.lastText) {
            cycle.lastText = text;
            cycle.lastTextChangedAt = Date.now();

            record("assistant-text-changed", {
                id: cycle.id,
                length: text.length
            });
        }

        if (stopButton) {
            setState(
                "GENERATING",
                "✍️ ChatGPT is generating...",
                "#d39e00"
            );

            return;
        }

        if (!text) {
            setState(
                "WAITING_FOR_RESPONSE",
                "⏳ Waiting for assistant response...",
                "#d39e00"
            );

            return;
        }

        const stableFor =
            Date.now() - cycle.lastTextChangedAt;

        if (stableFor < CONFIG.STABLE_MS) {
            setState(
                "WAITING_FOR_STABLE_RESPONSE",
                "⏳ Finalizing response...",
                "#d39e00"
            );

            return;
        }

        const finalUiSeen = hasFinalUi(turn);

        if (
            !cycle.sawStop &&
            !finalUiSeen &&
            stableFor <
                CONFIG.FAST_RESPONSE_FALLBACK_MS
        ) {
            setState(
                "WAITING_FOR_STABLE_RESPONSE",
                "⏳ Confirming response completion...",
                "#d39e00"
            );

            return;
        }

        setState(
            "EVALUATING",
            "🔎 Checking response...",
            "#17a2b8"
        );

        completeCycle(cycle, text);
    }

    function scheduleEvaluate() {
        if (stopped || evaluateScheduled) {
            return;
        }

        evaluateScheduled = true;

        setTimeout(evaluate, 0);
    }

    async function start() {
        updateStatus(
            "🚀 Sequence Runner starting...",
            "#17a2b8"
        );

        record("start");

        if (!getComposer()) {
            fail("ChatGPT composer was not found.");
            return;
        }

        observer = new MutationObserver(
            scheduleEvaluate
        );

        observer.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: [
                "aria-label",
                "disabled",
                "data-turn-key",
                "data-markdown-text-style"
            ]
        });

        watchdog = setInterval(
            scheduleEvaluate,
            CONFIG.WATCHDOG_MS
        );

        if (getStopButton()) {
            setState(
                "WAITING_FOR_IDLE",
                "⏳ Waiting for current ChatGPT response to finish...",
                "#d39e00"
            );

            const idle = await waitUntil(
                function () {
                    return !getStopButton();
                },
                CONFIG.TURN_TIMEOUT_MS,
                100
            );

            if (!idle && getStopButton()) {
                fail(
                    "Timed out waiting for ChatGPT to become idle."
                );
                return;
            }
        }

        try {
            await sendPrompt(
                CONFIG.FIRST_PROMPT,
                "first"
            );
        } catch (err) {
            fail(err.message, err);
        }
    }

    statusDiv.title =
        "Click to stop Sequence Runner";

    statusDiv.onclick = function () {
        stop("manual", false);
    };

    window.__sequenceRunner = Object.freeze({
        stop,
        getState: function () {
            return {
                state,
                stopped,
                sendLocked,
                continuationCount,
                currentCycle: currentCycle
                    ? Object.assign(
                          {},
                          currentCycle,
                          { beforeKeys: undefined }
                      )
                    : null
            };
        },
        getLog: function () {
            return [...log];
        },
        isDone
    });

    // Backward-compatible alias for the earlier test/debug name.
    window.__chatgptAutoContinueV3 =
        window.__sequenceRunner;

    start();
})();
