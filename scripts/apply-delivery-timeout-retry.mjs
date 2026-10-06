import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function write(file, content) {
  fs.writeFileSync(path.join(root, file), content);
}

function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${count}`);
  }
  return source.replace(from, to);
}

function replaceExactCount(source, from, to, expected, label) {
  const count = source.split(from).length - 1;
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  }
  return source.split(from).join(to);
}

let runner = read("runner.js");
runner = replaceOnce(runner, 'const VERSION = "3.32";', 'const VERSION = "3.33";', "version");
runner = replaceOnce(
  runner,
  '        FAST_RESPONSE_FALLBACK_MS: 2500,\n        LONG_WAIT_NOTICE_AFTER_MS: 5 * 60 * 1000,',
  '        FAST_RESPONSE_FALLBACK_MS: 2500,\n        DELIVERY_RETRY_START_TIMEOUT_MS: 5000,\n        DELIVERY_RETRY_MAX_ATTEMPTS: 1,\n        DELIVERY_TIMEOUT_MESSAGE: "Message delivery timed out. Please try again.",\n        LONG_WAIT_NOTICE_AFTER_MS: 5 * 60 * 1000,',
  "delivery retry config"
);
runner = replaceOnce(
  runner,
  '        \'h4[data-conversation-role="assistant"]\',\n        \'[contenteditable="true"][data-composer-markdown]\',',
  '        \'h4[data-conversation-role="assistant"]\',\n        \'aside[role="alert"]\',\n        \'[contenteditable="true"][data-composer-markdown]\',',
  "diagnostic alert selector"
);
runner = replaceOnce(
  runner,
  '        if (hasFinalUi(turn)) {\n            score += 80;\n        }\n\n        return score;',
  '        if (hasFinalUi(turn)) {\n            score += 80;\n        }\n\n        if (getDeliveryFailure(turn)) {\n            score += 70;\n        }\n\n        return score;',
  "turn scoring"
);

const retryHelpers = `    function getDeliveryFailure(turn) {
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

`;
runner = replaceOnce(
  runner,
  '    function sleep(ms) {',
  retryHelpers + '    function sleep(ms) {',
  "retry helpers"
);

runner = replaceExactCount(
  runner,
  '            wakeSentAt: null,\n            processed: false',
  '            wakeSentAt: null,\n            deliveryRetryAttempts: 0,\n            deliveryRetryState: "idle",\n            deliveryRetryClickedAt: null,\n            processed: false',
  3,
  "cycle retry fields"
);
runner = replaceOnce(
  runner,
  '            wakeSentAt: cycle.wakeSentAt ?? null,\n            processed: !!cycle.processed,',
  '            wakeSentAt: cycle.wakeSentAt ?? null,\n            deliveryRetryAttempts: cycle.deliveryRetryAttempts ?? 0,\n            deliveryRetryState: cycle.deliveryRetryState ?? "idle",\n            deliveryRetryClickedAt: cycle.deliveryRetryClickedAt ?? null,\n            processed: !!cycle.processed,',
  "diagnostic retry fields"
);
runner = replaceOnce(
  runner,
  '                cycle.sentAt,\n                cycle,\n                "response"',
  '                cycle.deliveryRetryClickedAt || cycle.sentAt,\n                cycle,\n                "response"',
  "retry wait clock"
);
runner = replaceOnce(
  runner,
  '        if (\n            updateLongRunningWake(\n                cycle,\n                !!stopButton\n            )\n        ) {\n            return;\n        }',
  '        const deliveryFailure =\n            getDeliveryFailure(turn);\n\n        if (deliveryFailure) {\n            recoverDeliveryFailure(\n                cycle,\n                deliveryFailure\n            ).catch(function (err) {\n                fail(err.message, err);\n            });\n            return;\n        }\n\n        if (\n            updateLongRunningWake(\n                cycle,\n                !!stopButton\n            )\n        ) {\n            return;\n        }',
  "evaluate delivery failure"
);
write("runner.js", runner);

let mock = read("tests/mock-chatgpt/mock-chatgpt.js");
const deliveryTimeoutMock = `  function runDeliveryTimeout(turn, response) {
    const alert = document.createElement("aside");
    alert.setAttribute("role", "alert");

    const message = document.createElement("div");
    message.textContent = "Message delivery timed out. Please try again.";

    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Retry";

    retry.addEventListener("click", () => {
      record("retry-click", {
        turnKey: turn.getAttribute("data-turn-key")
      });
      alert.remove();
      runResponse(
        turn,
        response.retryResponse || {
          type: "normal",
          text: "Mock response after retry"
        }
      );
    });

    alert.append(message, retry);
    turn.appendChild(alert);

    record("delivery-timeout", {
      turnKey: turn.getAttribute("data-turn-key")
    });
  }

`;
mock = replaceOnce(
  mock,
  '  function runStoppedThinking(turn, response) {',
  deliveryTimeoutMock + '  function runStoppedThinking(turn, response) {',
  "mock delivery timeout"
);
mock = replaceOnce(
  mock,
  '    if (selected.type === "stopped-thinking") {\n      runStoppedThinking(turn, selected);\n      return;\n    }',
  '    if (selected.type === "delivery-timeout") {\n      runDeliveryTimeout(turn, selected);\n      return;\n    }\n\n    if (selected.type === "stopped-thinking") {\n      runStoppedThinking(turn, selected);\n      return;\n    }',
  "mock response dispatch"
);
write("tests/mock-chatgpt/mock-chatgpt.js", mock);

let regressions = read("tests/e2e/regressions.spec.js");
regressions += `

test("delivery timeout clicks Retry once and continues the same runner cycle", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      {
        type: "delivery-timeout",
        retryResponse: { type: "normal", text: "Recovered after delivery Retry.\\nסיימתי" }
      }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  expect(await harness.sentMessages()).toHaveLength(1);

  const events = await harness.events();
  expect(events.filter((event) => event.type === "retry-click")).toHaveLength(1);

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "delivery-retry-clicked" && entry.attempt === 1)).toBeTruthy();
  expect(log.some((entry) => entry.event === "delivery-retry-started")).toBeTruthy();
  expect(log.some((entry) => entry.event === "response-complete")).toBeTruthy();
});

test("a second delivery timeout stops instead of creating an automatic Retry loop", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      {
        type: "delivery-timeout",
        retryResponse: {
          type: "delivery-timeout",
          retryResponse: { type: "normal", text: "must not be reached" }
        }
      }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("ERROR");

  expect(await harness.sentMessages()).toHaveLength(1);

  const events = await harness.events();
  expect(events.filter((event) => event.type === "retry-click")).toHaveLength(1);

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "delivery-retry-exhausted" && entry.attempts === 1)).toBeTruthy();
  const error = log.findLast((entry) => entry.event === "error");
  expect(error?.message).toContain("timed out again after the automatic Retry");
});
`;
write("tests/e2e/regressions.spec.js", regressions);

for (const name of fs.readdirSync(path.join(root, "tests/e2e"))) {
  if (!name.endsWith(".js")) continue;
  const file = path.join("tests/e2e", name);
  const source = read(file);
  if (source.includes("3.32")) {
    write(file, source.split("3.32").join("3.33"));
  }
}

let agents = read("AGENTS.md");
agents = replaceOnce(
  agents,
  'If the tracked turn explicitly terminates with UI such as `Stopped thinking` and has no Assistant body, do not wait indefinitely and do not automatically resend the interrupted prompt. Treat generation as terminated. If a queued intermediate message is already due, it may safely supersede that terminated cycle; otherwise stop with a clear diagnosable error.\n',
  'If the tracked turn explicitly terminates with UI such as `Stopped thinking` and has no Assistant body, do not wait indefinitely and do not automatically resend the interrupted prompt. Treat generation as terminated. If a queued intermediate message is already due, it may safely supersede that terminated cycle; otherwise stop with a clear diagnosable error.\n\nIf the tracked Runner-sent turn shows the verified delivery-failure alert `Message delivery timed out. Please try again.` with a `Retry` button, recover that same send by clicking `Retry` inside that tracked turn exactly once. This is not a new Runner send and must not increment send/continuation counters or click Stop. If Retry is unavailable, does not start, or the same cycle reaches the delivery-timeout alert again, stop with a diagnosable error instead of entering an automatic retry loop. Never use a page-global Retry control when a tracked-turn-scoped control is required.\n',
  "AGENTS delivery retry rule"
);
write("AGENTS.md", agents);

let readme = read("README.md");
readme = replaceOnce(
  readme,
  '- Assistant text must remain stable for a short period before it is evaluated.\n- A watchdog wakes the state machine if a DOM mutation is missed; it does not independently decide to send.\n',
  '- Assistant text must remain stable for a short period before it is evaluated.\n- If a Runner-sent tracked turn shows ChatGPT\'s verified `Message delivery timed out. Please try again.` alert, the runner clicks that turn\'s `Retry` button once and keeps the same cycle. Retry does not count as another Runner send and never clicks Stop. A missing/failed Retry or a second delivery timeout on the same cycle stops with a clear error instead of looping.\n- A watchdog wakes the state machine if a DOM mutation is missed; it does not independently decide to send.\n',
  "README delivery retry rule"
);
write("README.md", readme);

console.log("Applied delivery-timeout Retry recovery patch.");
