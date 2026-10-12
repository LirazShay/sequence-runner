import { test, expect } from "./fixture.js";

async function waitForTrackedGeneration(harness) {
  await expect.poll(
    () => harness.page.evaluate(() => {
      const state = window.__sequenceRunner.getState();
      return !!state.currentCycle?.turnKey && !!document.querySelector('button[aria-label="Stop"]');
    })
  ).toBeTruthy();
}

test("panel exposes fifteen-minute split default and pause control", async ({ harness }) => {
  await harness.load();

  await expect(harness.page.locator('[data-input="split-after-minutes"]')).toHaveValue("15");
  await expect(harness.page.locator('[data-action="toggle-pause"]')).toBeHidden();

  const state = await harness.runnerState();
  expect(state.longWaitSplit.afterMinutes).toBe(15);
  expect(state.paused).toBe(false);
});

test("pause does not stop an active ChatGPT response and resume continues the same run", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "Checkpoint complete.", startDelayMs: 20, finishDelayMs: 250 },
      { type: "normal", text: "סיימתי", startDelayMs: 20, finishDelayMs: 40 }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForSentCount(1);
  await harness.waitForState("GENERATING");

  await harness.page.click('[data-action="toggle-pause"]');
  await expect.poll(
    () => harness.page.evaluate(() => window.__sequenceRunner.getState().paused)
  ).toBe(true);
  await expect(harness.page.locator('[data-action="toggle-pause"]')).toHaveText("▶ המשך ריצה");

  await harness.page.waitForTimeout(450);
  expect(await harness.sentMessages()).toHaveLength(1);

  const eventsWhilePaused = await harness.events();
  expect(eventsWhilePaused.some((event) => event.type === "stop-click")).toBeFalsy();

  await harness.page.click('[data-action="toggle-pause"]');
  await harness.waitForSentCount(2);
  await harness.waitForState("DONE");

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "runner-paused")).toBeTruthy();
  expect(log.some((entry) => entry.event === "runner-resumed")).toBeTruthy();
});

test("pause preserves a continuation already scheduled after response completion", async ({ harness }) => {
  await harness.loadCanonical();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "Checkpoint complete." },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForSentCount(1);
  await harness.page.waitForFunction(
    () => window.__sequenceRunner.getState().state === "READY_TO_CONTINUE",
    null,
    { polling: 10, timeout: 3500 }
  );
  await harness.page.evaluate(() => window.__sequenceRunner.pauseRun());

  await harness.page.waitForTimeout(500);
  expect(await harness.sentMessages()).toHaveLength(1);

  const pausedState = await harness.runnerState();
  expect(pausedState.paused).toBe(true);
  expect(pausedState.pendingPausedAction?.label).toBe("continuation");

  await harness.page.evaluate(() => window.__sequenceRunner.resumeRun());
  await harness.waitForSentCount(2);
  await harness.waitForState("DONE", 3500);

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "pause-action-deferred" && entry.label === "continuation")).toBeTruthy();
  expect(log.some((entry) => entry.event === "pause-action-resumed" && entry.label === "continuation")).toBeTruthy();
});

test("paused wall-clock time does not advance wake or split thresholds", async ({ harness }) => {
  await harness.load();
  await harness.page.evaluate(() => {
    const realDateNow = Date.now.bind(Date);
    window.__pauseClockOffsetMs = 0;
    Date.now = () => realDateNow() + window.__pauseClockOffsetMs;
  });
  await harness.setScenario({
    responses: [
      { type: "hold" },
      {
        type: "normal",
        text: "סיימתי",
        replaceActiveGeneration: true,
        startDelayMs: 20,
        finishDelayMs: 40
      }
    ]
  });

  await harness.page.evaluate(() =>
    window.__sequenceRunner.startExistingContext(
      "steady",
      "autonomous",
      false,
      10,
      undefined,
      15
    )
  );
  await waitForTrackedGeneration(harness);

  await harness.page.evaluate(() => {
    window.__pauseClockOffsetMs = 9 * 60 * 1000;
  });
  await harness.page.waitForTimeout(80);
  await harness.page.evaluate(() => window.__sequenceRunner.pauseRun());

  await harness.page.evaluate(() => {
    window.__pauseClockOffsetMs = 30 * 60 * 1000;
  });
  await harness.page.waitForTimeout(120);
  expect(await harness.sentMessages()).toHaveLength(1);

  await harness.page.evaluate(() => window.__sequenceRunner.resumeRun());
  await harness.page.waitForTimeout(120);
  expect(await harness.sentMessages()).toHaveLength(1);

  await harness.page.evaluate(() => {
    window.__pauseClockOffsetMs = 31 * 60 * 1000 + 1000;
  });
  await harness.waitForSentCount(2);
  await harness.waitForState("DONE");

  const events = await harness.events();
  expect(events.some((event) => event.type === "stop-click")).toBeFalsy();

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.filter((entry) => entry.event === "long-wait-wake-sent")).toHaveLength(1);
  expect(log.some((entry) => entry.event === "long-wait-split-sent")).toBeFalsy();
});
