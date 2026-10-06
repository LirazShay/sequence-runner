import { test, expect } from "./fixture.js";

test("Stopped thinking without an Assistant body exits WAITING_FOR_RESPONSE with a diagnosable error", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [{ type: "stopped-thinking", delayMs: 80 }]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("ERROR");

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "response-terminated-without-assistant")).toBeTruthy();
  const error = log.findLast((entry) => entry.event === "error");
  expect(error?.message).toContain("stopped the response before producing an assistant message");
});

test("Stopped thinking with a due queued message recovers by sending that message", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "stopped-thinking", delayMs: 120 },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.page.evaluate(() => window.__sequenceRunner.queueMessage("RECOVERY_MESSAGE", 0));

  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe("RECOVERY_MESSAGE");

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "terminal-response-recovered-by-injection")).toBeTruthy();
});

test("streamed response is evaluated only after generation ends and text stabilizes", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      {
        type: "normal",
        chunks: ["work ", "still running ", "done\n", "סיימתי"],
        chunkDelayMs: 35,
        finishDelayMs: 30
      }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  expect(await harness.sentMessages()).toHaveLength(1);
  const events = await harness.events();
  expect(events.filter((event) => event.type === "assistant-chunk")).toHaveLength(4);
});

test("deferred continuation is superseded by a manually sent completed turn", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "First segment complete.", finishDelayMs: 250 },
      { type: "normal", text: "Manual response complete.\nסיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.page.evaluate(() => window.__mockChatGPT.setComposerText("MANUAL_OVERRIDE"));
  await harness.waitForState("WAITING_FOR_COMPOSER", 4000);
  await harness.page.locator('button[aria-label="Send"]').click();
  await harness.waitForState("DONE", 5000);

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
      { type: "normal", text: "Manual response complete.\nסיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const deadline = Date.now() + 6000;
      const timer = setInterval(() => {
        if (window.__sequenceRunner.getState().state === "READY_TO_CONTINUE") {
          clearInterval(timer);
          window.__mockChatGPT.setComposerText("MANUAL_FAST_OVERRIDE");
          document.querySelector('button[aria-label="Send"]')?.click();
          resolve();
          return;
        }

        if (Date.now() >= deadline) {
          clearInterval(timer);
          reject(new Error("READY_TO_CONTINUE was not observed before the deadline."));
        }
      }, 5);
    });
  });
  await harness.waitForState("DONE", 5000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe("MANUAL_FAST_OVERRIDE");

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) =>
    entry.event === "continuation-superseded-by-external-turn" &&
    entry.trigger === "before-send"
  )).toBeTruthy();
});


test("delivery timeout clicks Retry once and continues the same runner cycle", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      {
        type: "delivery-timeout",
        retryResponse: { type: "normal", text: "Recovered after delivery Retry.\nסיימתי" }
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
