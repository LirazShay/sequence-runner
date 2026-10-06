import { test, expect } from "./fixture.js";

test("delivery timeout on an immediate wake retries the same wake cycle without Stop or an extra send", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "hold" },
      {
        type: "delivery-timeout",
        retryResponse: {
          type: "normal",
          replaceActiveGeneration: true,
          text: "Wake delivery recovered.\nסיימתי"
        }
      }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("GENERATING");

  await harness.page.evaluate(() =>
    window.__sequenceRunner.sendMessageImmediately("מה קורה?", {
      label: "wake",
      source: "long-wait-wake",
      countAsInjection: false
    })
  );

  await harness.waitForState("DONE", 5000);

  expect(await harness.sentMessages()).toHaveLength(2);

  const events = await harness.events();
  expect(events.filter((event) => event.type === "retry-click")).toHaveLength(1);
  expect(events.some((event) => event.type === "stop-click")).toBeFalsy();

  const state = await harness.runnerState();
  expect(state.injectionSentCount).toBe(0);

  const metrics = await harness.page.evaluate(() => window.__sequenceRunner.getMetrics());
  expect(metrics.runner.sent).toBe(2);

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "delivery-retry-clicked" && entry.attempt === 1)).toBeTruthy();
  expect(log.some((entry) => entry.event === "delivery-retry-started")).toBeTruthy();
});
