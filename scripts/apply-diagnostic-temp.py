from pathlib import Path
import re

RUNNER = Path('runner.js')
text = RUNNER.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    text = text.replace(old, new, 1)


replace_once('const VERSION = "3.20";', 'const VERSION = "3.21";', 'version')

selector_anchor = '''    });\n\n    try {\n        window.__chatgptAutoContinueV3?.stop?.("replaced");'''
diagnostic_constants = '''    });\n\n    const DIAGNOSTIC_SCHEMA_VERSION = 1;\n    const DIAGNOSTIC_SELECTORS = Object.freeze([\n        '[data-turn-key]',\n        '[data-user-message-bubble="true"]',\n        '[data-markdown-text-style="assistant-message"]',\n        '[data-content-search-unit-key$=":assistant"]',\n        '[data-chatgpt-search-unit-key$=":assistant"]',\n        '[data-chatgpt-selection-message-id]',\n        'h4[data-conversation-role="assistant"]',\n        '[contenteditable="true"][data-composer-markdown]',\n        '#prompt-textarea',\n        'button[aria-label="Send"]',\n        'button[aria-label="Stop"]',\n        'button[aria-label="Regenerate response"]',\n        'button[data-testid="send-button"]',\n        'button[data-testid="stop-button"]'\n    ]);\n\n    try {\n        window.__chatgptAutoContinueV3?.stop?.("replaced");'''
replace_once(selector_anchor, diagnostic_constants, 'diagnostic constants')

panel_anchor = '''        '<div style="margin-top:7px;font-size:11px;color:#94a3b8">הגבול נבדק רק אחרי שתשובת ChatGPT הנוכחית הושלמה; הוא לא חותך תשובה באמצע.</div>',\n        '</div>',\n        '</div>',\n        '</div>',\n        '<div data-role="resize-handle"'''
panel_replacement = '''        '<div style="margin-top:7px;font-size:11px;color:#94a3b8">הגבול נבדק רק אחרי שתשובת ChatGPT הנוכחית הושלמה; הוא לא חותך תשובה באמצע.</div>',\n        '</div>',\n        '<div style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-top:10px">',\n        '<div style="font-weight:700;margin-bottom:7px">אבחון תקלה</div>',\n        '<button type="button" data-action="download-diagnostic" style="width:100%;border:1px solid #0ea5e9;background:#0c4a6e;color:#fff;border-radius:6px;padding:7px;cursor:pointer;font-weight:700">דווח תקלה / הורד צילום מצב</button>',\n        '<div data-role="diagnostic-warning" style="margin-top:6px;font-size:10px;color:#fbbf24">הדוח עשוי לכלול את תוכן הצ׳אט וה־DOM הגלוי בדף. הוא לא אוסף בכוונה cookies, tokens או browser storage.</div>',\n        '</div>',\n        '</div>',\n        '</div>',\n        '<div data-role="resize-handle"'''
replace_once(panel_anchor, panel_replacement, 'panel diagnostic action')

body_anchor = '''    document.body.appendChild(panel);\n\n    const statusDiv = panel.querySelector('[data-role="status"]');'''
body_replacement = '''    document.body.appendChild(panel);\n\n    const diagnosticButton = panel.querySelector('[data-action="download-diagnostic"]');\n    diagnosticButton?.addEventListener("click", function (event) {\n        event.preventDefault();\n        event.stopPropagation();\n\n        try {\n            downloadDiagnosticSnapshot();\n        } catch (err) {\n            console.error("Sequence Runner diagnostic download failed", err);\n        }\n    });\n\n    const statusDiv = panel.querySelector('[data-role="status"]');'''
replace_once(body_anchor, body_replacement, 'diagnostic button binding')

diagnostic_functions = r'''    function diagnosticSafeCapture(errors, label, capture, fallbackValue) {
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

'''
marker = '    function setupPanelInteractions() {'
if text.count(marker) != 1:
    raise SystemExit('setupPanelInteractions marker not unique')
text = text.replace(marker, diagnostic_functions + marker, 1)

api_anchor = '''    window.__sequenceRunner = Object.freeze({\n        version: VERSION,\n        stop,\n        getState: function () {'''
api_replacement = '''    window.__sequenceRunner = Object.freeze({\n        version: VERSION,\n        stop,\n        createDiagnosticSnapshot,\n        downloadDiagnosticSnapshot,\n        getState: function () {'''
replace_once(api_anchor, api_replacement, 'public diagnostic api')

RUNNER.write_text(text, encoding='utf-8')

core = Path('tests/e2e/core.spec.js')
core_text = core.read_text(encoding='utf-8')
if core_text.count('version: "3.20"') != 1:
    raise SystemExit('core version expectation not unique')
core.write_text(core_text.replace('version: "3.20"', 'version: "3.21"', 1), encoding='utf-8')

diagnostic_test = r'''import fs from "node:fs";
import { test, expect } from "./fixture.js";

async function waitForTrackedGeneration(harness) {
  await expect.poll(
    () => harness.page.evaluate(() => {
      const cycle = window.__sequenceRunner.getState().currentCycle;
      return !!cycle?.turnKey && !!document.querySelector('button[aria-label="Stop"]');
    })
  ).toBeTruthy();
}

test("diagnostic snapshot is versioned, self-contained and non-mutating during an active response", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({ responses: [{ type: "hold" }] });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await waitForTrackedGeneration(harness);

  const result = await harness.page.evaluate(() => {
    const before = {
      state: window.__sequenceRunner.getState(),
      logLength: window.__sequenceRunner.getLog().length,
      composerText: window.__mockChatGPT.getState().composerText,
      sentMessages: window.__mockChatGPT.getSentMessages()
    };

    const snapshot = window.__sequenceRunner.createDiagnosticSnapshot();

    const after = {
      state: window.__sequenceRunner.getState(),
      logLength: window.__sequenceRunner.getLog().length,
      composerText: window.__mockChatGPT.getState().composerText,
      sentMessages: window.__mockChatGPT.getSentMessages()
    };

    return {
      before,
      after,
      snapshot: {
        diagnosticSchemaVersion: snapshot.diagnosticSchemaVersion,
        version: snapshot.runner.version,
        stateName: snapshot.runner.stateName,
        currentTurnKey: snapshot.currentTurn?.turnKey || null,
        selectorCount: Object.keys(snapshot.selectors).length,
        hasFullPageHtml: typeof snapshot.page.fullPageHtml === "string" && snapshot.page.fullPageHtml.length > 100,
        includesPrivacyBoundary: snapshot.privacy.intentionallyExcluded.includes("cookies"),
        captureErrors: snapshot.captureErrors
      }
    };
  });

  expect(result.after).toEqual(result.before);
  expect(result.snapshot.diagnosticSchemaVersion).toBe(1);
  expect(result.snapshot.version).toBe("3.21");
  expect(result.snapshot.stateName).toBe("GENERATING");
  expect(result.snapshot.currentTurnKey).toBeTruthy();
  expect(result.snapshot.selectorCount).toBeGreaterThanOrEqual(14);
  expect(result.snapshot.hasFullPageHtml).toBeTruthy();
  expect(result.snapshot.includesPrivacyBoundary).toBeTruthy();
  expect(result.snapshot.captureErrors).toEqual([]);

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});

test("diagnostic snapshot flags a visible tracked turn when Assistant selectors miss", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [{ type: "stopped-thinking", delayMs: 80 }]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("ERROR");

  const result = await harness.page.evaluate(() => {
    const snapshot = window.__sequenceRunner.createDiagnosticSnapshot();
    return {
      currentTurnText: snapshot.currentTurn?.visibleText || "",
      observations: snapshot.diagnosis.observations.map((entry) => entry.code),
      assistantMatches: snapshot.currentTurn?.assistantMatches || []
    };
  });

  expect(result.currentTurnText).toContain("Stopped thinking");
  expect(result.observations).toContain("VISIBLE_TURN_TEXT_BUT_ASSISTANT_SELECTOR_MISS");
  expect(result.assistantMatches.every((entry) => entry.count === 0)).toBeTruthy();
});

test("panel diagnostic action downloads the same versioned JSON contract", async ({ harness }) => {
  await harness.load();

  await expect(harness.page.locator('[data-role="diagnostic-warning"]')).toContainText("תוכן הצ׳אט");

  const downloadPromise = harness.page.waitForEvent("download");
  await harness.page.locator('[data-action="download-diagnostic"]').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^sequence-runner-diagnostic-.*\.json$/);

  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const parsed = JSON.parse(fs.readFileSync(downloadPath, "utf8"));

  expect(parsed.diagnosticSchemaVersion).toBe(1);
  expect(parsed.runner.version).toBe("3.21");
  expect(parsed.page.url).toContain("mock.local");
  expect(parsed.selectors['[data-turn-key]']).toBeTruthy();
  expect(parsed.privacy.intentionallyExcluded).toContain("localStorage");
});
'''
Path('tests/e2e/diagnostic.spec.js').write_text(diagnostic_test, encoding='utf-8')

readme = Path('README.md')
readme_text = readme.read_text(encoding='utf-8')
readme_anchor = '''A backward-compatible alias, `__chatgptAutoContinueV3`, is also currently exposed.\n\n## Maintenance'''
readme_section = '''A backward-compatible alias, `__chatgptAutoContinueV3`, is also currently exposed.\n\n### Downloadable diagnostic snapshot\n\nThe management panel includes **דווח תקלה / הורד צילום מצב**. It generates a versioned JSON snapshot of the current Runner state and the observable ChatGPT page without attempting recovery or changing the active run. The report includes Runner state/metrics/log, current-cycle metadata, turn inventory, a deep snapshot of the tracked turn, selector/control evidence, composer state, deterministic diagnostic observations and the current page DOM.\n\nThe same builder is available programmatically:\n\n```js\nconst snapshot = __sequenceRunner.createDiagnosticSnapshot()\n__sequenceRunner.downloadDiagnosticSnapshot()\n```\n\nThe report intentionally may include visible conversation text and page DOM because those are required to diagnose selector and SPA failures. It does **not** intentionally collect cookies, authentication tokens, authorization headers, `localStorage`, `sessionStorage`, IndexedDB contents, saved passwords, arbitrary network bodies, unrelated browser history or extension data. Snapshot generation prefers partial evidence plus `captureErrors` over failing completely when an unexpected DOM shape is encountered.\n\n## Maintenance'''
if readme_text.count(readme_anchor) != 1:
    raise SystemExit('README diagnostic insertion point not found')
readme.write_text(readme_text.replace(readme_anchor, readme_section, 1), encoding='utf-8')

agents = Path('AGENTS.md')
agents_text = agents.read_text(encoding='utf-8')
agents_anchor = '''When debugging a failure:\n\n1. inspect state,\n2. inspect log,\n3. identify the exact state where progress stopped,\n4. determine the root cause,\n5. fix the correct layer instead of adding arbitrary delays or broad retries.\n\n## Development principles'''
agents_section = '''When debugging a failure:\n\n1. inspect state,\n2. inspect log,\n3. identify the exact state where progress stopped,\n4. determine the root cause,\n5. fix the correct layer instead of adding arbitrary delays or broad retries.\n\nThe built-in diagnostic contract is versioned and non-mutating:\n\n```js\n__sequenceRunner.createDiagnosticSnapshot()\n__sequenceRunner.downloadDiagnosticSnapshot()\n```\n\nThe panel exposes the same snapshot through **דווח תקלה / הורד צילום מצב**. Diagnostic capture must never send, click Stop, clear or overwrite the composer, recover automatically, or otherwise change Runner state. It may intentionally include visible conversation text and DOM, but must not intentionally collect cookies, auth tokens/headers, browser storage, saved credentials or arbitrary network bodies. When production DOM selectors change, update the diagnostic selector inventory in the same change. Preserve partial capture errors inside the report instead of crashing on unexpected DOM.\n\n## Development principles'''
if agents_text.count(agents_anchor) != 1:
    raise SystemExit('AGENTS diagnostic insertion point not found')
agents.write_text(agents_text.replace(agents_anchor, agents_section, 1), encoding='utf-8')
