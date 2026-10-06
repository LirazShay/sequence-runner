// Sequence Runner
// State-machine based automatic continuation runner for the current ChatGPT web UI.
// Use the floating control panel to configure, monitor and stop the run.

(function () {
    "use strict";

    const VERSION = "3.34";

    const CONFIG = Object.freeze({
        REGULAR_PROMPT: "תמשיך לשלב הבא",
        DONE_KEYWORD: "סיימתי",
        HANDOFF_OUTER_START: "[[SEQUENCE_RUNNER_NEW_CHAT]]",
        HANDOFF_OUTER_END: "[[/SEQUENCE_RUNNER_NEW_CHAT]]",
        HANDOFF_PROMPT_START: "[[NEXT_CHAT_PROMPT]]",
        HANDOFF_PROMPT_END: "[[/NEXT_CHAT_PROMPT]]",
        NAVIGATION_TIMEOUT_MS: 15000,
        HANDOFF_MIN_READY_MS: 1000,
        STABLE_MS: 900,
        FAST_RESPONSE_FALLBACK_MS: 2500,
        DELIVERY_RETRY_START_TIMEOUT_MS: 5000,
        DELIVERY_RETRY_MAX_ATTEMPTS: 1,
        DELIVERY_TIMEOUT_MESSAGE: "Message delivery timed out. Please try again.",
        LONG_WAIT_NOTICE_AFTER_MS: 5 * 60 * 1000,
        LONG_WAIT_NOTICE_EVERY_MS: 60 * 1000,
        LONG_WAIT_WAKE_MIN_MINUTES: 1,
        LONG_WAIT_WAKE_MAX_MINUTES: 20,
        LONG_WAIT_WAKE_DEFAULT_MINUTES: 5,
        LONG_WAIT_WAKE_DEFAULT_MESSAGE: "לוקח לך הרבה זמן, הכל בסדר? אם העבודה גדולה מדי, אתה יכול לחלק אותה ולהמשיך בהודעה נוספת.",
        LONG_WAIT_WAKE_SHORT_MESSAGE: "מה קורה?",
        UI_REFRESH_MS: 1000,
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

    const DIAGNOSTIC_SCHEMA_VERSION = 1;
    const DIAGNOSTIC_SELECTORS = Object.freeze([
        '[data-turn-key]',
        '[data-user-message-bubble="true"]',
        '[data-markdown-text-style="assistant-message"]',
        '[data-content-search-unit-key$=":assistant"]',
        '[data-chatgpt-search-unit-key$=":assistant"]',
        '[data-chatgpt-selection-message-id]',
        'h4[data-conversation-role="assistant"]',
        'aside[role="alert"]',
        '[contenteditable="true"][data-composer-markdown]',
        '#prompt-textarea',
        'button[aria-label="Send"]',
        'button[aria-label="Stop"]',
        'button[aria-label="Regenerate response"]',
        'button[data-testid="send-button"]',
        'button[data-testid="stop-button"]'
    ]);

    try {
        window.__chatgptAutoContinueV3?.stop?.("replaced");
    } catch (_) {}

    if (window.autoContinueTimer) {
        try {
            clearInterval(window.autoContinueTimer);
        } catch (_) {}
    }

    const PANEL_STORAGE_KEYS = Object.freeze({
        position: "sequence-runner-panel-position",
        size: "sequence-runner-panel-size",
        minimized: "sequence-runner-panel-minimized"
    });

    const PANEL_DEFAULT_SIZE = Object.freeze({
        width: 300,
        height: 420
    });

    const PANEL_MIN_SIZE = Object.freeze({
        width: 250,
        height: 220
    });

    document.getElementById("chatgpt-auto-status")?.remove();
    document.getElementById("sequence-runner-panel")?.remove();

    const panel = document.createElement("section");
    panel.id = "sequence-runner-panel";
    panel.dir = "rtl";
    panel.style.cssText = [
        "position:fixed",
        "top:20px",
        "right:20px",
        "width:" + PANEL_DEFAULT_SIZE.width + "px",
        "height:" + PANEL_DEFAULT_SIZE.height + "px",
        "min-width:" + PANEL_MIN_SIZE.width + "px",
        "min-height:" + PANEL_MIN_SIZE.height + "px",
        "max-width:calc(100vw - 16px)",
        "max-height:calc(100vh - 16px)",
        "display:flex",
        "flex-direction:column",
        "background:#111827",
        "color:#f9fafb",
        "border:1px solid rgba(255,255,255,.14)",
        "border-radius:12px",
        "z-index:2147483647",
        "font-family:system-ui,sans-serif",
        "font-size:13px",
        "line-height:1.35",
        "box-shadow:0 10px 30px rgba(0,0,0,.32)",
        "overflow:hidden"
    ].join(";");

    panel.innerHTML = [
        '<div data-role="header" style="display:flex;align-items:center;gap:8px;padding:8px 9px;background:#0b1220;cursor:move;user-select:none;flex:0 0 auto">',
        '<strong style="flex:1;font-size:13px">Sequence Runner v' + VERSION + '</strong>',
        '<button type="button" data-action="minimize" title="מזער" style="border:0;background:#243044;color:#fff;border-radius:6px;width:28px;height:26px;cursor:pointer;font-size:16px;line-height:1">−</button>',
        '</div>',
        '<div data-role="body" style="min-height:0;flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable">',
        '<div data-role="status" style="position:sticky;top:0;z-index:2;padding:8px 9px;background:#17a2b8;color:#fff;font-weight:600">🚀 Starting...</div>',
        '<div style="padding:10px">',
        '<div data-role="start-config" style="margin-bottom:10px">',
        '<div style="font-weight:700;margin-bottom:7px">התחלה</div>',
        '<select data-input="task-mode" style="width:100%;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px;margin-bottom:6px">',
        '<option value="existing">המשימה כבר ניתנה בצ׳אט</option>',
        '<option value="existing-ready">המשימה והודעת הפתיחה כבר נשלחו בצ׳אט</option>',
        '<option value="new">משימה חדשה — שלב אותה בהודעה הראשונה</option>',
        '</select>',
        '<select data-input="work-style" style="width:100%;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px;margin-bottom:6px">',
        '<option value="steady">Steady — התקדמות טבעית</option>',
        '<option value="deep">Deep — עבודה עמוקה ומקטעים משמעותיים</option>',
        '</select>',
        '<select data-input="decision-mode" style="width:100%;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px;margin-bottom:6px">',
        '<option value="autonomous">Autonomous — קבל החלטות והמשך</option>',
        '<option value="collaborative">Collaborative — עצור בהחלטות מהותיות</option>',
        '</select>',
        '<textarea data-input="task-text" rows="4" placeholder="כתוב כאן את המשימה..." style="display:none;width:100%;box-sizing:border-box;resize:vertical;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:7px;margin-bottom:6px"></textarea>',
        '<button type="button" data-action="start-run" style="width:100%;border:0;background:#15803d;color:#fff;border-radius:6px;padding:7px;cursor:pointer;font-weight:700">התחל ריצה</button>',
        '<div style="margin-top:6px;font-size:11px;color:#94a3b8">Steady ו־Deep עובדים במקטעים לפי מטרות ותוצאות; Deep דוחף למקטעים גדולים יותר. Autonomous מקבל החלטות סבירות וממשיך, Collaborative עוצר בהחלטות מהותיות. במצב “משימה חדשה” הטקסט משתלב בתוך הודעת הפתיחה.</div>',
        '</div>',
        '<div data-role="metrics" style="display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin-bottom:10px"></div>',
        '<button type="button" data-action="restart-run" style="display:none;width:100%;border:0;background:#0f766e;color:#fff;border-radius:6px;padding:8px;cursor:pointer;font-weight:700;margin-bottom:10px">התחל ריצה חדשה</button>',
        '<div data-role="intermediate" style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-bottom:10px">',
        '<div style="font-weight:700;margin-bottom:7px">הודעת ביניים</div>',
        '<textarea data-input="injection-text" rows="3" placeholder="טקסט חופשי לשליחה בתוך התהליך..." style="width:100%;box-sizing:border-box;resize:vertical;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:7px;margin-bottom:6px"></textarea>',
        '<button type="button" data-action="queue-injection-now" style="width:100%;border:0;background:#7c3aed;color:#fff;border-radius:6px;padding:7px;cursor:pointer;margin-bottom:6px">שלח בהזדמנות הבטוחה הקרובה</button>',
        '<button type="button" data-action="send-injection-immediately" style="width:100%;border:1px solid #f59e0b;background:#78350f;color:#fff;border-radius:6px;padding:7px;cursor:pointer;margin-bottom:6px;font-weight:700">שלח עכשיו — גם בזמן תשובה פעילה</button>',
        '<div style="display:grid;grid-template-columns:1fr auto;gap:6px;margin-bottom:6px">',
        '<input data-input="injection-after" type="number" min="1" step="1" placeholder="בעוד N תגובות" style="min-width:0;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px">',
        '<button type="button" data-action="queue-injection-after" style="border:0;background:#7c3aed;color:#fff;border-radius:6px;padding:6px 9px;cursor:pointer">תזמן</button>',
        '</div>',
        '<div data-role="injection-status" style="font-size:12px;color:#cbd5e1;margin-bottom:6px">אין הודעות ביניים מתוזמנות.</div>',
        '<button type="button" data-action="toggle-injection-manager" style="width:100%;border:1px solid #6d28d9;background:#2e1065;color:#fff;border-radius:6px;padding:6px;cursor:pointer;margin-bottom:6px">ניהול הודעות ביניים (0)</button>',
        '<div data-role="injection-manager" style="display:none;border:1px solid rgba(139,92,246,.35);background:#0f172a;border-radius:7px;padding:7px;margin-bottom:6px">',
        '<div data-role="injection-list" style="display:flex;flex-direction:column;gap:7px;margin-bottom:7px"></div>',
        '<button type="button" data-action="clear-injections" style="width:100%;border:1px solid #475569;background:#1f2937;color:#fff;border-radius:6px;padding:6px;cursor:pointer">נקה תור הודעות ביניים</button>',
        '<div style="margin-top:6px;font-size:10px;color:#94a3b8">החצים משנים סדר רק בין הודעות שמיועדות לאותו גבול. שינוי “בעוד N” מעדכן את מועד השליחה יחסית למצב הנוכחי.</div>',
        '</div>',
        '<div style="margin-top:6px;font-size:11px;color:#94a3b8">“בהזדמנות הבטוחה הקרובה” מחכה לסיום התשובה. “שלח עכשיו” שולח דרך ה־composer גם בזמן תשובה פעילה, בלי ללחוץ Stop. תזמון “בעוד N” נספר לפי תגובות Assistant שמושלמות מרגע התזמון.</div>',
        '</div>',
        '<div data-role="run-limit" style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px">',
        '<div style="font-weight:700;margin-bottom:7px">גבול ריצה</div>',
        '<div style="display:grid;grid-template-columns:1fr auto;gap:6px;margin-bottom:6px">',
        '<input data-input="absolute-limit" type="number" min="1" step="1" placeholder="עצור בשלב #" style="min-width:0;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px">',
        '<button type="button" data-action="set-absolute-limit" style="border:0;background:#2563eb;color:#fff;border-radius:6px;padding:6px 9px;cursor:pointer">קבע</button>',
        '</div>',
        '<div style="display:grid;grid-template-columns:1fr auto;gap:6px;margin-bottom:6px">',
        '<input data-input="relative-limit" type="number" min="1" step="1" placeholder="עצור בעוד N" style="min-width:0;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px">',
        '<button type="button" data-action="set-relative-limit" style="border:0;background:#2563eb;color:#fff;border-radius:6px;padding:6px 9px;cursor:pointer">קבע</button>',
        '</div>',
        '<div data-role="limit-status" style="font-size:12px;color:#cbd5e1;margin-bottom:8px">ללא גבול — נעצר רק בסיום המוגדר.</div>',
        '<button type="button" data-action="resume-run" style="display:none;width:100%;border:1px solid #0891b2;background:#164e63;color:#fff;border-radius:6px;padding:6px;cursor:pointer;margin-bottom:6px;font-weight:700">המשך אוטומציה</button>',
        '<div style="display:flex;gap:6px">',
        '<button type="button" data-action="clear-limit" style="flex:1;border:1px solid #475569;background:#1f2937;color:#fff;border-radius:6px;padding:6px;cursor:pointer">בטל גבול</button>',
        '<button type="button" data-action="stop" style="flex:1;border:0;background:#b91c1c;color:#fff;border-radius:6px;padding:6px;cursor:pointer">עצור</button>',
        '</div>',
        '<div style="margin-top:7px;font-size:11px;color:#94a3b8">הגבול נבדק רק אחרי שתשובת ChatGPT הנוכחית הושלמה; הוא לא חותך תשובה באמצע.</div>',
        '</div>',
        '<div data-role="long-wait-wake" style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-top:10px">',
        '<div style="font-weight:700;margin-bottom:7px">בדיקת תשובה ארוכה</div>',
        '<div style="font-size:11px;color:#cbd5e1;margin-bottom:4px">שלח הודעת בדיקה אחרי:</div>',
        '<select data-input="wake-after-minutes" style="width:100%;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px;margin-bottom:6px">' +
            Array.from(
                {
                    length:
                        CONFIG.LONG_WAIT_WAKE_MAX_MINUTES -
                        CONFIG.LONG_WAIT_WAKE_MIN_MINUTES +
                        1
                },
                function (_, index) {
                    const minutes =
                        CONFIG.LONG_WAIT_WAKE_MIN_MINUTES +
                        index;

                    return (
                        '<option value="' +
                        minutes +
                        '"' +
                        (minutes ===
                        CONFIG.LONG_WAIT_WAKE_DEFAULT_MINUTES
                            ? ' selected'
                            : '') +
                        '>' +
                        minutes +
                        (minutes === 1
                            ? ' דקה'
                            : ' דקות') +
                        '</option>'
                    );
                }
            ).join('') +
            '</select>',
        '<div style="font-size:11px;color:#cbd5e1;margin-bottom:4px">הודעת בדיקה:</div>',
        '<select data-input="wake-message-preset" style="width:100%;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px;margin-bottom:6px">',
        '<option value="supportive">' + escapeHtml(CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE) + '</option>',
        '<option value="short">' + escapeHtml(CONFIG.LONG_WAIT_WAKE_SHORT_MESSAGE) + '</option>',
        '<option value="custom">מותאם אישית</option>',
        '</select>',
        '<textarea data-input="wake-message" rows="3" style="width:100%;box-sizing:border-box;resize:vertical;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:7px;margin-bottom:6px">' + escapeHtml(CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE) + '</textarea>',
        '<div style="font-size:10px;color:#94a3b8">ההודעה נשלחת לכל היותר פעם אחת לכל תשובה פעילה, בלי ללחוץ Stop ובלי לדרוס טקסט שכבר הוקלד.</div>',
        '</div>',
        '<div data-role="diagnostic" style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-top:10px">',
        '<div style="font-weight:700;margin-bottom:7px">אבחון תקלה</div>',
        '<button type="button" data-action="download-diagnostic" style="width:100%;border:1px solid #0ea5e9;background:#0c4a6e;color:#fff;border-radius:6px;padding:7px;cursor:pointer;font-weight:700">דווח תקלה / הורד צילום מצב</button>',
        '<div data-role="diagnostic-warning" style="margin-top:6px;font-size:10px;color:#fbbf24">הדוח עשוי לכלול את תוכן הצ׳אט וה־DOM הגלוי בדף. הוא לא אוסף בכוונה cookies, tokens או browser storage.</div>',
        '</div>',
        '</div>',
        '</div>',
        '<div data-role="resize-handle" title="גרור לשינוי גודל" style="position:absolute;left:0;bottom:0;width:22px;height:22px;cursor:nesw-resize;z-index:5;display:flex;align-items:flex-end;justify-content:flex-start;padding:2px;box-sizing:border-box;color:#94a3b8;font-size:15px;line-height:1;user-select:none;touch-action:none">↙</div>'
    ].join("");

    document.body.appendChild(panel);

    const diagnosticButton = panel.querySelector('[data-action="download-diagnostic"]');
    diagnosticButton?.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        try {
            downloadDiagnosticSnapshot();
        } catch (err) {
            console.error("Sequence Runner diagnostic download failed", err);
        }
    });

    const statusDiv = panel.querySelector('[data-role="status"]');
    const panelBody = panel.querySelector('[data-role="body"]');
    const metricsDiv = panel.querySelector('[data-role="metrics"]');
    const limitStatusDiv = panel.querySelector('[data-role="limit-status"]');
    const injectionStatusDiv = panel.querySelector('[data-role="injection-status"]');
    const injectionManagerDiv = panel.querySelector('[data-role="injection-manager"]');
    const injectionListDiv = panel.querySelector('[data-role="injection-list"]');
    const injectionManagerButton = panel.querySelector('[data-action="toggle-injection-manager"]');
    const resumeButton = panel.querySelector('[data-action="resume-run"]');
    const restartButton = panel.querySelector('[data-action="restart-run"]');
    const resizeHandle = panel.querySelector('[data-role="resize-handle"]');

    const log = [];
    const processedTurnKeys = new Set();

    let state = "INIT";
    let stopped = false;
    let observer = null;
    let watchdog = null;
    let uiTimer = null;
    let evaluateScheduled = false;
    let sendLocked = false;
    let cycleSeq = 0;
    let continuationCount = 0;
    let completedResponseCount = 0;
    let stopAfterCompletedResponses = null;
    let stopLimitMode = null;
    let currentCycle = null;
    let runStarted = false;
    let selectedTaskMode = "existing";
    let selectedTaskText = "";
    let selectedSkipFirstMessage = false;
    let selectedWorkStyle = "steady";
    let selectedDecisionMode = "autonomous";
    let selectedWakeAfterMinutes =
        CONFIG.LONG_WAIT_WAKE_DEFAULT_MINUTES;
    let selectedWakeMessage =
        CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;
    let runnerStartedAt = null;
    let injectionSeq = 0;
    let injectionSentCount = 0;
    let immediateSendLocked = false;
    let pendingAutoSend = null;
    let pendingAutoSendLocked = false;
    let handoffInProgress = false;
    let handoffCount = 0;
    const injectionQueue = [];
    let lastStatusMessage = null;
    let lastStatusColor = null;

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

        const resolvedColor = color || "#333";

        if (
            lastStatusMessage === message &&
            lastStatusColor === resolvedColor
        ) {
            return;
        }

        lastStatusMessage = message;
        lastStatusColor = resolvedColor;
        statusDiv.textContent = message;
        statusDiv.style.backgroundColor = resolvedColor;
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

    function normalizeWorkStyle(value) {
        return value === "deep"
            ? "deep"
            : "steady";
    }

    function normalizeDecisionMode(value) {
        return value === "collaborative"
            ? "collaborative"
            : "autonomous";
    }

    function normalizeWakeAfterMinutes(value) {
        if (value == null || value === "") {
            return CONFIG.LONG_WAIT_WAKE_DEFAULT_MINUTES;
        }

        const parsed = Number(value);

        if (
            !Number.isInteger(parsed) ||
            parsed < CONFIG.LONG_WAIT_WAKE_MIN_MINUTES ||
            parsed > CONFIG.LONG_WAIT_WAKE_MAX_MINUTES
        ) {
            throw new Error(
                "Long-wait wake delay must be an integer from " +
                    CONFIG.LONG_WAIT_WAKE_MIN_MINUTES +
                    " to " +
                    CONFIG.LONG_WAIT_WAKE_MAX_MINUTES +
                    " minutes."
            );
        }

        return parsed;
    }

    function normalizeWakeMessage(value) {
        if (value == null) {
            return CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;
        }

        const message = normalizeText(value);

        if (!message) {
            throw new Error(
                "Long-wait wake message cannot be empty."
            );
        }

        return message;
    }

    function getWakeMessagePreset(value) {
        const message = normalizeText(value);

        if (
            message ===
            normalizeText(
                CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE
            )
        ) {
            return "supportive";
        }

        if (
            message ===
            normalizeText(
                CONFIG.LONG_WAIT_WAKE_SHORT_MESSAGE
            )
        ) {
            return "short";
        }

        return "custom";
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

    function getWorkInstruction(workStyle) {
        return normalizeWorkStyle(workStyle) === "deep"
            ? "בכל פעם שאכתוב 'תמשיך לשלב הבא', התקדם שלב משמעותי אחד: בצע ברצף מקטע עבודה משמעותי, כולל תתי־שלבים, בדיקות ותיקונים נחוצים, עד יעד ברור ומאומת. חלק את העבודה למקטעים לפי מטרות ותוצאות, אל תעצור אחרי פעולה טכנית קטנה, והעדף מספר קטן של מקטעים משמעותיים על פני הרבה צעדים קטנים."
            : "בכל פעם שאכתוב 'תמשיך לשלב הבא', המשך להתקדם בעבודה באופן טבעי עד נקודת עצירה הגיונית. חלק את העבודה למקטעים לפי מטרות ותוצאות, השלם ואמת יעד ברור בכל מקטע; אל תכפה מקטע גדול כשאין צורך ואל תעצור אחרי פעולה טכנית קטנה, והעדף מספר קטן של מקטעים משמעותיים על פני הרבה צעדים קטנים.";
    }

    function getCheckpointInstruction() {
        return "סיים מקטע בנקודת checkpoint טבעית: לאחר תוצאה משמעותית שניתן לאמת, כשהשלב הבא הוא סוג עבודה שונה מהותית, או לפני פעולה בעלת סיכון משמעותי. החלטה משמעותית מחייבת עצירה למשתמש רק במצב Collaborative.";
    }

    function getDecisionInstruction(decisionMode) {
        return normalizeDecisionMode(decisionMode) === "collaborative"
            ? "במצב Collaborative, כשנדרשת החלטה משמעותית עם כמה חלופות סבירות שמשפיעות מהותית על ההמשך, עצור בנקודת checkpoint, הצג בקצרה אפשרויות והמלצה וחכה להכרעת המשתמש. אל תעצור על החלטות שגרתיות או כאלה שניתן להסיק בבטחה."
            : "במצב Autonomous, קבל בעצמך את ההחלטה הסבירה הטובה ביותר לפי המטרה והמידע והמשך; תעד בקצרה החלטות מהותיות כשמועיל. שאל רק אם חסר מידע חיוני שלא ניתן להסיק באופן סביר או נדרש אישור מפורש.";
    }

    function getHandoffPolicyInstruction(workStyle) {
        return normalizeWorkStyle(workStyle) === "deep"
            ? "במצב Deep, תכנן מקטעים משמעותיים שמתאימים לצ'אט אחד וקבע נקודות מעבר טבעיות: מה הצ'אט הנוכחי צריך לסיים ומה הצ'אט הבא אמור לקחת. לאחר מקטע משמעותי העדף מעבר אם ההמשך הוא שלב חדש, נושא נפרד, או שצ'אט חדש ישפר משמעותית את הפוקוס או איכות ההמשך."
            : "עבור לצ'אט חדש כשהמעבר תוכנן מראש או כשצ'אט חדש ישפר משמעותית את הפוקוס או איכות ההמשך; אל תעבור רק משום שהסתיים שלב רגיל.";
    }

    function getRunnerControlLines(
        startInstruction,
        workStyle,
        decisionMode
    ) {
        return [
            getWorkInstruction(workStyle),
            "",
            getCheckpointInstruction(),
            "",
            getDecisionInstruction(decisionMode),
            "",
            "אל תכתוב 'סיימתי' בסוף שלב רגיל. אם כל המשימה הכוללת הסתיימה ואין עוד עבודה להמשך, סיים בשורה נפרדת:",
            "סיימתי",
            "",
            "אם העבודה בצ'אט הנוכחי הסתיימה אבל המשימה ממשיכה בצ'אט חדש, כתוב סיימתי ואז, כתוכן האחרון בתשובה:",
            CONFIG.HANDOFF_OUTER_START,
            "בשלב זה מומלץ לעבור לצ'אט חדש.",
            CONFIG.HANDOFF_PROMPT_START,
            "כאן כתוב את ההודעה הקצרה ביותר שמספיקה לצ'אט החדש כדי להמשיך נכון.",
            CONFIG.HANDOFF_PROMPT_END,
            CONFIG.HANDOFF_OUTER_END,
            "",
            getHandoffPolicyInstruction(workStyle),
            "",
            "בעת יצירת NEXT_CHAT_PROMPT, העדף מקור אמת חיצוני ומתועד: עדכן אותו לפני המעבר אם חסר בו מידע חשוב, ובפרומפט כלול רק מידע חיוני שלא ניתן לשחזר ממנו.",
            "בדיקת המפתח: האם צ'אט חדש שיקבל את NEXT_CHAT_PROMPT יוכל להגיע למצב העדכני ולהמשיך נכון בלי להכיר את היסטוריית הצ'אט הזה? אם לא, קודם נסה לתעד או לעדכן את המידע החסר במקור האמת; רק מה שלא ניתן לשמור או לשחזר משם ייכלל בפרומפט.",
            "",
            "אל תשתמש בסימוני המעבר ואל תזכיר אותם אלא כאשר באמת עוברים לצ'אט חדש.",
            "",
            startInstruction
        ];
    }

    function buildCompactExistingReadyPrompt(
        workStyle,
        decisionMode
    ) {
        const style = normalizeWorkStyle(workStyle);
        const decisions = normalizeDecisionMode(decisionMode);
        const workInstruction =
            style === "deep"
                ? "Deep: בצע שלב משמעותי שלם עד תוצאה ברורה ומאומתת, כולל בדיקות ותיקונים נחוצים."
                : "Steady: התקדם עד checkpoint טבעי עם תוצאה ברורה ומאומתת; אל תעצור אחרי פעולה טכנית קטנה.";
        const decisionInstruction =
            decisions === "collaborative"
                ? "Collaborative: בהחלטה משמעותית עם כמה חלופות סבירות עצור, הצג אפשרויות והמלצה וחכה להכרעת המשתמש."
                : "Autonomous: קבל החלטות סבירות והמשך; שאל רק אם חסר מידע חיוני שלא ניתן להסיק או נדרש אישור.";

        return [
            "תמשיך לשלב הבא.",
            workInstruction,
            decisionInstruction,
            "אל תכתוב 'סיימתי' בסוף שלב רגיל. אם כל המשימה הסתיימה ואין עוד עבודה, סיים בשורה נפרדת:",
            "סיימתי",
            "אם הצ'אט הזה הסתיים אבל המשימה ממשיכה בצ'אט חדש, כתוב סיימתי ואז בסוף:",
            CONFIG.HANDOFF_OUTER_START,
            "בשלב זה מומלץ לעבור לצ'אט חדש.",
            CONFIG.HANDOFF_PROMPT_START,
            "ההודעה הקצרה ביותר שמספיקה לצ'אט החדש להמשיך נכון.",
            CONFIG.HANDOFF_PROMPT_END,
            CONFIG.HANDOFF_OUTER_END,
            "השתמש במעבר רק כשבאמת צריך צ'אט חדש; הודעת הפתיחה הקודמת נשארת בתוקף."
        ].join("\n");
    }

    function buildFirstPrompt(
        mode,
        taskText,
        workStyle,
        decisionMode
    ) {
        const style = normalizeWorkStyle(workStyle);
        const decisions = normalizeDecisionMode(decisionMode);
        const startInstruction =
            mode === "new"
                ? "עכשיו, התחל לבצע את המשימה והתקדם לשלב הראשון."
                : "עכשיו, תמשיך לשלב הבא.";

        if (mode !== "new") {
            return getRunnerControlLines(
                startInstruction,
                style,
                decisions
            ).join("\n");
        }

        const task = normalizeText(taskText);

        if (!task) {
            throw new Error(
                "A task is required when starting in new-task mode."
            );
        }

        return [
            "זו המשימה שעליך לבצע כעת:",
            task,
            "",
            ...getRunnerControlLines(
                startInstruction,
                style,
                decisions
            )
        ].join("\n");
    }

    function buildHandoffPrompt(nextChatPrompt) {
        const prompt = normalizeText(nextChatPrompt);

        if (!prompt) {
            throw new Error(
                "The next-chat prompt cannot be empty."
            );
        }

        const chatTitleInstruction =
            "שם הצ'אט: אם מופיע במשימה מספר צ'אט ברור, שם הצ'אט צריך להיות \"צ'אט N\" לפי אותו מספר. אם אין מספר צ'אט ברור, תן לצ'אט שם קצר ותיאורי שמסכם את מה שהצ'אט הזה מתוכנן לבצע.";

        return buildFirstPrompt(
            "new",
            [
                prompt,
                "",
                chatTitleInstruction
            ].join("\n"),
            selectedWorkStyle,
            selectedDecisionMode
        );
    }

    function parseHandoff(text) {
        const normalized =
            normalizeText(text);

        const markers = [
            CONFIG.HANDOFF_OUTER_START,
            CONFIG.HANDOFF_OUTER_END,
            CONFIG.HANDOFF_PROMPT_START,
            CONFIG.HANDOFF_PROMPT_END
        ];

        const requested = markers.some(
            function (marker) {
                return normalized.includes(
                    marker
                );
            }
        );

        if (!requested) {
            return {
                requested: false,
                nextChatPrompt: null,
                error: null
            };
        }

        if (
            !normalized.endsWith(
                CONFIG.HANDOFF_OUTER_END
            )
        ) {
            return {
                requested: true,
                nextChatPrompt: null,
                error: "The handoff block must be the final content in the assistant response."
            };
        }

        const outerStartIndex =
            normalized.lastIndexOf(
                CONFIG.HANDOFF_OUTER_START
            );

        const outerEndIndex =
            normalized.lastIndexOf(
                CONFIG.HANDOFF_OUTER_END
            );

        const promptStartIndex =
            normalized.indexOf(
                CONFIG.HANDOFF_PROMPT_START,
                outerStartIndex +
                    CONFIG.HANDOFF_OUTER_START.length
            );

        const promptEndIndex =
            normalized.indexOf(
                CONFIG.HANDOFF_PROMPT_END,
                promptStartIndex +
                    CONFIG.HANDOFF_PROMPT_START.length
            );

        if (
            outerStartIndex < 0 ||
            outerEndIndex < 0 ||
            promptStartIndex < 0 ||
            promptEndIndex < 0 ||
            !(
                outerStartIndex <
                promptStartIndex &&
                promptStartIndex <
                promptEndIndex &&
                promptEndIndex <
                outerEndIndex
            )
        ) {
            return {
                requested: true,
                nextChatPrompt: null,
                error: "The handoff markers are missing or out of order."
            };
        }

        const nextChatPrompt =
            normalizeText(
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
                error: "The next-chat prompt is empty."
            };
        }

        return {
            requested: true,
            nextChatPrompt,
            error: null
        };
    }

    function getTurns() {
        return [...document.querySelectorAll(SELECTORS.turn)].filter(function (el) {
            return el.getAttribute("data-turn-key");
        });
    }

    function getTurnKey(turn) {
        return turn?.getAttribute("data-turn-key") || null;
    }

    function scoreTurnNode(turn) {
        if (!turn) {
            return -1;
        }

        let score = 0;

        if (turn.querySelector(SELECTORS.userMessage)) {
            score += 10;
        }

        if (
            turn.querySelector(
                '[data-markdown-text-style="assistant-message"]'
            )
        ) {
            score += 40;
        }

        if (
            turn.querySelector(
                '[data-content-search-unit-key$=":assistant"],' +
                '[data-chatgpt-search-unit-key$=":assistant"]'
            )
        ) {
            score += 20;
        }

        if (hasFinalUi(turn)) {
            score += 80;
        }

        if (getDeliveryFailure(turn)) {
            score += 70;
        }

        return score;
    }

    function getTurnByKey(key) {
        if (!key) {
            return null;
        }

        const matches = getTurns().filter(function (turn) {
            return getTurnKey(turn) === key;
        });

        if (!matches.length) {
            return null;
        }

        matches.sort(function (a, b) {
            return scoreTurnNode(b) -
                scoreTurnNode(a);
        });

        return matches[0];
    }

    function getComposer() {
        return (
            getLastVisibleElement(
                'form[data-chatgpt-composer] [contenteditable="true"][data-composer-markdown]'
            ) ||
            getLastVisibleElement(SELECTORS.composer) ||
            getLastVisibleElement("#prompt-textarea") ||
            getLastVisibleElement(
                'div[contenteditable="true"][role="textbox"]'
            )
        );
    }

    function getSendButton() {
        return (
            getLastVisibleElement(SELECTORS.sendButton) ||
            getLastVisibleElement(
                'button[data-testid="send-button"]'
            )
        );
    }

    function getStopButton() {
        return (
            getLastVisibleElement(SELECTORS.stopButton) ||
            getLastVisibleElement(
                'button[data-testid="stop-button"]'
            )
        );
    }

    function isElementVisible(element) {
        if (!element || !element.isConnected) {
            return false;
        }

        const rect =
            element.getBoundingClientRect();

        const style =
            getComputedStyle(element);

        return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
        );
    }

    function getLastVisibleElement(selector) {
        const candidates = [
            ...document.querySelectorAll(selector)
        ].filter(isElementVisible);

        return candidates.at(-1) || null;
    }

    function isProjectChatPath() {
        return /^\/g\/g-p-[^/]+\/c\/[^/]+/.test(
            location.pathname
        );
    }

    function getCurrentProjectContext() {
        if (!isProjectChatPath()) {
            return null;
        }

        const breadcrumb =
            document.querySelector(
                'nav[aria-label="Breadcrumb"] a[href$="/project"]'
            );

        const name = normalizeText(
            breadcrumb?.innerText ||
            breadcrumb?.textContent ||
            ""
        );

        if (!name) {
            throw new Error(
                "Current chat is inside a Project, but the Project breadcrumb could not be identified."
            );
        }

        return {
            name,
            href:
                breadcrumb?.getAttribute(
                    "href"
                ) || null
        };
    }

    function findNewChatTarget() {
        const project =
            getCurrentProjectContext();

        if (project) {
            const expectedLabel =
                "New chat in " +
                project.name;

            const button = [
                ...document.querySelectorAll(
                    'button[aria-label^="New chat in "]'
                )
            ].find(function (candidate) {
                return (
                    candidate.getAttribute(
                        "aria-label"
                    ) === expectedLabel &&
                    isElementVisible(candidate)
                );
            });

            if (!button) {
                throw new Error(
                    "The New Chat button for the current Project was not found."
                );
            }

            return {
                button,
                kind: "project",
                project
            };
        }

        const button = [
            ...document.querySelectorAll(
                'button[aria-label="New chat"]'
            )
        ].find(isElementVisible);

        if (!button) {
            throw new Error(
                "The visible New Chat button was not found."
            );
        }

        return {
            button,
            kind: "regular",
            project: null
        };
    }

    async function openFreshChatForHandoff() {
        const target =
            findNewChatTarget();

        const oldUrl =
            location.href;

        const oldComposer =
            getComposer();

        const oldTurnKeys = new Set(
            getTurns()
                .map(getTurnKey)
                .filter(Boolean)
        );

        const navigationStartedAt =
            Date.now();

        target.button.click();

        const newUrl = await waitUntil(
            function () {
                return location.href !==
                    oldUrl
                    ? location.href
                    : null;
            },
            CONFIG.NAVIGATION_TIMEOUT_MS,
            50
        );

        if (!newUrl) {
            throw new Error(
                "New Chat navigation did not complete."
            );
        }

        const remainingMinimumWait =
            CONFIG.HANDOFF_MIN_READY_MS -
            (Date.now() - navigationStartedAt);

        if (remainingMinimumWait > 0) {
            await sleep(
                remainingMinimumWait
            );
        }

        const composer = await waitUntil(
            function () {
                const oldTurnStillVisible =
                    getTurns().some(
                        function (turn) {
                            const key =
                                getTurnKey(turn);

                            return (
                                key &&
                                oldTurnKeys.has(key) &&
                                isElementVisible(turn)
                            );
                        }
                    );

                if (oldTurnStillVisible) {
                    return null;
                }

                const candidate =
                    getComposer();

                if (
                    !candidate ||
                    !isElementVisible(
                        candidate
                    ) ||
                    getStopButton()
                ) {
                    return null;
                }

                const text = normalizeText(
                    candidate.innerText ||
                    candidate.textContent ||
                    candidate.value ||
                    ""
                );

                return text
                    ? null
                    : candidate;
            },
            CONFIG.NAVIGATION_TIMEOUT_MS,
            50
        );

        if (!composer) {
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
        };
    }

    function getAssistantMessage(turn) {
        if (!turn) {
            return null;
        }

        const assistantUnit = [
            ...turn.querySelectorAll(
                '[data-content-search-unit-key$=":assistant"],' +
                '[data-chatgpt-search-unit-key$=":assistant"]'
            )
        ].at(-1);

        if (assistantUnit) {
            const selectionMessage =
                assistantUnit.querySelector(
                    '[data-chatgpt-selection-message-id]'
                );

            if (selectionMessage) {
                return selectionMessage;
            }
        }

        const assistantRole = [
            ...turn.querySelectorAll(
                'h4[data-conversation-role="assistant"]'
            )
        ].at(-1);

        if (assistantRole) {
            const roleContainer =
                assistantRole.parentElement;

            const roleSelection =
                roleContainer?.querySelector(
                    '[data-chatgpt-selection-message-id]'
                );

            if (roleSelection) {
                return roleSelection;
            }
        }

        const primary = [
            ...turn.querySelectorAll(
                SELECTORS.assistantMessage
            )
        ].at(-1);

        if (primary) {
            return primary;
        }

        if (assistantUnit) {
            const nestedMarkdown = [
                ...assistantUnit.querySelectorAll(
                    '[data-markdown-text-style="assistant-message"]'
                )
            ].at(-1);

            if (nestedMarkdown) {
                return nestedMarkdown;
            }

            return assistantUnit;
        }

        return null;
    }

    function hasFinalUi(turn) {
        return !!turn?.querySelector(
            SELECTORS.regenerateButton
        );
    }

    function getAssistantText(turn) {
        const assistant =
            getAssistantMessage(turn);

        if (!assistant) {
            return "";
        }

        return normalizeText(
            assistant.innerText ||
            assistant.textContent ||
            ""
        );
    }

    function getTerminalResponseMarker(turn) {
        if (!turn) {
            return null;
        }

        const terminalTexts = new Set([
            "Stopped thinking",
            "Stopped generating"
        ]);

        const candidates = [
            ...turn.querySelectorAll("span,div")
        ];

        for (const candidate of candidates) {
            if (
                candidate.children.length > 0 ||
                candidate.closest(SELECTORS.userMessage)
            ) {
                continue;
            }

            const text = normalizeText(
                candidate.innerText ||
                candidate.textContent ||
                ""
            );

            if (terminalTexts.has(text)) {
                return text;
            }
        }

        return null;
    }

    function getDeliveryFailure(turn) {
        if (!turn) {
            return null;
        }

        const alerts = [
            ...turn.querySelectorAll('aside[role="alert"]')
        ];

        for (const alert of alerts) {
            const text = normalizeText(
                alert.innerText ||
                alert.textContent ||
                ""
            );

            if (!text.includes(CONFIG.DELIVERY_TIMEOUT_MESSAGE)) {
                continue;
            }

            const button = [
                ...alert.querySelectorAll("button")
            ].find(function (candidate) {
                const label = normalizeText(
                    candidate.innerText ||
                    candidate.textContent ||
                    ""
                );

                return (
                    label === "Retry" &&
                    !candidate.disabled &&
                    isElementVisible(candidate)
                );
            }) || null;

            return {
                alert,
                button,
                message: CONFIG.DELIVERY_TIMEOUT_MESSAGE
            };
        }

        return null;
    }

    async function recoverDeliveryFailure(cycle, failure) {
        if (
            stopped ||
            currentCycle !== cycle ||
            cycle.processed ||
            cycle.deliveryRetryState === "clicking"
        ) {
            return;
        }

        if (!cycle.prompt) {
            fail(
                "The tracked message failed to deliver, but it was not sent by Sequence Runner, so automatic Retry was not attempted."
            );
            return;
        }

        if (!failure.button) {
            record("delivery-retry-unavailable", {
                id: cycle.id,
                turnKey: cycle.turnKey
            });

            fail(
                "ChatGPT reported a message delivery timeout, but the Retry control was not found in the tracked turn."
            );
            return;
        }

        if (
            cycle.deliveryRetryAttempts >=
            CONFIG.DELIVERY_RETRY_MAX_ATTEMPTS
        ) {
            record("delivery-retry-exhausted", {
                id: cycle.id,
                turnKey: cycle.turnKey,
                attempts: cycle.deliveryRetryAttempts
            });

            fail(
                "ChatGPT message delivery timed out again after the automatic Retry. No further retries were attempted."
            );
            return;
        }

        cycle.deliveryRetryAttempts++;
        cycle.deliveryRetryState = "clicking";
        cycle.deliveryRetryClickedAt = Date.now();
        cycle.lastText = null;
        cycle.lastTextChangedAt = 0;
        cycle.longWaitNoticeBucket = -1;
        cycle.activeGenerationStartedAt = null;
        cycle.wakeState = "idle";
        cycle.wakeThresholdReachedAt = null;
        cycle.wakeDeferredReason = null;
        cycle.wakeSentAt = null;

        record("delivery-retry-clicked", {
            id: cycle.id,
            turnKey: cycle.turnKey,
            attempt: cycle.deliveryRetryAttempts
        });

        setState(
            "RETRYING_DELIVERY",
            "🔁 ההודעה לא נמסרה; לוחץ Retry פעם אחת ועוקב אחר אותו שלב...",
            "#b45309"
        );

        const clickedButton = failure.button;
        clickedButton.click();

        const evidence = await waitUntil(
            function () {
                if (
                    stopped ||
                    currentCycle !== cycle
                ) {
                    return "cancelled";
                }

                if (!clickedButton.isConnected) {
                    return "retry-control-replaced";
                }

                if (getStopButton()) {
                    return "generation-started";
                }

                const activeTurn =
                    resolveCycleTurn(cycle);

                if (
                    activeTurn &&
                    getAssistantText(activeTurn)
                ) {
                    return "assistant-visible";
                }

                return null;
            },
            CONFIG.DELIVERY_RETRY_START_TIMEOUT_MS,
            50
        );

        if (
            stopped ||
            currentCycle !== cycle ||
            evidence === "cancelled"
        ) {
            return;
        }

        if (!evidence) {
            cycle.deliveryRetryState = "failed";

            record("delivery-retry-failed", {
                id: cycle.id,
                turnKey: cycle.turnKey,
                attempt: cycle.deliveryRetryAttempts,
                reason: "retry-did-not-start"
            });

            fail(
                "ChatGPT message delivery timed out and the automatic Retry did not start a new attempt."
            );
            return;
        }

        cycle.deliveryRetryState = "retried";

        record("delivery-retry-started", {
            id: cycle.id,
            turnKey: cycle.turnKey,
            attempt: cycle.deliveryRetryAttempts,
            evidence
        });

        scheduleEvaluate();
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    async function waitUntil(predicate, timeoutMs, stepMs) {
        const started = Date.now();
        const step = stepMs || 50;

        while (
            !stopped &&
            (
                timeoutMs == null ||
                Date.now() - started < timeoutMs
            )
        ) {
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

    function getLongWaitStatus(baseMessage, startedAt, tracker, scope) {
        const elapsedMs = Date.now() - startedAt;

        if (elapsedMs < CONFIG.LONG_WAIT_NOTICE_AFTER_MS) {
            return baseMessage;
        }

        const minutes = Math.max(
            1,
            Math.floor(elapsedMs / 60000)
        );

        const noticeBucket = Math.floor(
            (elapsedMs - CONFIG.LONG_WAIT_NOTICE_AFTER_MS) /
                CONFIG.LONG_WAIT_NOTICE_EVERY_MS
        );

        if (
            tracker &&
            tracker.longWaitNoticeBucket !== noticeBucket
        ) {
            tracker.longWaitNoticeBucket = noticeBucket;

            record("long-wait", {
                scope,
                elapsedMs,
                minutes
            });
        }

        return baseMessage + " (" + minutes + " min)";
    }

    function formatInteger(value) {
        return new Intl.NumberFormat().format(value || 0);
    }

    function formatDuration(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return hours + ":" +
                String(minutes).padStart(2, "0") + ":" +
                String(seconds).padStart(2, "0");
        }

        return minutes + ":" + String(seconds).padStart(2, "0");
    }

    function formatWakeDelay(minutes) {
        return minutes === 1
            ? "דקה"
            : minutes + " דקות";
    }

    function getChatMetrics() {
        const userMessages = [
            ...document.querySelectorAll(SELECTORS.userMessage)
        ];

        const assistantMessages = [
            ...document.querySelectorAll(SELECTORS.assistantMessage)
        ];

        const characterCount = userMessages
            .concat(assistantMessages)
            .reduce(function (sum, element) {
                return sum + normalizeText(
                    element.innerText ||
                    element.textContent ||
                    ""
                ).length;
            }, 0);

        return {
            turns: getTurns().length,
            userMessages: userMessages.length,
            assistantMessages: assistantMessages.length,
            totalMessages:
                userMessages.length +
                assistantMessages.length,
            characterCount
        };
    }

    function renderPanel() {
        if (!panel.isConnected) {
            return;
        }

        const chat = getChatMetrics();

        metricsDiv.innerHTML = [
            '<span style="color:#94a3b8">הודעות בצ׳אט</span><strong>' +
                formatInteger(chat.totalMessages) + '</strong>',
            '<span style="color:#94a3b8">Turns</span><strong>' +
                formatInteger(chat.turns) + '</strong>',
            '<span style="color:#94a3b8">User / Assistant</span><strong>' +
                formatInteger(chat.userMessages) + ' / ' +
                formatInteger(chat.assistantMessages) + '</strong>',
            '<span style="color:#94a3b8">אורך טקסט</span><strong>' +
                formatInteger(chat.characterCount) + ' תווים</strong>',
            '<span style="color:#94a3b8">תגובות Runner</span><strong>' +
                formatInteger(completedResponseCount) + '</strong>',
            '<span style="color:#94a3b8">נשלחו ע״י Runner</span><strong>' +
                formatInteger(cycleSeq) + '</strong>',
            '<span style="color:#94a3b8">מעברי צ׳אט</span><strong>' +
                formatInteger(handoffCount) +
                (handoffInProgress
                    ? ' (בתהליך)'
                    : '') + '</strong>',
            '<span style="color:#94a3b8">הודעות ביניים</span><strong>' +
                formatInteger(injectionSentCount) + ' / ' +
                formatInteger(injectionQueue.length) + ' ממתינות</strong>',
            '<span style="color:#94a3b8">שליחה ממתינה</span><strong>' +
                (pendingAutoSend
                    ? "כן"
                    : "לא") + '</strong>',
            '<span style="color:#94a3b8">זמן ריצה</span><strong>' +
                (runnerStartedAt == null
                    ? "—"
                    : formatDuration(Date.now() - runnerStartedAt)) + '</strong>',
            '<span style="color:#94a3b8">State</span><strong style="font-size:11px;word-break:break-word">' +
                state + '</strong>'
        ].join("");

        if (stopAfterCompletedResponses == null) {
            limitStatusDiv.textContent =
                "ללא גבול — נעצר רק בסיום המוגדר.";
        } else {
            const remaining = Math.max(
                0,
                stopAfterCompletedResponses -
                    completedResponseCount
            );

            limitStatusDiv.textContent =
                "גבול פעיל: עצירה אחרי תגובת Runner #" +
                stopAfterCompletedResponses +
                " (" + remaining + " נותרו).";
        }

        const startConfig = panel.querySelector(
            '[data-role="start-config"]'
        );

        if (startConfig) {
            startConfig.style.display =
                runStarted ? "none" : "";
        }

        if (injectionStatusDiv) {
            if (!injectionQueue.length) {
                injectionStatusDiv.textContent =
                    "אין הודעות ביניים מתוזמנות.";
            } else {
                const next = injectionQueue[0];
                const remaining = Math.max(
                    0,
                    next.targetCompletedResponses -
                        completedResponseCount
                );

                injectionStatusDiv.textContent =
                    injectionQueue.length +
                    " ממתינות. הבאה: " +
                    (remaining === 0
                        ? "בגבול הבטוח הקרוב"
                        : "בעוד " +
                          remaining +
                          " תגובות") +
                    ".";
            }
        }

        if (injectionManagerButton) {
            injectionManagerButton.textContent =
                "ניהול הודעות ביניים (" +
                injectionQueue.length +
                ")";
        }

        const immediateButton = panel.querySelector(
            '[data-action="send-injection-immediately"]'
        );

        if (immediateButton) {
            immediateButton.disabled =
                immediateSendLocked || stopped;
            immediateButton.style.opacity =
                immediateButton.disabled
                    ? ".55"
                    : "1";
            immediateButton.style.cursor =
                immediateButton.disabled
                    ? "default"
                    : "pointer";
        }

        if (resumeButton) {
            resumeButton.style.display =
                pendingAutoSend &&
                !stopped
                    ? ""
                    : "none";
            resumeButton.disabled =
                pendingAutoSendLocked;
            resumeButton.style.opacity =
                pendingAutoSendLocked
                    ? ".55"
                    : "1";
        }

        const stopButton = panel.querySelector(
            '[data-action="stop"]'
        );

        if (stopButton) {
            stopButton.disabled = stopped;
            stopButton.style.opacity = stopped ? ".55" : "1";
            stopButton.style.cursor =
                stopped ? "default" : "pointer";
        }

        if (restartButton) {
            restartButton.style.display =
                stopped ? "" : "none";
            restartButton.disabled = !stopped;
            restartButton.style.opacity =
                stopped ? "1" : ".55";
            restartButton.style.cursor =
                stopped ? "pointer" : "default";
        }
    }

    function parsePositiveInteger(value) {
        const parsed = Number(value);

        if (
            !Number.isInteger(parsed) ||
            parsed <= 0
        ) {
            return null;
        }

        return parsed;
    }

    function parseNonNegativeInteger(value) {
        const parsed = Number(value);

        if (
            !Number.isInteger(parsed) ||
            parsed < 0
        ) {
            return null;
        }

        return parsed;
    }

    function escapeHtml(value) {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return String(value).replace(
            /[&<>"']/g,
            function (character) {
                return replacements[character];
            }
        );
    }

    function applyStepLimit(target, mode) {
        stopAfterCompletedResponses = target;
        stopLimitMode = mode;

        record("step-limit-set", {
            target,
            mode,
            completedResponseCount
        });

        renderPanel();

        if (
            !stopped &&
            completedResponseCount >= target &&
            (!currentCycle || currentCycle.processed)
        ) {
            stop("step-limit", false);
        }
    }

    function clearStepLimit() {
        stopAfterCompletedResponses = null;
        stopLimitMode = null;

        record("step-limit-cleared", {
            completedResponseCount
        });

        renderPanel();
    }

    function shouldStopForStepLimit() {
        return (
            stopAfterCompletedResponses != null &&
            completedResponseCount >=
                stopAfterCompletedResponses
        );
    }

    function sortInjectionQueue() {
        injectionQueue.sort(function (a, b) {
            return (
                a.targetCompletedResponses -
                    b.targetCompletedResponses ||
                a.order - b.order ||
                a.id - b.id
            );
        });
    }

    function getQueuedInjectionById(id) {
        return injectionQueue.find(function (item) {
            return item.id === id;
        }) || null;
    }

    function renderInjectionManager() {
        if (!injectionListDiv) {
            return;
        }

        sortInjectionQueue();

        if (!injectionQueue.length) {
            injectionListDiv.innerHTML =
                '<div style="font-size:11px;color:#94a3b8;padding:4px 2px">אין כרגע הודעות ביניים בתור.</div>';
            return;
        }

        injectionListDiv.innerHTML =
            injectionQueue.map(function (item, index) {
                const remaining = Math.max(
                    0,
                    item.targetCompletedResponses -
                        completedResponseCount
                );

                const canMoveUp =
                    index > 0 &&
                    injectionQueue[
                        index - 1
                    ].targetCompletedResponses ===
                        item.targetCompletedResponses;

                const canMoveDown =
                    index <
                        injectionQueue.length - 1 &&
                    injectionQueue[
                        index + 1
                    ].targetCompletedResponses ===
                        item.targetCompletedResponses;

                const disabledStyle =
                    "opacity:.38;cursor:default";

                return [
                    '<div data-injection-id="' +
                        item.id +
                        '" style="border:1px solid #334155;border-radius:6px;padding:6px;background:#111827">',
                    '<div style="display:flex;justify-content:space-between;gap:6px;align-items:center;margin-bottom:5px">',
                    '<strong style="font-size:11px">#' +
                        item.id +
                        '</strong>',
                    '<span style="font-size:10px;color:#a78bfa">' +
                        (remaining === 0
                            ? "בגבול הקרוב"
                            : "בעוד " +
                              remaining +
                              " תגובות") +
                        " · יעד #" +
                        item.targetCompletedResponses +
                        "</span>",
                    "</div>",
                    '<textarea data-field="text" rows="3" style="width:100%;box-sizing:border-box;resize:vertical;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:5px;padding:6px;margin-bottom:5px">' +
                        escapeHtml(item.text) +
                        "</textarea>",
                    '<div style="display:grid;grid-template-columns:1fr auto;gap:5px;margin-bottom:5px">',
                    '<input data-field="after" type="number" min="0" step="1" value="' +
                        remaining +
                        '" title="0 = הגבול הבטוח הקרוב" style="min-width:0;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:5px;padding:5px 6px">',
                    '<button type="button" data-action="update-injection" style="border:0;background:#6d28d9;color:#fff;border-radius:5px;padding:5px 8px;cursor:pointer">עדכן</button>',
                    "</div>",
                    '<div style="display:flex;gap:5px">',
                    '<button type="button" data-action="move-injection-up"' +
                        (canMoveUp
                            ? ""
                            : " disabled") +
                        ' title="העבר לפני הודעה אחרת באותו יעד" style="flex:0 0 34px;border:1px solid #475569;background:#1f2937;color:#fff;border-radius:5px;padding:4px;cursor:pointer;' +
                        (canMoveUp
                            ? ""
                            : disabledStyle) +
                        '">↑</button>',
                    '<button type="button" data-action="move-injection-down"' +
                        (canMoveDown
                            ? ""
                            : " disabled") +
                        ' title="העבר אחרי הודעה אחרת באותו יעד" style="flex:0 0 34px;border:1px solid #475569;background:#1f2937;color:#fff;border-radius:5px;padding:4px;cursor:pointer;' +
                        (canMoveDown
                            ? ""
                            : disabledStyle) +
                        '">↓</button>',
                    '<button type="button" data-action="delete-injection" style="flex:1;border:0;background:#7f1d1d;color:#fff;border-radius:5px;padding:4px 6px;cursor:pointer">מחק</button>',
                    "</div>",
                    "</div>"
                ].join("");
            }).join("");
    }

    function queueInjection(text, afterResponses) {
        const message = normalizeText(text);

        if (!message) {
            throw new Error(
                "Intermediate message cannot be empty."
            );
        }

        const offset = Number(afterResponses);

        if (
            !Number.isInteger(offset) ||
            offset < 0
        ) {
            throw new Error(
                "Intermediate message offset must be a non-negative integer."
            );
        }

        if (stopped) {
            throw new Error(
                "Cannot queue a message after the runner has stopped."
            );
        }

        const id = ++injectionSeq;
        const item = {
            id,
            text: message,
            targetCompletedResponses:
                completedResponseCount + offset,
            createdAt: Date.now(),
            order: id
        };

        injectionQueue.push(item);
        sortInjectionQueue();

        record("injection-queued", {
            id: item.id,
            targetCompletedResponses:
                item.targetCompletedResponses,
            offset
        });

        renderPanel();
        renderInjectionManager();
        return item.id;
    }

    function updateQueuedInjection(
        id,
        text,
        afterResponses
    ) {
        const item = getQueuedInjectionById(id);

        if (!item) {
            throw new Error(
                "Queued intermediate message was not found."
            );
        }

        const message = normalizeText(text);

        if (!message) {
            throw new Error(
                "Intermediate message cannot be empty."
            );
        }

        const offset =
            parseNonNegativeInteger(afterResponses);

        if (offset == null) {
            throw new Error(
                "Intermediate message offset must be a non-negative integer."
            );
        }

        item.text = message;
        item.targetCompletedResponses =
            completedResponseCount + offset;

        sortInjectionQueue();

        record("injection-updated", {
            id: item.id,
            targetCompletedResponses:
                item.targetCompletedResponses,
            offset
        });

        renderPanel();
        renderInjectionManager();
        return true;
    }

    function deleteQueuedInjection(id) {
        const index = injectionQueue.findIndex(
            function (item) {
                return item.id === id;
            }
        );

        if (index < 0) {
            return false;
        }

        const item = injectionQueue.splice(
            index,
            1
        )[0];

        record("injection-deleted", {
            id: item.id
        });

        renderPanel();
        renderInjectionManager();
        return true;
    }

    function moveQueuedInjection(id, direction) {
        sortInjectionQueue();

        const index = injectionQueue.findIndex(
            function (item) {
                return item.id === id;
            }
        );

        if (index < 0) {
            return false;
        }

        const delta =
            direction === "up"
                ? -1
                : direction === "down"
                  ? 1
                  : 0;

        if (!delta) {
            throw new Error(
                "Direction must be 'up' or 'down'."
            );
        }

        const neighborIndex = index + delta;
        const item = injectionQueue[index];
        const neighbor =
            injectionQueue[neighborIndex];

        if (
            !neighbor ||
            neighbor.targetCompletedResponses !==
                item.targetCompletedResponses
        ) {
            return false;
        }

        const oldOrder = item.order;
        item.order = neighbor.order;
        neighbor.order = oldOrder;

        sortInjectionQueue();

        record("injection-reordered", {
            id: item.id,
            direction,
            targetCompletedResponses:
                item.targetCompletedResponses
        });

        renderPanel();
        renderInjectionManager();
        return true;
    }

    function clearQueuedInjections() {
        const count = injectionQueue.length;
        injectionQueue.length = 0;

        record("injection-queue-cleared", {
            count
        });

        renderPanel();
        renderInjectionManager();
    }

    function takeDueInjection() {
        if (!injectionQueue.length) {
            return null;
        }

        const next = injectionQueue[0];

        if (
            next.targetCompletedResponses >
            completedResponseCount
        ) {
            return null;
        }

        const item = injectionQueue.shift();
        renderPanel();
        renderInjectionManager();
        return item;
    }

    function getPanelSizeLimits() {
        return {
            maxWidth: Math.max(
                PANEL_MIN_SIZE.width,
                window.innerWidth - 16
            ),
            maxHeight: Math.max(
                PANEL_MIN_SIZE.height,
                window.innerHeight - 16
            )
        };
    }

    function normalizePanelSize(width, height) {
        const limits = getPanelSizeLimits();

        return {
            width: Math.max(
                PANEL_MIN_SIZE.width,
                Math.min(
                    Number(width) ||
                        PANEL_DEFAULT_SIZE.width,
                    limits.maxWidth
                )
            ),
            height: Math.max(
                PANEL_MIN_SIZE.height,
                Math.min(
                    Number(height) ||
                        PANEL_DEFAULT_SIZE.height,
                    limits.maxHeight
                )
            )
        };
    }

    function savePanelSize() {
        if (
            panelBody.style.display === "none"
        ) {
            return;
        }

        try {
            const rect =
                panel.getBoundingClientRect();

            const size = normalizePanelSize(
                rect.width,
                rect.height
            );

            localStorage.setItem(
                PANEL_STORAGE_KEYS.size,
                JSON.stringify(size)
            );
        } catch (_) {}
    }

    function restorePanelSize() {
        let size = PANEL_DEFAULT_SIZE;

        try {
            const rawSize =
                localStorage.getItem(
                    PANEL_STORAGE_KEYS.size
                );

            if (rawSize) {
                size = JSON.parse(rawSize);
            }
        } catch (_) {}

        const normalized =
            normalizePanelSize(
                size.width,
                size.height
            );

        panel.style.width =
            normalized.width + "px";

        panel.style.height =
            normalized.height + "px";
    }

    function keepPanelInViewport() {
        const rect =
            panel.getBoundingClientRect();

        const maxLeft = Math.max(
            0,
            window.innerWidth -
                Math.min(
                    rect.width,
                    window.innerWidth
                )
        );

        const maxTop = Math.max(
            0,
            window.innerHeight - 40
        );

        const left = Math.max(
            0,
            Math.min(rect.left, maxLeft)
        );

        const top = Math.max(
            0,
            Math.min(rect.top, maxTop)
        );

        panel.style.left = left + "px";
        panel.style.top = top + "px";
        panel.style.right = "auto";
    }

    function restorePanelPreferences() {
        try {
            restorePanelSize();

            const rawPosition = localStorage.getItem(
                PANEL_STORAGE_KEYS.position
            );

            if (rawPosition) {
                const position = JSON.parse(rawPosition);

                if (
                    Number.isFinite(position.left) &&
                    Number.isFinite(position.top)
                ) {
                    panel.style.left =
                        position.left + "px";

                    panel.style.top =
                        position.top + "px";

                    panel.style.right = "auto";
                }
            }

            const minimized =
                localStorage.getItem(
                    PANEL_STORAGE_KEYS.minimized
                ) === "1";

            panelBody.style.display =
                minimized ? "none" : "";

            if (resizeHandle) {
                resizeHandle.style.display =
                    minimized ? "none" : "flex";
            }

            if (minimized) {
                panel.style.height = "auto";
                panel.style.minHeight = "0";
            } else {
                panel.style.minHeight =
                    PANEL_MIN_SIZE.height + "px";
            }

            const minimizeButton =
                panel.querySelector(
                    '[data-action="minimize"]'
                );

            if (minimizeButton) {
                minimizeButton.textContent =
                    minimized ? "+" : "−";
                minimizeButton.title =
                    minimized ? "פתח" : "מזער";
            }

            keepPanelInViewport();
        } catch (_) {}
    }

    function diagnosticSafeCapture(errors, label, capture, fallbackValue) {
        try {
            return capture();
        } catch (err) {
            errors.push({
                label,
                name: err?.name || "Error",
                message: err?.message || String(err || "")
            });
            return fallbackValue;
        }
    }

    function diagnosticText(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function diagnosticPreview(value, maxLength) {
        const textValue = diagnosticText(value);
        const limit = Math.max(0, maxLength || 600);
        return textValue.length <= limit
            ? textValue
            : textValue.slice(0, limit) + "…";
    }

    function diagnosticRect(element) {
        if (!element) {
            return null;
        }

        const rect = element.getBoundingClientRect();
        return {
            x: rect.x,
            y: rect.y,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
            height: rect.height
        };
    }

    function diagnosticAttributes(element) {
        if (!element?.attributes) {
            return {};
        }

        const attributes = {};
        [...element.attributes].forEach(function (attribute) {
            attributes[attribute.name] = attribute.value;
        });
        return attributes;
    }

    function diagnosticElementSummary(element) {
        if (!element) {
            return null;
        }

        return {
            tag: element.tagName?.toLowerCase() || null,
            id: element.id || null,
            className: element.getAttribute?.("class") || null,
            ariaLabel: element.getAttribute?.("aria-label") || null,
            testId: element.getAttribute?.("data-testid") || null,
            title: element.getAttribute?.("title") || null,
            disabled: "disabled" in element ? !!element.disabled : null,
            visible: isElementVisible(element),
            rect: diagnosticRect(element),
            text: diagnosticPreview(
                element.innerText || element.textContent || "",
                500
            ),
            attributes: diagnosticAttributes(element)
        };
    }

    function diagnosticQuery(selector, errors, root) {
        return diagnosticSafeCapture(
            errors,
            "selector:" + selector,
            function () {
                const queryRoot = root || document;
                const nodes = [...queryRoot.querySelectorAll(selector)];
                return {
                    selector,
                    count: nodes.length,
                    visibleCount: nodes.filter(isElementVisible).length,
                    nodes: nodes.slice(0, 30).map(diagnosticElementSummary)
                };
            },
            {
                selector,
                count: null,
                visibleCount: null,
                nodes: [],
                error: true
            }
        );
    }

    function diagnosticControlInventory(root, errors) {
        return diagnosticSafeCapture(
            errors,
            "control-inventory",
            function () {
                return [...(root || document).querySelectorAll(
                    'button,[role="button"],input,textarea,[contenteditable="true"]'
                )]
                    .filter(function (element) {
                        return isElementVisible(element);
                    })
                    .slice(0, 250)
                    .map(diagnosticElementSummary);
            },
            []
        );
    }

    function diagnosticAssistantSelectorMatches(turn, errors) {
        const selectors = [
            '[data-markdown-text-style="assistant-message"]',
            '[data-content-search-unit-key$=":assistant"]',
            '[data-chatgpt-search-unit-key$=":assistant"]',
            '[data-chatgpt-selection-message-id]',
            'h4[data-conversation-role="assistant"]'
        ];

        return selectors.map(function (selector) {
            return diagnosticQuery(selector, errors, turn);
        });
    }

    function diagnosticTurnSummary(turn, index, errors) {
        const userNode = diagnosticSafeCapture(
            errors,
            "turn-user-message:" + index,
            function () {
                return turn.querySelector(SELECTORS.userMessage);
            },
            null
        );
        const textValue = diagnosticSafeCapture(
            errors,
            "turn-text:" + index,
            function () {
                return diagnosticText(turn.innerText || turn.textContent || "");
            },
            ""
        );
        const assistantMatches = diagnosticAssistantSelectorMatches(turn, errors);

        return {
            index,
            turnKey: getTurnKey(turn),
            visible: isElementVisible(turn),
            rect: diagnosticRect(turn),
            textLength: textValue.length,
            textPreview: diagnosticPreview(textValue, 1000),
            userMessage: userNode
                ? diagnosticPreview(userNode.innerText || userNode.textContent || "", 1000)
                : null,
            assistantMatches,
            roleHeadings: diagnosticQuery(
                'h4[data-conversation-role]',
                errors,
                turn
            ),
            selectionMessages: diagnosticQuery(
                '[data-chatgpt-selection-message-id]',
                errors,
                turn
            ),
            buttons: diagnosticQuery("button", errors, turn),
            finalUiPresent: diagnosticSafeCapture(
                errors,
                "turn-final-ui:" + index,
                function () {
                    return !!turn.querySelector(SELECTORS.regenerateButton);
                },
                false
            )
        };
    }

    function diagnosticDeepTurn(turn, errors) {
        if (!turn) {
            return null;
        }

        const keywords = [
            "assistant",
            "message",
            "conversation",
            "response",
            "turn",
            "markdown",
            "selection",
            "author"
        ];

        const descendants = diagnosticSafeCapture(
            errors,
            "current-turn-descendants",
            function () {
                const matched = [...turn.querySelectorAll("*")].filter(function (element) {
                    const descriptor = [
                        element.tagName,
                        element.id,
                        element.getAttribute?.("class"),
                        element.getAttribute?.("role"),
                        element.getAttribute?.("aria-label"),
                        element.getAttribute?.("data-testid"),
                        element.getAttribute?.("data-content-search-unit-key"),
                        element.getAttribute?.("data-chatgpt-search-unit-key"),
                        element.getAttribute?.("data-chatgpt-selection-message-id"),
                        element.getAttribute?.("data-conversation-role"),
                        element.getAttribute?.("data-markdown-text-style")
                    ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();

                    return keywords.some(function (keyword) {
                        return descriptor.includes(keyword);
                    });
                });

                return {
                    matchedCount: matched.length,
                    nodes: matched.slice(0, 250).map(diagnosticElementSummary)
                };
            },
            { matchedCount: null, nodes: [] }
        );

        return {
            turnKey: getTurnKey(turn),
            visible: isElementVisible(turn),
            rect: diagnosticRect(turn),
            attributes: diagnosticAttributes(turn),
            visibleText: diagnosticSafeCapture(
                errors,
                "current-turn-visible-text",
                function () {
                    return turn.innerText || turn.textContent || "";
                },
                ""
            ),
            outerHTML: diagnosticSafeCapture(
                errors,
                "current-turn-outer-html",
                function () {
                    return turn.outerHTML;
                },
                null
            ),
            assistantMatches: diagnosticAssistantSelectorMatches(turn, errors),
            controls: diagnosticControlInventory(turn, errors),
            descendants
        };
    }

    function diagnosticCycleSnapshot(cycle) {
        if (!cycle) {
            return null;
        }

        return {
            id: cycle.id ?? null,
            label: cycle.label ?? null,
            prompt: cycle.prompt ?? null,
            sentAt: cycle.sentAt ?? null,
            elapsedMs:
                cycle.sentAt == null
                    ? null
                    : Math.max(0, Date.now() - cycle.sentAt),
            turnKey: cycle.turnKey ?? null,
            sawStop: !!cycle.sawStop,
            lastTextLength:
                cycle.lastText == null
                    ? 0
                    : String(cycle.lastText).length,
            lastTextPreview: diagnosticPreview(cycle.lastText || "", 800),
            lastTextChangedAt: cycle.lastTextChangedAt ?? null,
            longWaitNoticeBucket: cycle.longWaitNoticeBucket ?? null,
            activeGenerationStartedAt: cycle.activeGenerationStartedAt ?? null,
            wakeState: cycle.wakeState ?? null,
            wakeThresholdReachedAt: cycle.wakeThresholdReachedAt ?? null,
            wakeDeferredReason: cycle.wakeDeferredReason ?? null,
            wakeSentAt: cycle.wakeSentAt ?? null,
            deliveryRetryAttempts: cycle.deliveryRetryAttempts ?? 0,
            deliveryRetryState: cycle.deliveryRetryState ?? "idle",
            deliveryRetryClickedAt: cycle.deliveryRetryClickedAt ?? null,
            processed: !!cycle.processed,
            beforeTurnKeys: cycle.beforeKeys
                ? [...cycle.beforeKeys]
                : []
        };
    }

    function diagnosticQueuedMessages() {
        return injectionQueue.map(function (item) {
            return {
                id: item.id,
                text: item.text,
                targetCompletedResponses: item.targetCompletedResponses,
                createdAt: item.createdAt,
                order: item.order
            };
        });
    }

    function diagnosticPendingAutoSend() {
        return pendingAutoSend
            ? {
                  prompt: pendingAutoSend.prompt,
                  label: pendingAutoSend.label,
                  reason: pendingAutoSend.reason,
                  baselineTurnKeys:
                      pendingAutoSend.baselineTurnKeys || [],
                  deferredAt: pendingAutoSend.deferredAt
              }
            : null;
    }

    function diagnosticHypotheses(snapshot) {
        const observations = [];
        const currentTurn = snapshot.currentTurn;
        const currentCycleSnapshot = snapshot.runner.currentCycle;

        if (currentCycleSnapshot?.turnKey && !currentTurn) {
            observations.push({
                code: "CURRENT_TURN_NOT_RESOLVED",
                message: "The tracked turnKey could not be resolved in the current DOM."
            });
        }

        if (currentTurn) {
            const knownAssistantMatches = currentTurn.assistantMatches.reduce(
                function (total, entry) {
                    return total + (Number.isFinite(entry.count) ? entry.count : 0);
                },
                0
            );
            const visibleText = diagnosticText(currentTurn.visibleText);

            if (visibleText && knownAssistantMatches === 0) {
                observations.push({
                    code: "VISIBLE_TURN_TEXT_BUT_ASSISTANT_SELECTOR_MISS",
                    message: "The tracked turn has visible text but none of the known Assistant selectors matched."
                });
            }

            const duplicateCount = snapshot.turns.filter(function (turn) {
                return turn.turnKey === currentTurn.turnKey;
            }).length;

            if (duplicateCount > 1) {
                observations.push({
                    code: "DUPLICATE_TRACKED_TURN_KEY",
                    message: "Multiple DOM turn nodes share the tracked turnKey.",
                    count: duplicateCount
                });
            }

            if (!currentTurn.visible) {
                observations.push({
                    code: "TRACKED_TURN_HIDDEN",
                    message: "The tracked turn is currently hidden or has no visible box."
                });
            }

            const regenerate = currentTurn.assistantMatches;
            void regenerate;
            const finalUi = snapshot.selectors['button[aria-label="Regenerate response"]'];
            if (!finalUi || finalUi.visibleCount === 0) {
                observations.push({
                    code: "REGENERATE_SELECTOR_NOT_PRESENT",
                    message: "No visible Regenerate response control was captured."
                });
            }
        }

        const stopSelector = snapshot.selectors['button[aria-label="Stop"]'];
        const stopVisible = !!stopSelector && stopSelector.visibleCount > 0;
        if (
            !stopVisible &&
            [
                "GENERATING",
                "WAITING_FOR_RESPONSE",
                "WAITING_FOR_STABLE_RESPONSE"
            ].includes(snapshot.runner.stateName)
        ) {
            observations.push({
                code: "NO_STOP_BUT_RUNNER_STILL_WAITING",
                message: "No visible Stop control exists while the runner is still in a response-waiting state."
            });
        }

        return observations;
    }

    function createDiagnosticSnapshot() {
        const captureErrors = [];
        const publicApi = window.__sequenceRunner;
        const turns = diagnosticSafeCapture(
            captureErrors,
            "turn-inventory",
            function () {
                return getTurns().map(function (turn, index) {
                    return diagnosticTurnSummary(turn, index, captureErrors);
                });
            },
            []
        );
        const trackedTurn = diagnosticSafeCapture(
            captureErrors,
            "tracked-turn-resolution",
            function () {
                return currentCycle?.turnKey
                    ? getTurnByKey(currentCycle.turnKey)
                    : null;
            },
            null
        );
        const selectorResults = {};

        DIAGNOSTIC_SELECTORS.forEach(function (selector) {
            selectorResults[selector] = diagnosticQuery(
                selector,
                captureErrors,
                document
            );
        });

        const composerCandidates = diagnosticSafeCapture(
            captureErrors,
            "composer-candidates",
            function () {
                const nodes = [
                    ...document.querySelectorAll(SELECTORS.composer),
                    ...document.querySelectorAll("#prompt-textarea")
                ];
                return [...new Set(nodes)].map(function (element) {
                    return diagnosticElementSummary(element);
                });
            },
            []
        );

        const snapshot = {
            diagnosticSchemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
            generatedAt: new Date().toISOString(),
            privacy: {
                includesVisibleConversationAndDom: true,
                intentionallyExcluded: [
                    "cookies",
                    "authentication tokens",
                    "authorization headers",
                    "localStorage",
                    "sessionStorage",
                    "IndexedDB contents",
                    "saved passwords",
                    "network request/response bodies",
                    "browser history outside the current page",
                    "unrelated extension data"
                ]
            },
            runner: {
                version: VERSION,
                stateName: state,
                stopped,
                sendLocked,
                immediateSendLocked,
                pendingAutoSendLocked,
                runStarted,
                taskMode: selectedTaskMode,
                skipFirstMessage:
                    selectedSkipFirstMessage,
                workStyle: selectedWorkStyle,
                decisionMode: selectedDecisionMode,
                longWaitWake: {
                    afterMinutes:
                        selectedWakeAfterMinutes,
                    message:
                        selectedWakeMessage
                },
                currentCycle: diagnosticCycleSnapshot(currentCycle),
                completedResponseCount,
                continuationCount,
                sentPromptCount: cycleSeq,
                injectionSentCount,
                queuedIntermediateMessageCount: injectionQueue.length,
                queuedIntermediateMessages: diagnosticQueuedMessages(),
                pendingAutoSend: diagnosticPendingAutoSend(),
                handoffInProgress,
                handoffCount,
                stepLimit: {
                    stopAfterCompletedResponses,
                    mode: stopLimitMode
                },
                lastStatusMessage,
                lastStatusColor,
                publicState: diagnosticSafeCapture(
                    captureErrors,
                    "public-get-state",
                    function () {
                        return publicApi?.getState?.() || null;
                    },
                    null
                ),
                metrics: diagnosticSafeCapture(
                    captureErrors,
                    "public-get-metrics",
                    function () {
                        return publicApi?.getMetrics?.() || null;
                    },
                    null
                ),
                log: diagnosticSafeCapture(
                    captureErrors,
                    "public-get-log",
                    function () {
                        return publicApi?.getLog?.() || [...log];
                    },
                    [...log]
                )
            },
            page: {
                url: location.href,
                pathname: location.pathname,
                title: document.title,
                readyState: document.readyState,
                visibilityState: document.visibilityState,
                userAgent: navigator.userAgent,
                language: navigator.language,
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight,
                    devicePixelRatio: window.devicePixelRatio
                },
                fullPageHtml: diagnosticSafeCapture(
                    captureErrors,
                    "full-page-html",
                    function () {
                        return document.documentElement.outerHTML;
                    },
                    null
                )
            },
            selectors: selectorResults,
            currentTurn: diagnosticDeepTurn(trackedTurn, captureErrors),
            turns,
            controls: diagnosticControlInventory(document, captureErrors),
            composer: {
                candidates: composerCandidates,
                selected: diagnosticSafeCapture(
                    captureErrors,
                    "selected-composer",
                    function () {
                        return diagnosticElementSummary(getComposer());
                    },
                    null
                ),
                sendButton: diagnosticSafeCapture(
                    captureErrors,
                    "send-button",
                    function () {
                        return diagnosticElementSummary(getSendButton());
                    },
                    null
                ),
                stopButton: diagnosticSafeCapture(
                    captureErrors,
                    "stop-button",
                    function () {
                        return diagnosticElementSummary(getStopButton());
                    },
                    null
                )
            },
            diagnosis: {
                observations: []
            },
            captureErrors
        };

        snapshot.diagnosis.observations = diagnosticSafeCapture(
            captureErrors,
            "diagnostic-hypotheses",
            function () {
                return diagnosticHypotheses(snapshot);
            },
            []
        );

        return snapshot;
    }

    function downloadDiagnosticSnapshot() {
        const snapshot = createDiagnosticSnapshot();
        const json = JSON.stringify(snapshot, null, 2);
        const blob = new Blob([json], {
            type: "application/json;charset=utf-8"
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const timestamp = snapshot.generatedAt.replace(/[:.]/g, "-");

        link.href = url;
        link.download = "sequence-runner-diagnostic-" + timestamp + ".json";
        link.click();

        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 0);

        return snapshot;
    }

    function setupPanelInteractions() {
        const header = panel.querySelector(
            '[data-role="header"]'
        );

        const minimizeButton = panel.querySelector(
            '[data-action="minimize"]'
        );

        const taskModeSelect = panel.querySelector(
            '[data-input="task-mode"]'
        );

        const taskTextArea = panel.querySelector(
            '[data-input="task-text"]'
        );

        const workStyleSelect = panel.querySelector(
            '[data-input="work-style"]'
        );

        const decisionModeSelect = panel.querySelector(
            '[data-input="decision-mode"]'
        );

        const wakeAfterMinutesSelect = panel.querySelector(
            '[data-input="wake-after-minutes"]'
        );

        const wakeMessagePresetSelect = panel.querySelector(
            '[data-input="wake-message-preset"]'
        );

        const wakeMessageArea = panel.querySelector(
            '[data-input="wake-message"]'
        );

        const syncWakePresetFromMessage = function () {
            if (!wakeMessagePresetSelect) {
                return;
            }

            wakeMessagePresetSelect.value =
                getWakeMessagePreset(
                    wakeMessageArea?.value || ""
                );
        };

        wakeMessagePresetSelect?.addEventListener(
            "change",
            function () {
                if (!wakeMessageArea) {
                    return;
                }

                if (
                    wakeMessagePresetSelect.value ===
                    "supportive"
                ) {
                    wakeMessageArea.value =
                        CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;
                } else if (
                    wakeMessagePresetSelect.value ===
                    "short"
                ) {
                    wakeMessageArea.value =
                        CONFIG.LONG_WAIT_WAKE_SHORT_MESSAGE;
                }
            }
        );

        wakeMessageArea?.addEventListener(
            "input",
            syncWakePresetFromMessage
        );

        const syncStartModeControls = function () {
            const isNewTask =
                taskModeSelect?.value === "new";

            if (taskTextArea) {
                taskTextArea.style.display =
                    isNewTask ? "" : "none";
            }
        };

        taskModeSelect?.addEventListener(
            "change",
            syncStartModeControls
        );

        syncStartModeControls();

        panel.querySelector(
            '[data-action="start-run"]'
        )?.addEventListener(
            "click",
            function () {
                const startMode =
                    taskModeSelect?.value || "existing";

                beginRun(
                    startMode === "new"
                        ? "new"
                        : "existing",
                    taskTextArea?.value || "",
                    workStyleSelect?.value || "steady",
                    decisionModeSelect?.value || "autonomous",
                    startMode === "existing-ready",
                    wakeAfterMinutesSelect?.value,
                    wakeMessageArea?.value
                ).catch(function (err) {
                    updateStatus(
                        "🔴 " + err.message,
                        "#b91c1c"
                    );
                });
            }
        );

        panel.querySelector(
            '[data-action="queue-injection-now"]'
        )?.addEventListener(
            "click",
            function () {
                const input = panel.querySelector(
                    '[data-input="injection-text"]'
                );

                try {
                    queueInjection(
                        input?.value || "",
                        0
                    );

                    if (input) {
                        input.value = "";
                    }

                    updateStatus(
                        "📝 הודעת ביניים תישלח בגבול הבטוח הקרוב.",
                        "#7c3aed"
                    );
                } catch (err) {
                    updateStatus(
                        "🔴 " + err.message,
                        "#b91c1c"
                    );
                }
            }
        );

        panel.querySelector(
            '[data-action="send-injection-immediately"]'
        )?.addEventListener(
            "click",
            async function () {
                const input = panel.querySelector(
                    '[data-input="injection-text"]'
                );

                try {
                    await sendImmediateInjection(
                        input?.value || ""
                    );

                    if (input) {
                        input.value = "";
                    }

                    updateStatus(
                        "⚡ הודעת הביניים נשלחה מיד.",
                        "#b45309"
                    );
                } catch (err) {
                    updateStatus(
                        "🔴 " + err.message,
                        "#b91c1c"
                    );
                }
            }
        );

        panel.querySelector(
            '[data-action="resume-run"]'
        )?.addEventListener(
            "click",
            function () {
                resumePendingAutoSend(
                    true
                ).catch(function (err) {
                    updateStatus(
                        "🔴 " + err.message,
                        "#b91c1c"
                    );
                });
            }
        );

        panel.querySelector(
            '[data-action="queue-injection-after"]'
        )?.addEventListener(
            "click",
            function () {
                const textInput = panel.querySelector(
                    '[data-input="injection-text"]'
                );

                const afterInput = panel.querySelector(
                    '[data-input="injection-after"]'
                );

                const after =
                    parsePositiveInteger(
                        afterInput?.value
                    );

                if (after == null) {
                    updateStatus(
                        "⚠️ יש להזין מספר תגובות חיובי.",
                        "#b45309"
                    );
                    return;
                }

                try {
                    queueInjection(
                        textInput?.value || "",
                        after
                    );

                    if (textInput) {
                        textInput.value = "";
                    }

                    if (afterInput) {
                        afterInput.value = "";
                    }

                    updateStatus(
                        "📝 הודעת ביניים תוזמנה לעוד " +
                            after +
                            " תגובות.",
                        "#7c3aed"
                    );
                } catch (err) {
                    updateStatus(
                        "🔴 " + err.message,
                        "#b91c1c"
                    );
                }
            }
        );

        panel.querySelector(
            '[data-action="toggle-injection-manager"]'
        )?.addEventListener(
            "click",
            function () {
                if (!injectionManagerDiv) {
                    return;
                }

                const opening =
                    injectionManagerDiv.style.display ===
                    "none";

                injectionManagerDiv.style.display =
                    opening ? "" : "none";

                if (opening) {
                    renderInjectionManager();
                }
            }
        );

        injectionListDiv?.addEventListener(
            "click",
            function (event) {
                const button = event.target.closest(
                    "button[data-action]"
                );

                if (!button || button.disabled) {
                    return;
                }

                const card = button.closest(
                    "[data-injection-id]"
                );

                const id = Number(
                    card?.getAttribute(
                        "data-injection-id"
                    )
                );

                if (!Number.isInteger(id)) {
                    return;
                }

                const action =
                    button.getAttribute(
                        "data-action"
                    );

                try {
                    if (
                        action ===
                        "update-injection"
                    ) {
                        const textInput =
                            card.querySelector(
                                '[data-field="text"]'
                            );

                        const afterInput =
                            card.querySelector(
                                '[data-field="after"]'
                            );

                        updateQueuedInjection(
                            id,
                            textInput?.value || "",
                            afterInput?.value
                        );

                        updateStatus(
                            "📝 הודעת הביניים עודכנה.",
                            "#7c3aed"
                        );
                        return;
                    }

                    if (
                        action ===
                        "delete-injection"
                    ) {
                        deleteQueuedInjection(id);

                        updateStatus(
                            "🗑️ הודעת הביניים נמחקה.",
                            "#7f1d1d"
                        );
                        return;
                    }

                    if (
                        action ===
                        "move-injection-up"
                    ) {
                        moveQueuedInjection(
                            id,
                            "up"
                        );
                        return;
                    }

                    if (
                        action ===
                        "move-injection-down"
                    ) {
                        moveQueuedInjection(
                            id,
                            "down"
                        );
                    }
                } catch (err) {
                    updateStatus(
                        "🔴 " + err.message,
                        "#b91c1c"
                    );
                }
            }
        );

        panel.querySelector(
            '[data-action="clear-injections"]'
        )?.addEventListener(
            "click",
            clearQueuedInjections
        );

        minimizeButton?.addEventListener(
            "click",
            function (event) {
                event.stopPropagation();

                const minimized =
                    panelBody.style.display !== "none";

                if (minimized) {
                    savePanelSize();
                    panelBody.style.display = "none";
                    panel.style.height = "auto";
                    panel.style.minHeight = "0";

                    if (resizeHandle) {
                        resizeHandle.style.display =
                            "none";
                    }
                } else {
                    panelBody.style.display = "";
                    panel.style.minHeight =
                        PANEL_MIN_SIZE.height + "px";

                    restorePanelSize();

                    if (resizeHandle) {
                        resizeHandle.style.display =
                            "flex";
                    }

                    keepPanelInViewport();
                }

                minimizeButton.textContent =
                    minimized ? "+" : "−";

                minimizeButton.title =
                    minimized ? "פתח" : "מזער";

                try {
                    localStorage.setItem(
                        PANEL_STORAGE_KEYS.minimized,
                        minimized ? "1" : "0"
                    );
                } catch (_) {}
            }
        );

        panel.querySelector(
            '[data-action="stop"]'
        )?.addEventListener(
            "click",
            function () {
                stop("manual", false);
            }
        );

        restartButton?.addEventListener(
            "click",
            function () {
                restartRunner().catch(
                    function (err) {
                        updateStatus(
                            "🔴 " + err.message,
                            "#b91c1c"
                        );
                    }
                );
            }
        );

        panel.querySelector(
            '[data-action="set-absolute-limit"]'
        )?.addEventListener(
            "click",
            function () {
                const input = panel.querySelector(
                    '[data-input="absolute-limit"]'
                );

                const value = parsePositiveInteger(
                    input?.value
                );

                if (value == null) {
                    updateStatus(
                        "⚠️ יש להזין מספר שלם וחיובי.",
                        "#b45309"
                    );
                    return;
                }

                applyStepLimit(value, "absolute");
            }
        );

        panel.querySelector(
            '[data-action="set-relative-limit"]'
        )?.addEventListener(
            "click",
            function () {
                const input = panel.querySelector(
                    '[data-input="relative-limit"]'
                );

                const value = parsePositiveInteger(
                    input?.value
                );

                if (value == null) {
                    updateStatus(
                        "⚠️ יש להזין מספר שלם וחיובי.",
                        "#b45309"
                    );
                    return;
                }

                applyStepLimit(
                    completedResponseCount + value,
                    "relative"
                );
            }
        );

        panel.querySelector(
            '[data-action="clear-limit"]'
        )?.addEventListener(
            "click",
            clearStepLimit
        );

        let resize = null;

        resizeHandle?.addEventListener(
            "pointerdown",
            function (event) {
                if (event.button !== 0) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                const rect =
                    panel.getBoundingClientRect();

                resize = {
                    pointerId: event.pointerId,
                    right: rect.right,
                    top: rect.top
                };

                resizeHandle.setPointerCapture(
                    event.pointerId
                );
            }
        );

        resizeHandle?.addEventListener(
            "pointermove",
            function (event) {
                if (
                    !resize ||
                    resize.pointerId !==
                        event.pointerId
                ) {
                    return;
                }

                const limits =
                    getPanelSizeLimits();

                const left = Math.max(
                    0,
                    Math.min(
                        event.clientX,
                        resize.right -
                            PANEL_MIN_SIZE.width
                    )
                );

                const width = Math.max(
                    PANEL_MIN_SIZE.width,
                    Math.min(
                        resize.right - left,
                        limits.maxWidth
                    )
                );

                const height = Math.max(
                    PANEL_MIN_SIZE.height,
                    Math.min(
                        event.clientY -
                            resize.top,
                        Math.min(
                            limits.maxHeight,
                            window.innerHeight -
                                resize.top -
                                8
                        )
                    )
                );

                panel.style.left =
                    resize.right - width + "px";

                panel.style.right = "auto";
                panel.style.width = width + "px";
                panel.style.height = height + "px";
            }
        );

        const finishResize = function (event) {
            if (
                !resize ||
                resize.pointerId !==
                    event.pointerId
            ) {
                return;
            }

            savePanelSize();
            keepPanelInViewport();
            resize = null;
        };

        resizeHandle?.addEventListener(
            "pointerup",
            finishResize
        );

        resizeHandle?.addEventListener(
            "pointercancel",
            finishResize
        );

        window.addEventListener(
            "resize",
            function () {
                if (
                    panelBody.style.display !== "none"
                ) {
                    const rect =
                        panel.getBoundingClientRect();

                    const normalized =
                        normalizePanelSize(
                            rect.width,
                            rect.height
                        );

                    panel.style.width =
                        normalized.width + "px";

                    panel.style.height =
                        normalized.height + "px";
                }

                keepPanelInViewport();
            }
        );

        if (!header) {
            return;
        }

        let drag = null;

        header.addEventListener(
            "pointerdown",
            function (event) {
                if (
                    event.button !== 0 ||
                    event.target.closest("button,input,textarea,select")
                ) {
                    return;
                }

                const rect =
                    panel.getBoundingClientRect();

                drag = {
                    pointerId: event.pointerId,
                    offsetX:
                        event.clientX - rect.left,
                    offsetY:
                        event.clientY - rect.top
                };

                header.setPointerCapture(
                    event.pointerId
                );
            }
        );

        header.addEventListener(
            "pointermove",
            function (event) {
                if (
                    !drag ||
                    drag.pointerId !== event.pointerId
                ) {
                    return;
                }

                const maxLeft = Math.max(
                    0,
                    window.innerWidth -
                        panel.offsetWidth
                );

                const maxTop = Math.max(
                    0,
                    window.innerHeight - 40
                );

                const left = Math.max(
                    0,
                    Math.min(
                        event.clientX - drag.offsetX,
                        maxLeft
                    )
                );

                const top = Math.max(
                    0,
                    Math.min(
                        event.clientY - drag.offsetY,
                        maxTop
                    )
                );

                panel.style.left = left + "px";
                panel.style.top = top + "px";
                panel.style.right = "auto";
            }
        );

        const finishDrag = function (event) {
            if (
                !drag ||
                drag.pointerId !== event.pointerId
            ) {
                return;
            }

            try {
                const rect =
                    panel.getBoundingClientRect();

                localStorage.setItem(
                    PANEL_STORAGE_KEYS.position,
                    JSON.stringify({
                        left: rect.left,
                        top: rect.top
                    })
                );
            } catch (_) {}

            drag = null;
            keepPanelInViewport();
        };

        header.addEventListener(
            "pointerup",
            finishDrag
        );

        header.addEventListener(
            "pointercancel",
            finishDrag
        );
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
            const error = new Error(
                "Composer is not empty; refusing to overwrite existing text."
            );
            error.code = "COMPOSER_NOT_EMPTY";
            throw error;
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

        if (uiTimer) {
            clearInterval(uiTimer);
        }

        watchdog = null;
        uiTimer = null;
        evaluateScheduled = false;
    }

    function resetPanelForNewRun() {
        const taskMode = panel.querySelector(
            '[data-input="task-mode"]'
        );

        const taskText = panel.querySelector(
            '[data-input="task-text"]'
        );

        const workStyle = panel.querySelector(
            '[data-input="work-style"]'
        );

        const decisionMode = panel.querySelector(
            '[data-input="decision-mode"]'
        );

        const wakeAfterMinutes = panel.querySelector(
            '[data-input="wake-after-minutes"]'
        );

        const wakeMessagePreset = panel.querySelector(
            '[data-input="wake-message-preset"]'
        );

        const wakeMessage = panel.querySelector(
            '[data-input="wake-message"]'
        );

        const inputs = [
            '[data-input="injection-text"]',
            '[data-input="injection-after"]',
            '[data-input="absolute-limit"]',
            '[data-input="relative-limit"]'
        ];

        if (taskMode) {
            taskMode.value = "existing";
        }

        if (workStyle) {
            workStyle.value = "steady";
        }

        if (decisionMode) {
            decisionMode.value = "autonomous";
        }

        if (wakeAfterMinutes) {
            wakeAfterMinutes.value = String(
                CONFIG.LONG_WAIT_WAKE_DEFAULT_MINUTES
            );
        }

        if (wakeMessagePreset) {
            wakeMessagePreset.value = "supportive";
        }

        if (wakeMessage) {
            wakeMessage.value =
                CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;
        }

        if (taskText) {
            taskText.value = "";
            taskText.style.display = "none";
        }

        inputs.forEach(function (selector) {
            const input =
                panel.querySelector(selector);

            if (input) {
                input.value = "";
            }
        });

        if (injectionManagerDiv) {
            injectionManagerDiv.style.display =
                "none";
        }
    }

    async function restartRunner() {
        if (!stopped) {
            throw new Error(
                "Stop the current run before starting a new one."
            );
        }

        cleanup();

        processedTurnKeys.clear();
        injectionQueue.length = 0;
        log.length = 0;

        state = "INIT";
        stopped = false;
        evaluateScheduled = false;
        sendLocked = false;
        cycleSeq = 0;
        continuationCount = 0;
        completedResponseCount = 0;
        stopAfterCompletedResponses = null;
        stopLimitMode = null;
        currentCycle = null;
        runStarted = false;
        selectedTaskMode = "existing";
        selectedTaskText = "";
        selectedSkipFirstMessage = false;
        selectedWorkStyle = "steady";
        selectedDecisionMode = "autonomous";
        selectedWakeAfterMinutes =
            CONFIG.LONG_WAIT_WAKE_DEFAULT_MINUTES;
        selectedWakeMessage =
            CONFIG.LONG_WAIT_WAKE_DEFAULT_MESSAGE;
        runnerStartedAt = null;
        injectionSeq = 0;
        injectionSentCount = 0;
        immediateSendLocked = false;
        pendingAutoSend = null;
        pendingAutoSendLocked = false;
        handoffInProgress = false;
        handoffCount = 0;
        lastStatusMessage = null;
        lastStatusColor = null;

        resetPanelForNewRun();
        renderInjectionManager();
        renderPanel();

        record("runner-restarted");

        await initialize();
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
            updateStatus(
                "✅ התהליך הסתיים לפי תנאי הסיום.",
                "#15803d"
            );
        } else if (stopReason === "step-limit") {
            updateStatus(
                "⏹ נעצר בגבול שהוגדר אחרי " +
                    completedResponseCount +
                    " תגובות Runner.",
                "#7c3aed"
            );
        } else if (stopReason === "manual") {
            updateStatus(
                "🛑 נעצר ידנית.",
                "#b91c1c"
            );
        } else if (stopReason === "replaced") {
            panel.remove();
            return;
        }

        renderPanel();
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
        renderPanel();
    }

    function findNewTurn(beforeKeys) {
        const candidates = getTurns().filter(
            function (turn) {
                return !beforeKeys.has(
                    getTurnKey(turn)
                );
            }
        );

        return candidates.at(-1) || null;
    }

    function resolveCycleTurn(cycle) {
        const current =
            getTurnByKey(cycle.turnKey);

        const latestPostSendTurn =
            findNewTurn(
                cycle.beforeKeys
            );

        const resolved =
            latestPostSendTurn || current;

        if (!resolved) {
            return null;
        }

        const resolvedKey =
            getTurnKey(resolved);

        if (
            resolvedKey &&
            resolvedKey !== cycle.turnKey
        ) {
            record("turn-rebound", {
                id: cycle.id,
                from: cycle.turnKey,
                to: resolvedKey,
                reason: "latest-post-send-turn"
            });

            cycle.turnKey = resolvedKey;
        }

        return resolved;
    }

    function getComposerText() {
        const composer = getComposer();

        if (!composer) {
            return "";
        }

        return normalizeText(
            composer.innerText ||
            composer.textContent ||
            composer.value ||
            ""
        );
    }

    function normalizeTurnKeySnapshot(value) {
        if (value instanceof Set) {
            return [...value].filter(Boolean);
        }

        if (Array.isArray(value)) {
            return value.filter(Boolean);
        }

        return getTurns()
            .map(getTurnKey)
            .filter(Boolean);
    }

    function adoptExternalTurnForContinuation(
        baselineTurnKeys,
        trigger,
        pending
    ) {
        const baseline =
            normalizeTurnKeySnapshot(
                baselineTurnKeys
            );

        if (!baseline.length) {
            return false;
        }

        const turn = findNewTurn(
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
            "continuation-superseded-by-external-turn",
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

    function deferAutoSend(
        prompt,
        label,
        reason,
        baselineTurnKeys
    ) {
        pendingAutoSend = {
            prompt,
            label,
            reason,
            baselineTurnKeys:
                normalizeTurnKeySnapshot(
                    baselineTurnKeys
                ),
            deferredAt: Date.now()
        };

        sendLocked = false;

        record("auto-send-deferred", {
            label,
            reason
        });

        setState(
            reason === "composer-occupied"
                ? "WAITING_FOR_COMPOSER"
                : "WAITING_FOR_EXTERNAL_ACTIVITY",
            reason === "composer-occupied"
                ? "⏸ יש טקסט בתיבת ChatGPT. האוטומציה תמשיך אחרי שהוא יישלח או ינוקה."
                : "⏸ ממתין לפעילות ChatGPT הנוכחית לפני המשך האוטומציה.",
            "#b45309"
        );

        renderPanel();
    }

    async function resumePendingAutoSend(
        manual
    ) {
        if (
            stopped ||
            !pendingAutoSend ||
            pendingAutoSendLocked ||
            currentCycle ||
            sendLocked ||
            immediateSendLocked
        ) {
            return false;
        }

        if (
            pendingAutoSend.label === "continue" &&
            adoptExternalTurnForContinuation(
                pendingAutoSend.baselineTurnKeys,
                "pending-resume",
                pendingAutoSend
            )
        ) {
            return true;
        }

        if (getComposerText()) {
            setState(
                "WAITING_FOR_COMPOSER",
                manual
                    ? "⚠️ עדיין יש טקסט בתיבת ChatGPT. שלח או נקה אותו ואז נסה שוב."
                    : "⏸ יש טקסט בתיבת ChatGPT. האוטומציה תמשיך אחרי שהוא יישלח או ינוקה.",
                "#b45309"
            );
            return false;
        }

        if (getStopButton()) {
            setState(
                "WAITING_FOR_EXTERNAL_ACTIVITY",
                manual
                    ? "⏳ ChatGPT עדיין מגיב. ההמשך יישלח אוטומטית כשהתגובה תסתיים."
                    : "⏸ ממתין לפעילות ChatGPT הנוכחית לפני המשך האוטומציה.",
                "#b45309"
            );
            return false;
        }

        pendingAutoSendLocked = true;
        const pending = pendingAutoSend;
        pendingAutoSend = null;
        renderPanel();

        try {
            const sent = await sendPrompt(
                pending.prompt,
                pending.label,
                {
                    deferWhenBlocked: true,
                    deferBaselineTurnKeys:
                        pending.baselineTurnKeys
                }
            );

            return !!sent;
        } finally {
            pendingAutoSendLocked = false;
            renderPanel();
        }
    }

    async function sendImmediateInjection(text, options) {
        const message = normalizeText(text);
        const opts = options || {};
        const cycleLabel = opts.label || "injection";
        const source = opts.source || "user";
        const countAsInjection =
            opts.countAsInjection !== false;
        const sentStatusMessage =
            opts.sentStatusMessage ||
            "⚡ הודעת ביניים נשלחה מיד; עוקב אחר התגובה החדשה...";
        const sentStatusColor =
            opts.sentStatusColor || "#b45309";

        if (!message) {
            throw new Error(
                "Intermediate message cannot be empty."
            );
        }

        if (stopped) {
            throw new Error(
                "Cannot send a message after the runner has stopped."
            );
        }

        if (!runStarted) {
            throw new Error(
                "Start the runner before sending an immediate intermediate message."
            );
        }

        if (immediateSendLocked) {
            throw new Error(
                "An immediate message is already being sent."
            );
        }

        const composer = getComposer();

        if (!composer) {
            throw new Error("Composer not found.");
        }

        if (getComposerText()) {
            throw new Error(
                "Composer is not empty; refusing to overwrite existing text."
            );
        }

        immediateSendLocked = true;
        renderPanel();

        try {
            const beforeKeys = new Set(
                getTurns().map(getTurnKey)
            );

            await setComposerText(message);

            const sendButton = await waitUntil(
                function () {
                    const button =
                        getSendButton();

                    return button &&
                        !button.disabled
                        ? button
                        : null;
                },
                3000,
                50
            );

            if (!sendButton) {
                throw new Error(
                    "Send button did not become available while ChatGPT was responding."
                );
            }

            const supersededCycle =
                currentCycle;

            if (supersededCycle) {
                supersededCycle.processed =
                    true;

                record(
                    "cycle-superseded-by-immediate-message",
                    {
                        id:
                            supersededCycle.id,
                        label:
                            supersededCycle.label,
                        turnKey:
                            supersededCycle.turnKey
                    }
                );
            }

            if (pendingAutoSend) {
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

            sendLocked = true;

            const id = ++cycleSeq;

            currentCycle = {
                id,
                label: cycleLabel,
                prompt: message,
                beforeKeys,
                sentAt: Date.now(),
                turnKey: null,
                sawStop:
                    !!getStopButton(),
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

            record("send", {
                id,
                label: cycleLabel,
                beforeTurnCount:
                    beforeKeys.size,
                immediate: true,
                source
            });

            sendButton.click();

            if (countAsInjection) {
                injectionSentCount++;
            }

            setState(
                "WAITING_FOR_TURN",
                sentStatusMessage,
                sentStatusColor
            );

            renderPanel();
            scheduleEvaluate();
            return true;
        } finally {
            immediateSendLocked = false;
            renderPanel();
        }
    }

    async function sendPrompt(
        prompt,
        label,
        options
    ) {
        if (stopped || sendLocked) {
            return false;
        }

        const opts = options || {};
        const deferWhenBlocked =
            opts.deferWhenBlocked !== false;
        const deferBaselineTurnKeys =
            opts.deferBaselineTurnKeys
                ? normalizeTurnKeySnapshot(
                    opts.deferBaselineTurnKeys
                )
                : null;

        if (
            label === "continue" &&
            deferBaselineTurnKeys &&
            adoptExternalTurnForContinuation(
                deferBaselineTurnKeys,
                "before-send",
                null
            )
        ) {
            return false;
        }

        if (getStopButton()) {
            if (deferWhenBlocked) {
                deferAutoSend(
                    prompt,
                    label,
                    "chatgpt-busy",
                    deferBaselineTurnKeys
                );
                return false;
            }

            throw new Error(
                "ChatGPT is already generating a response."
            );
        }

        if (getComposerText()) {
            if (deferWhenBlocked) {
                deferAutoSend(
                    prompt,
                    label,
                    "composer-occupied",
                    deferBaselineTurnKeys
                );
                return false;
            }

            throw new Error(
                "Composer is not empty; refusing to overwrite existing text."
            );
        }

        sendLocked = true;

        setState(
            "SENDING",
            label === "first"
                ? "➡️ Sending first prompt..."
                : label === "injection"
                    ? "📝 Sending intermediate message..."
                    : label === "handoff"
                        ? "🔁 Sending handoff prompt in the new chat..."
                        : "➡️ Sending continuation #" + (continuationCount + 1) + "...",
            label === "injection"
                ? "#7c3aed"
                : label === "handoff"
                    ? "#0369a1"
                    : "#0056b3"
        );

        const beforeKeys = new Set(
            getTurns().map(getTurnKey)
        );

        try {
            await setComposerText(prompt);
        } catch (err) {
            if (
                deferWhenBlocked &&
                err?.code ===
                    "COMPOSER_NOT_EMPTY"
            ) {
                deferAutoSend(
                    prompt,
                    label,
                    "composer-occupied",
                    deferBaselineTurnKeys
                );
                return false;
            }

            sendLocked = false;
            throw err;
        }

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

        record("send", {
            id,
            label,
            beforeTurnCount: beforeKeys.size
        });

        sendButton.click();

        if (label === "injection") {
            injectionSentCount++;
        }

        setState(
            "WAITING_FOR_TURN",
            "⏳ Waiting for ChatGPT...",
            "#d39e00"
        );

        renderPanel();
        scheduleEvaluate();
        return true;
    }

    async function performChatHandoff(
        nextChatPrompt
    ) {
        if (stopped) {
            return false;
        }

        if (handoffInProgress) {
            throw new Error(
                "A chat handoff is already in progress."
            );
        }

        handoffInProgress = true;
        renderPanel();

        const outgoingPrompt =
            buildHandoffPrompt(
                nextChatPrompt
            );

        try {
            setState(
                "OPENING_NEW_CHAT",
                "🔄 פותח צ'אט חדש ומעביר אליו את המשימה...",
                "#0369a1"
            );

            record("handoff-started", {
                fromUrl: location.href,
                promptLength:
                    nextChatPrompt.length
            });

            const navigation =
                await openFreshChatForHandoff();

            record(
                "handoff-navigation-complete",
                {
                    kind:
                        navigation.kind,
                    projectName:
                        navigation.project?.name ||
                        null,
                    fromUrl:
                        navigation.oldUrl,
                    toUrl:
                        navigation.newUrl,
                    composerReused:
                        navigation.composerReused
                }
            );

            const sent =
                await sendPrompt(
                    outgoingPrompt,
                    "handoff",
                    {
                        deferWhenBlocked:
                            false
                    }
                );

            if (!sent) {
                throw new Error(
                    "The handoff prompt was not sent."
                );
            }

            handoffCount++;

            record("handoff-sent", {
                count: handoffCount,
                url: location.href
            });

            return true;
        } finally {
            handoffInProgress = false;
            renderPanel();
        }
    }

    function handleTerminalResponseWithoutAssistant(
        cycle,
        marker
    ) {
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

        record(
            "response-terminated-without-assistant",
            {
                id: cycle.id,
                turnKey: cycle.turnKey,
                marker,
                queuedIntermediateMessages:
                    injectionQueue.length
            }
        );

        const dueInjection =
            takeDueInjection();

        if (!dueInjection) {
            fail(
                "ChatGPT stopped the response before producing an assistant message. Automatic resend was not attempted."
            );
            return;
        }

        record(
            "terminal-response-recovered-by-injection",
            {
                id: cycle.id,
                injectionId: dueInjection.id,
                marker
            }
        );

        setState(
            "READY_TO_INJECT",
            "📝 התגובה נעצרה; שולח את הודעת הביניים הממתינה...",
            "#7c3aed"
        );

        const terminatedCycle = cycle;

        setTimeout(function () {
            if (
                stopped ||
                currentCycle !== terminatedCycle
            ) {
                return;
            }

            currentCycle = null;

            sendPrompt(
                dueInjection.text,
                "injection"
            ).catch(function (err) {
                fail(err.message, err);
            });
        }, CONFIG.CONTINUE_DELAY_MS);
    }

    function updateLongRunningWake(cycle, stopButton) {
        const now = Date.now();

        if (!stopButton) {
            if (
                cycle.activeGenerationStartedAt != null &&
                cycle.wakeState !== "sent" &&
                cycle.wakeState !== "sending"
            ) {
                if (cycle.wakeState === "deferred") {
                    record("long-wait-wake-cancelled", {
                        id: cycle.id,
                        turnKey: cycle.turnKey,
                        reason: "generation-ended-before-send"
                    });
                }

                cycle.activeGenerationStartedAt = null;
                cycle.wakeState = "idle";
                cycle.wakeThresholdReachedAt = null;
                cycle.wakeDeferredReason = null;
            }

            return false;
        }

        if (cycle.activeGenerationStartedAt == null) {
            cycle.activeGenerationStartedAt = now;

            record("generation-active-tracked", {
                id: cycle.id,
                turnKey: cycle.turnKey
            });

            return false;
        }

        const elapsedMs =
            now - cycle.activeGenerationStartedAt;

        if (
            elapsedMs <
            selectedWakeAfterMinutes * 60 * 1000
        ) {
            return false;
        }

        if (
            cycle.wakeState === "sent" ||
            cycle.wakeState === "sending" ||
            cycle.wakeState === "failed"
        ) {
            return cycle.wakeState === "sending";
        }

        if (!cycle.wakeThresholdReachedAt) {
            cycle.wakeThresholdReachedAt = now;

            record("long-wait-wake-threshold", {
                id: cycle.id,
                turnKey: cycle.turnKey,
                elapsedMs,
                afterMinutes:
                    selectedWakeAfterMinutes,
                message:
                    selectedWakeMessage
            });
        }

        const deferredReason =
            getComposerText()
                ? "composer-occupied"
                : null;

        if (deferredReason) {
            if (
                cycle.wakeState !== "deferred" ||
                cycle.wakeDeferredReason !== deferredReason
            ) {
                record("long-wait-wake-deferred", {
                    id: cycle.id,
                    turnKey: cycle.turnKey,
                    reason: deferredReason,
                    elapsedMs
                });
            }

            cycle.wakeState = "deferred";
            cycle.wakeDeferredReason = deferredReason;

            setState(
                "GENERATING",
                "⏰ עבר זמן הבדיקה שהוגדר (" +
                    formatWakeDelay(
                        selectedWakeAfterMinutes
                    ) +
                    "); יש טקסט בתיבת ההודעה ולכן ממתין רק כדי לא לדרוס אותו.",
                "#b45309"
            );

            return true;
        }

        cycle.wakeState = "sending";
        cycle.wakeDeferredReason = null;

        record("long-wait-wake-sending", {
            id: cycle.id,
            turnKey: cycle.turnKey,
            elapsedMs
        });

        sendImmediateInjection(
            selectedWakeMessage,
            {
                label: "wake",
                source: "long-wait-wake",
                countAsInjection: false,
                sentStatusMessage:
                    "⏰ נשלחה הודעת בדיקה אחרי " +
                    formatWakeDelay(
                        selectedWakeAfterMinutes
                    ) +
                    "; עוקב אחר התגובה החדשה...",
                sentStatusColor: "#b45309"
            }
        ).then(function () {
            cycle.wakeState = "sent";
            cycle.wakeSentAt = Date.now();

            record("long-wait-wake-sent", {
                id: cycle.id,
                turnKey: cycle.turnKey,
                elapsedMs
            });
        }).catch(function (err) {
            cycle.wakeState = "failed";

            record("long-wait-wake-failed", {
                id: cycle.id,
                turnKey: cycle.turnKey,
                elapsedMs,
                error: err?.message || String(err || "")
            });

            if (!stopped && currentCycle === cycle) {
                setState(
                    "GENERATING",
                    "⚠️ לא ניתן היה לשלוח את הודעת ההתעוררות בבטחה; ממשיך להמתין לתגובה.",
                    "#b45309"
                );
            }
        });

        return true;
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
        completedResponseCount++;
        renderPanel();

        const responseDone =
            isDone(text);

        const handoff =
            parseHandoff(text);

        record("response-complete", {
            id: cycle.id,
            turnKey: cycle.turnKey,
            textLength: text.length,
            done: responseDone,
            handoffRequested:
                handoff.requested,
            handoffValid:
                handoff.requested &&
                !handoff.error
        });

        if (shouldStopForStepLimit()) {
            stop("step-limit", false);
            return;
        }

        if (
            handoff.requested &&
            handoff.error
        ) {
            fail(
                "Invalid new-chat handoff response: " +
                    handoff.error
            );
            return;
        }

        const dueInjection =
            takeDueInjection();

        if (dueInjection) {
            if (responseDone) {
                record(
                    "completion-marker-deferred-for-injection",
                    {
                        injectionId:
                            dueInjection.id
                    }
                );
            }

            if (handoff.requested) {
                record(
                    "handoff-deferred-for-injection",
                    {
                        injectionId:
                            dueInjection.id
                    }
                );
            }

            setState(
                "READY_TO_INJECT",
                "📝 Intermediate message ready...",
                "#7c3aed"
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
                    dueInjection.text,
                    "injection"
                ).catch(function (err) {
                    fail(err.message, err);
                });
            }, CONFIG.CONTINUE_DELAY_MS);

            return;
        }

        if (handoff.requested) {
            setState(
                "READY_TO_HANDOFF",
                "🔁 התגובה ביקשה להמשיך בצ'אט חדש...",
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

                performChatHandoff(
                    handoff.nextChatPrompt
                ).catch(function (err) {
                    fail(
                        err.message,
                        err
                    );
                });
            }, CONFIG.CONTINUE_DELAY_MS);

            return;
        }

        if (responseDone) {
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
        const continuationBaselineTurnKeys =
            new Set(
                getTurns()
                    .map(getTurnKey)
                    .filter(Boolean)
            );

        setTimeout(function () {
            if (
                stopped ||
                currentCycle !== completedCycle
            ) {
                return;
            }

            const lateInjection =
                takeDueInjection();

            currentCycle = null;

            if (lateInjection) {
                sendPrompt(
                    lateInjection.text,
                    "injection"
                ).catch(function (err) {
                    fail(err.message, err);
                });

                return;
            }

            sendPrompt(
                CONFIG.REGULAR_PROMPT,
                "continue",
                {
                    deferBaselineTurnKeys:
                        continuationBaselineTurnKeys
                }
            ).catch(function (err) {
                fail(err.message, err);
            });
        }, CONFIG.CONTINUE_DELAY_MS);
    }

    function evaluate() {
        evaluateScheduled = false;

        if (
            stopped ||
            immediateSendLocked ||
            !currentCycle
        ) {
            return;
        }

        const cycle = currentCycle;

        if (cycle.processed) {
            return;
        }

        const waitingStatus = function (baseMessage) {
            return getLongWaitStatus(
                baseMessage,
                cycle.deliveryRetryClickedAt || cycle.sentAt,
                cycle,
                "response"
            );
        };

        const stopButton = getStopButton();

        if (stopButton) {
            cycle.sawStop = true;
        }

        const turn =
            resolveCycleTurn(cycle);

        if (!turn) {
            if (stopButton) {
                setState(
                    "GENERATING",
                    waitingStatus(
                        "✍️ ChatGPT is generating..."
                    ),
                    "#d39e00"
                );
            } else {
                setState(
                    "WAITING_FOR_TURN",
                    waitingStatus(
                        "⏳ Waiting for new turn..."
                    ),
                    "#d39e00"
                );
            }

            return;
        }

        if (!cycle.turnKey) {
            cycle.turnKey =
                getTurnKey(turn);

            record("new-turn", {
                id: cycle.id,
                turnKey: cycle.turnKey
            });
        }

        const deliveryFailure =
            getDeliveryFailure(turn);

        if (deliveryFailure) {
            recoverDeliveryFailure(
                cycle,
                deliveryFailure
            ).catch(function (err) {
                fail(err.message, err);
            });
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

        const text =
            getAssistantText(turn);

        const terminalMarker =
            !stopButton && !text
                ? getTerminalResponseMarker(turn)
                : null;

        if (terminalMarker) {
            handleTerminalResponseWithoutAssistant(
                cycle,
                terminalMarker
            );
            return;
        }

        if (
            !stopButton &&
            finalUiSeen &&
            text
        ) {
            if (text !== cycle.lastText) {
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

            const finalUiStableFor =
                Date.now() -
                cycle.lastTextChangedAt;

            if (
                finalUiStableFor <
                CONFIG.STABLE_MS
            ) {
                setState(
                    "WAITING_FOR_STABLE_RESPONSE",
                    "⏳ Final response UI detected; waiting for final text to settle...",
                    "#d39e00"
                );

                return;
            }

            record(
                "final-ui-detected",
                {
                    id: cycle.id,
                    turnKey:
                        cycle.turnKey,
                    textLength:
                        text.length,
                    stableFor:
                        finalUiStableFor
                }
            );

            setState(
                "EVALUATING",
                "🔎 Response complete; checking...",
                "#17a2b8"
            );

            completeCycle(
                cycle,
                text
            );

            return;
        }

        if (!text) {
            setState(
                stopButton
                    ? "GENERATING"
                    : "WAITING_FOR_RESPONSE",
                stopButton
                    ? waitingStatus(
                        "✍️ ChatGPT is generating..."
                    )
                    : waitingStatus(
                        finalUiSeen
                            ? "⏳ Final response UI detected; locating text..."
                            : "⏳ Waiting for assistant response..."
                    ),
                "#d39e00"
            );

            return;
        }

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
                waitingStatus("✍️ ChatGPT is generating..."),
                "#d39e00"
            );

            return;
        }

        if (!text) {
            setState(
                "WAITING_FOR_RESPONSE",
                waitingStatus("⏳ Waiting for assistant response..."),
                "#d39e00"
            );

            return;
        }

        const stableFor =
            Date.now() - cycle.lastTextChangedAt;

        if (stableFor < CONFIG.STABLE_MS) {
            setState(
                "WAITING_FOR_STABLE_RESPONSE",
                waitingStatus("⏳ Finalizing response..."),
                "#d39e00"
            );

            return;
        }

        if (
            !cycle.sawStop &&
            stableFor <
                CONFIG.FAST_RESPONSE_FALLBACK_MS
        ) {
            setState(
                "WAITING_FOR_STABLE_RESPONSE",
                waitingStatus("⏳ Confirming response completion..."),
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

        setTimeout(function () {
            evaluateScheduled = false;

            if (
                !currentCycle &&
                pendingAutoSend
            ) {
                resumePendingAutoSend(
                    false
                ).catch(function (err) {
                    fail(err.message, err);
                });
                return;
            }

            evaluate();
        }, 0);
    }

    async function beginRun(
        mode,
        taskText,
        workStyle,
        decisionMode,
        skipFirstMessage,
        wakeAfterMinutes,
        wakeMessage
    ) {
        if (stopped) {
            throw new Error(
                "The runner has already stopped."
            );
        }

        if (runStarted) {
            throw new Error(
                "The runner has already started."
            );
        }

        const style =
            normalizeWorkStyle(workStyle);

        const decisions =
            normalizeDecisionMode(decisionMode);

        const normalizedWakeAfterMinutes =
            normalizeWakeAfterMinutes(
                wakeAfterMinutes
            );

        const normalizedWakeMessage =
            normalizeWakeMessage(
                wakeMessage
            );

        const shouldSkipFirstMessage =
            mode !== "new" &&
            !!skipFirstMessage;

        const firstPrompt =
            shouldSkipFirstMessage
                ? buildCompactExistingReadyPrompt(
                      style,
                      decisions
                  )
                : buildFirstPrompt(
                      mode,
                      taskText,
                      style,
                      decisions
                  );

        selectedTaskMode =
            mode === "new" ? "new" : "existing";

        selectedTaskText =
            selectedTaskMode === "new"
                ? normalizeText(taskText)
                : "";

        selectedSkipFirstMessage =
            shouldSkipFirstMessage;

        selectedWorkStyle = style;
        selectedDecisionMode = decisions;
        selectedWakeAfterMinutes =
            normalizedWakeAfterMinutes;
        selectedWakeMessage =
            normalizedWakeMessage;

        runStarted = true;
        runnerStartedAt = Date.now();

        record("run-started", {
            taskMode: selectedTaskMode,
            skipFirstMessage:
                selectedSkipFirstMessage,
            workStyle: selectedWorkStyle,
            decisionMode: selectedDecisionMode,
            wakeAfterMinutes:
                selectedWakeAfterMinutes,
            wakeMessage:
                selectedWakeMessage,
            hasTaskText:
                !!selectedTaskText
        });

        renderPanel();

        if (getStopButton()) {
            const idleWait = {
                longWaitNoticeBucket: -1
            };

            const idleStartedAt = Date.now();

            setState(
                "WAITING_FOR_IDLE",
                "⏳ Waiting for current ChatGPT response to finish...",
                "#d39e00"
            );

            while (!stopped && getStopButton()) {
                updateStatus(
                    getLongWaitStatus(
                        "⏳ Waiting for current ChatGPT response to finish...",
                        idleStartedAt,
                        idleWait,
                        "initial-idle"
                    ),
                    "#d39e00"
                );

                await sleep(1000);
            }

            if (stopped) {
                return;
            }
        }

        try {
            await sendPrompt(
                firstPrompt,
                "first"
            );
        } catch (err) {
            fail(err.message, err);
        }
    }

    async function initialize() {
        updateStatus(
            "⚙️ בחר מצב התחלה ולחץ “התחל ריצה”.",
            "#0369a1"
        );

        record("initialized");

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

        uiTimer = setInterval(
            renderPanel,
            CONFIG.UI_REFRESH_MS
        );

        setState(
            "READY_TO_START",
            "⚙️ בחר מצב התחלה ולחץ “התחל ריצה”.",
            "#0369a1"
        );

        renderPanel();
    }

    setupPanelInteractions();
    restorePanelPreferences();
    renderPanel();

    window.__sequenceRunner = Object.freeze({
        version: VERSION,
        stop,
        createDiagnosticSnapshot,
        downloadDiagnosticSnapshot,
        getState: function () {
            return {
                state,
                stopped,
                sendLocked,
                continuationCount,
                completedResponseCount,
                runStarted,
                taskMode: selectedTaskMode,
                skipFirstMessage:
                    selectedSkipFirstMessage,
                workStyle: selectedWorkStyle,
                decisionMode: selectedDecisionMode,
                longWaitWake: {
                    afterMinutes:
                        selectedWakeAfterMinutes,
                    message:
                        selectedWakeMessage
                },
                queuedIntermediateMessages:
                    injectionQueue.length,
                injectionSentCount,
                immediateSendLocked,
                handoffInProgress,
                handoffCount,
                pendingAutoSend: pendingAutoSend
                    ? {
                          label:
                              pendingAutoSend.label,
                          reason:
                              pendingAutoSend.reason
                      }
                    : null,
                stopAfterCompletedResponses,
                stopLimitMode,
                chatMetrics: getChatMetrics(),
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
        getMetrics: function () {
            return {
                runner: {
                    sent: cycleSeq,
                    completed:
                        completedResponseCount,
                    continuationCount,
                    runtimeMs:
                        runnerStartedAt == null
                            ? 0
                            : Date.now() -
                              runnerStartedAt,
                    intermediateSent:
                        injectionSentCount,
                    intermediateQueued:
                        injectionQueue.length,
                    handoffs:
                        handoffCount,
                    handoffInProgress,
                    pendingAutoSend:
                        !!pendingAutoSend
                },
                chat: getChatMetrics(),
                stepLimit: {
                    target:
                        stopAfterCompletedResponses,
                    mode: stopLimitMode
                }
            };
        },
        setAbsoluteStepLimit: function (value) {
            const parsed =
                parsePositiveInteger(value);

            if (parsed == null) {
                throw new Error(
                    "Step limit must be a positive integer."
                );
            }

            applyStepLimit(
                parsed,
                "absolute"
            );
        },
        setRelativeStepLimit: function (value) {
            const parsed =
                parsePositiveInteger(value);

            if (parsed == null) {
                throw new Error(
                    "Relative step limit must be a positive integer."
                );
            }

            applyStepLimit(
                completedResponseCount +
                    parsed,
                "relative"
            );
        },
        clearStepLimit,
        restart:
            restartRunner,
        startExistingContext: function (
            workStyle,
            decisionMode,
            skipFirstMessage,
            wakeAfterMinutes,
            wakeMessage
        ) {
            return beginRun(
                "existing",
                "",
                workStyle,
                decisionMode,
                skipFirstMessage,
                wakeAfterMinutes,
                wakeMessage
            );
        },
        startWithTask: function (
            taskText,
            workStyle,
            decisionMode,
            wakeAfterMinutes,
            wakeMessage
        ) {
            return beginRun(
                "new",
                taskText,
                workStyle,
                decisionMode,
                false,
                wakeAfterMinutes,
                wakeMessage
            );
        },
        sendMessageImmediately:
            sendImmediateInjection,
        resume:
            resumePendingAutoSend,
        queueMessage: function (
            text,
            afterResponses
        ) {
            return queueInjection(
                text,
                afterResponses == null
                    ? 0
                    : afterResponses
            );
        },
        getQueuedMessages: function () {
            return injectionQueue.map(
                function (item) {
                    return {
                        id: item.id,
                        text: item.text,
                        targetCompletedResponses:
                            item.targetCompletedResponses,
                        remainingResponses:
                            Math.max(
                                0,
                                item.targetCompletedResponses -
                                    completedResponseCount
                            )
                    };
                }
            );
        },
        updateQueuedMessage:
            updateQueuedInjection,
        deleteQueuedMessage:
            deleteQueuedInjection,
        moveQueuedMessage:
            moveQueuedInjection,
        clearQueuedMessages:
            clearQueuedInjections,
        parseHandoff,
        isDone
    });

    // Backward-compatible alias for the earlier test/debug name.
    window.__chatgptAutoContinueV3 =
        window.__sequenceRunner;

    initialize();
})();