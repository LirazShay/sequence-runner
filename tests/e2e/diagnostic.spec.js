import fs from "node:fs";
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
  expect(result.snapshot.version).toBe("3.37");
  expect(result.snapshot.stateName).toBe("GENERATING");
  expect(result.snapshot.currentTurnKey).toBeTruthy();
  expect(result.snapshot.selectorCount).toBeGreaterThanOrEqual(14);
  expect(result.snapshot.hasFullPageHtml).toBeTruthy();
  expect(result.snapshot.includesPrivacyBoundary).toBeTruthy();
  expect(result.snapshot.captureErrors).toEqual([]);

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});

test("diagnostic snapshot flags visible text when the Assistant wrapper selector drifts", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({ responses: [{ type: "hold" }] });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await waitForTrackedGeneration(harness);

  const result = await harness.page.evaluate(() => {
    const turnKey = window.__sequenceRunner.getState().currentCycle?.turnKey;
    const turn = [...document.querySelectorAll('[data-turn-key]')]
      .find((node) => node.getAttribute('data-turn-key') === turnKey);

    if (!turn) {
      throw new Error("Tracked mock turn not found");
    }

    turn.querySelectorAll('[data-markdown-text-style="assistant-message"]').forEach((node) => {
      node.removeAttribute('data-markdown-text-style');
    });
    turn.querySelectorAll('[data-content-search-unit-key$=":assistant"]').forEach((node) => {
      node.removeAttribute('data-content-search-unit-key');
    });
    turn.querySelectorAll('[data-chatgpt-search-unit-key$=":assistant"]').forEach((node) => {
      node.removeAttribute('data-chatgpt-search-unit-key');
    });
    turn.querySelectorAll('[data-chatgpt-selection-message-id]').forEach((node) => {
      node.removeAttribute('data-chatgpt-selection-message-id');
    });
    turn.querySelectorAll('h4[data-conversation-role="assistant"]').forEach((node) => {
      node.removeAttribute('data-conversation-role');
    });

    const drifted = document.createElement("div");
    drifted.setAttribute("data-mock-drifted-assistant", "true");
    drifted.textContent = "VISIBLE_ASSISTANT_WITH_CHANGED_WRAPPER";
    turn.appendChild(drifted);

    const snapshot = window.__sequenceRunner.createDiagnosticSnapshot();
    return {
      currentTurnText: snapshot.currentTurn?.visibleText || "",
      observations: snapshot.diagnosis.observations.map((entry) => entry.code),
      assistantMatches: snapshot.currentTurn?.assistantMatches || []
    };
  });

  expect(result.currentTurnText).toContain("VISIBLE_ASSISTANT_WITH_CHANGED_WRAPPER");
  expect(result.observations).toContain("VISIBLE_TURN_TEXT_BUT_ASSISTANT_SELECTOR_MISS");
  expect(result.assistantMatches.every((entry) => entry.count === 0)).toBeTruthy();

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
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
  expect(parsed.runner.version).toBe("3.37");
  expect(parsed.page.url).toContain("mock.local");
  expect(parsed.selectors['[data-turn-key]']).toBeTruthy();
  expect(parsed.privacy.intentionallyExcluded).toContain("localStorage");
});
