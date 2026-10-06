// Sequence Runner live smoke check.
// Paste this entire file into the browser console after loading the runner.
// It is observational only: it does not click controls, write to the composer or send messages.

(function () {
    "use strict";

    function isVisible(element) {
        if (!element || !element.isConnected) {
            return false;
        }

        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);

        return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
        );
    }

    function count(selector) {
        const nodes = [...document.querySelectorAll(selector)];

        return {
            total: nodes.length,
            visible: nodes.filter(isVisible).length
        };
    }

    function readValue(selector) {
        const element = document.querySelector(selector);
        return element ? String(element.value || "") : null;
    }

    function addCheck(checks, name, ok, details) {
        checks.push({
            name,
            ok: !!ok,
            details: details == null ? "" : String(details)
        });
    }

    const runner = window.__sequenceRunner || null;
    const state = runner?.getState?.() || null;
    const panel = document.querySelector("#sequence-runner-panel");
    const wakeDelay = document.querySelector(
        '[data-input="wake-after-minutes"]'
    );
    const wakePreset = document.querySelector(
        '[data-input="wake-message-preset"]'
    );
    const wakeMessage = document.querySelector(
        '[data-input="wake-message"]'
    );

    const wakeOptions = wakeDelay
        ? [...wakeDelay.options].map(function (option) {
              return option.value;
          })
        : [];
    const expectedWakeOptions = Array.from(
        { length: 20 },
        function (_, index) {
            return String(index + 1);
        }
    );

    const selectors = {
        turns: count("[data-turn-key]"),
        userMessages: count('[data-user-message-bubble="true"]'),
        assistantBodies: count('[data-markdown-text-style="assistant-message"]'),
        composers: count('[contenteditable="true"][data-composer-markdown]'),
        sendButtons: count('button[aria-label="Send"],button[aria-label="שלח"]'),
        stopButtons: count('button[aria-label="Stop"],button[aria-label="עצור"]'),
        regenerateButtons: count('button[aria-label="Regenerate response"]')
    };

    const checks = [];

    addCheck(
        checks,
        "runner-loaded",
        !!runner,
        runner?.version || "missing"
    );
    addCheck(
        checks,
        "runner-debug-api",
        !!runner?.getState &&
            !!runner?.getLog &&
            !!runner?.createDiagnosticSnapshot,
        "getState/getLog/createDiagnosticSnapshot"
    );
    addCheck(
        checks,
        "panel-present",
        !!panel,
        panel ? "#sequence-runner-panel" : "missing"
    );
    addCheck(
        checks,
        "panel-version-matches-runner",
        !!panel &&
            !!runner?.version &&
            String(panel.textContent || "").includes(
                "Sequence Runner v" + runner.version
            ),
        runner?.version || "unknown"
    );
    addCheck(
        checks,
        "visible-composer",
        selectors.composers.visible > 0,
        JSON.stringify(selectors.composers)
    );
    addCheck(
        checks,
        "wake-delay-control",
        !!wakeDelay,
        readValue('[data-input="wake-after-minutes"]')
    );
    addCheck(
        checks,
        "wake-delay-options-1-to-20",
        JSON.stringify(wakeOptions) ===
            JSON.stringify(expectedWakeOptions),
        wakeOptions.join(",")
    );
    addCheck(
        checks,
        "wake-preset-control",
        !!wakePreset &&
            ["supportive", "short", "custom"].includes(
                String(wakePreset.value || "")
            ),
        wakePreset?.value || "missing"
    );
    addCheck(
        checks,
        "wake-message-non-empty",
        !!String(wakeMessage?.value || "").trim(),
        wakeMessage ? "present" : "missing"
    );
    addCheck(
        checks,
        "wake-ui-matches-run-state",
        !state?.runStarted ||
            (Number(wakeDelay?.value) ===
                state?.longWaitWake?.afterMinutes &&
                String(wakeMessage?.value || "").trim() ===
                    String(state?.longWaitWake?.message || "").trim()),
        state?.runStarted
            ? JSON.stringify(state.longWaitWake || null)
            : "run not started"
    );

    const report = {
        generatedAt: new Date().toISOString(),
        url: location.href,
        ok: checks.every(function (check) {
            return check.ok;
        }),
        runner: runner
            ? {
                  version: runner.version || null,
                  state: state?.state || null,
                  runStarted: !!state?.runStarted,
                  longWaitWake: state?.longWaitWake || null
              }
            : null,
        wakeUi: {
            delay: wakeDelay?.value || null,
            preset: wakePreset?.value || null,
            message: wakeMessage?.value || null,
            options: wakeOptions
        },
        selectors,
        checks
    };

    window.__sequenceRunnerLiveSmoke = report;

    console.group(
        "[SequenceRunner Live Smoke] " +
            (report.ok ? "PASS" : "FAIL")
    );
    console.table(checks);
    console.log(report);
    console.groupEnd();

    return report;
})();
