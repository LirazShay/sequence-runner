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
