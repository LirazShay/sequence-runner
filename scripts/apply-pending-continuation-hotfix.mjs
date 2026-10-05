import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceOnce(content, search, replacement, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`Expected exactly one match for ${label}, found ${count}`);
  }
  return content.replace(search, replacement);
}

function replaceAllRequired(content, search, replacement, label) {
  const count = content.split(search).length - 1;
  if (count < 1) {
    throw new Error(`Expected at least one match for ${label}`);
  }
  return content.split(search).join(replacement);
}

function patchRunner() {
  let source = read("runner.js");

  source = replaceOnce(
    source,
    '    const VERSION = "3.25";',
    '    const VERSION = "3.26";',
    "runner version"
  );

  source = replaceOnce(
    source,
    `function getComposerText() {
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

    function deferAutoSend(
        prompt,
        label,
        reason
    ) {
        pendingAutoSend = {
            prompt,
            label,
            reason,
            deferredAt: Date.now()
        };
`,
    `function getComposerText() {
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

        pendingAutoSend = null;
        sendLocked = false;

        currentCycle = {
            id: "external-" + Date.now(),
            label: "external",
            prompt: null,
            beforeKeys: new Set(baseline),
            sentAt:
                pending?.deferredAt ||
                Date.now(),
            turnKey,
            sawStop: !!getStopButton(),
            lastText: null,
            lastTextChangedAt: 0,
            longWaitNoticeBucket: -1,
            activeGenerationStartedAt: null,
            wakeState: "idle",
            wakeThresholdReachedAt: null,
            wakeDeferredReason: null,
            wakeSentAt: null,
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
            "WAITING_FOR_RESPONSE",
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
`,
    "pending continuation helpers"
  );

  source = replaceOnce(
    source,
    `                  reason: pendingAutoSend.reason,
                  deferredAt: pendingAutoSend.deferredAt
              }
`,
    `                  reason: pendingAutoSend.reason,
                  baselineTurnKeys:
                      pendingAutoSend.baselineTurnKeys || [],
                  deferredAt: pendingAutoSend.deferredAt
              }
`,
    "diagnostic pending auto send baseline"
  );

  source = replaceOnce(
    source,
    `        if (getComposerText()) {
            setState(
                "WAITING_FOR_COMPOSER",
`,
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

        if (getComposerText()) {
            setState(
                "WAITING_FOR_COMPOSER",
`,
    "resume external turn adoption"
  );

  source = replaceOnce(
    source,
    `        const opts = options || {};
        const deferWhenBlocked =
            opts.deferWhenBlocked !== false;

        if (getStopButton()) {
`,
    `        const opts = options || {};
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
`,
    "sendPrompt preflight external turn adoption"
  );

  source = replaceOnce(
    source,
    `                deferAutoSend(
                    prompt,
                    label,
                    "chatgpt-busy"
                );
`,
    `                deferAutoSend(
                    prompt,
                    label,
                    "chatgpt-busy",
                    deferBaselineTurnKeys
                );
`,
    "busy defer baseline"
  );

  source = replaceAllRequired(
    source,
    `                deferAutoSend(
                    prompt,
                    label,
                    "composer-occupied"
                );
`,
    `                deferAutoSend(
                    prompt,
                    label,
                    "composer-occupied",
                    deferBaselineTurnKeys
                );
`,
    "composer defer baseline"
  );

  source = replaceOnce(
    source,
    `        continuationCount++;

        setState(
            "READY_TO_CONTINUE",
            "🔎 Response #" +
                continuationCount +
                " complete; continuing...",
            "#17a2b8"
        );

        const completedCycle = cycle;

        setTimeout(function () {
`,
    `        continuationCount++;

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
`,
    "continuation baseline capture"
  );

  source = replaceOnce(
    source,
    `            sendPrompt(
                CONFIG.REGULAR_PROMPT,
                "continue"
            ).catch(function (err) {
`,
    `            sendPrompt(
                CONFIG.REGULAR_PROMPT,
                "continue",
                {
                    deferBaselineTurnKeys:
                        continuationBaselineTurnKeys
                }
            ).catch(function (err) {
`,
    "continuation baseline send"
  );

  write("runner.js", source);
}

function patchTests() {
  let core = read("tests/e2e/core.spec.js");
  core = replaceOnce(core, '    version: "3.25",', '    version: "3.26",', "core version expectation");
  write("tests/e2e/core.spec.js", core);

  let regressions = read("tests/e2e/regressions.spec.js");
  const addition = `

test("deferred continuation is superseded by a manually sent completed turn", async ({ harness }) => {
  await harness.loadCanonical();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "First segment complete." },
      { type: "normal", text: "Manual response complete.\\nסיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("READY_TO_CONTINUE", 6000);
  await harness.page.evaluate(() => window.__mockChatGPT.setComposerText("MANUAL_OVERRIDE"));
  await harness.waitForState("WAITING_FOR_COMPOSER", 6000);
  await harness.page.locator('button[aria-label="Send"]').click();
  await harness.waitForState("DONE", 8000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe("MANUAL_OVERRIDE");

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) =>
    entry.event === "continuation-superseded-by-external-turn" &&
    entry.trigger === "pending-resume"
  )).toBeTruthy();
});

test("manual turn during continuation delay is evaluated before stale continuation", async ({ harness }) => {
  await harness.loadCanonical();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "First segment complete." },
      { type: "normal", text: "Manual response complete.\\nסיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("READY_TO_CONTINUE", 6000);
  await harness.page.evaluate(() => window.__mockChatGPT.setComposerText("MANUAL_FAST_OVERRIDE"));
  await harness.page.locator('button[aria-label="Send"]').click();
  await harness.waitForState("DONE", 8000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe("MANUAL_FAST_OVERRIDE");

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) =>
    entry.event === "continuation-superseded-by-external-turn" &&
    entry.trigger === "before-send"
  )).toBeTruthy();
});
`;

  if (!regressions.includes("deferred continuation is superseded by a manually sent completed turn")) {
    regressions += addition;
  }

  write("tests/e2e/regressions.spec.js", regressions);
}

function patchDocs() {
  const oldRule = "If an automatic send is blocked because the composer contains user text or ChatGPT is busy with external/manual activity, do not fail the runner. Preserve the pending automatic send, enter a recoverable waiting state, and resume only after the composer is empty and ChatGPT is idle. Never overwrite user text.";
  const newRule = "If an automatic send is blocked because the composer contains user text or ChatGPT is busy with external/manual activity, do not fail the runner. Preserve the pending automatic send, enter a recoverable waiting state, and resume only after the composer is empty and ChatGPT is idle. Before resuming a deferred continuation, first verify whether a new user turn appeared since the completed-response boundary that scheduled that continuation. If such an external turn exists, discard the stale pending continuation, track that new turn, evaluate its Assistant response first, and let that response decide DONE, handoff, queued injection or the next continuation. Never overwrite user text.";

  for (const path of ["AGENTS.md", "README.md"]) {
    let content = read(path);
    content = replaceAllRequired(content, oldRule, newRule, `${path} pending send rule`);
    write(path, content);
  }
}

patchRunner();
patchTests();
patchDocs();
