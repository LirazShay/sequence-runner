import { test, expect } from "./fixture.js";

const WAIT_MARKER = "ממתין לך";

async function sendUserMessage(harness, text) {
  await harness.page.evaluate((message) => {
    window.__mockChatGPT.setComposerText(message);
    const button = document.querySelector('form[data-chatgpt-composer] button[aria-label="Send"]');
    if (!button) {
      throw new Error("Mock Send button not found");
    }
    button.click();
  }, text);
}

test("all three opening modes install the natural wait-for-user contract", async ({ harness }) => {
  const starts = [
    async () => harness.page.evaluate(() => window.__sequenceRunner.startExistingContext()),
    async () => harness.page.evaluate(() => window.__sequenceRunner.startExistingContext("steady", "autonomous", true)),
    async () => harness.page.evaluate(() => window.__sequenceRunner.startWithTask("WAIT_PROTOCOL_TASK"))
  ];

  for (let index = 0; index < starts.length; index++) {
    await harness.load();
    await harness.setScenario({ responses: [{ type: "normal", text: "סיימתי" }] });
    await starts[index]();
    await harness.waitForState("DONE");

    const [firstPrompt] = await harness.sentMessages();
    expect(firstPrompt).toContain("ממתין לך");
    expect(firstPrompt).toContain("מידע, החלטה, אישור, קובץ או פעולה");

    if (index < starts.length - 1) {
      await harness.page.evaluate(() => window.__sequenceRunner.restart());
      await harness.waitForState("READY_TO_START");
      await harness.page.evaluate(() => window.__mockChatGPT.reset());
    }
  }
});

test("wait marker pauses automation and a new user turn resumes it automatically", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "חסר קובץ חיוני להמשך.\nממתין לך" },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("WAITING_FOR_USER");

  expect(await harness.sentMessages()).toHaveLength(1);
  const waitingState = await harness.runnerState();
  expect(waitingState.waitingForUser?.reason).toBe("assistant-request");

  await sendUserMessage(harness, "הקובץ צורף, תמשיך");
  await harness.waitForState("DONE", 5000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe("הקובץ צורף, תמשיך");
  expect(sent).not.toContain("תמשיך לשלב הבא");
});

test("manual resume sends one continuation when the external blocker was resolved out of band", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "ממתין לאישור חיצוני.\nממתין לך" },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("WAITING_FOR_USER");

  const resumed = await harness.page.evaluate(() => window.__sequenceRunner.resume());
  expect(resumed).toBeTruthy();
  await harness.waitForState("DONE", 5000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe("תמשיך לשלב הבא");
});

test("exact repeated ordinary responses trip the stagnation circuit breaker", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "אותה תשובה ללא התקדמות" },
      { type: "normal", text: "אותה תשובה ללא התקדמות" },
      { type: "normal", text: "אותה תשובה ללא התקדמות" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("STALLED", 5000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(3);
  expect(sent.slice(1)).toEqual(["תמשיך לשלב הבא", "תמשיך לשלב הבא"]);

  const state = await harness.runnerState();
  expect(state.waitingForUser?.reason).toBe("stagnation");
});

test("hard continuation fuse pauses a varied runaway sequence", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: Array.from({ length: 8 }, (_, index) => ({
      type: "normal",
      text: `תגובה משתנה ${index + 1}`
    }))
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("SAFETY_PAUSED", 5000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(5);
  expect(sent[0]).not.toBe("תמשיך לשלב הבא");
  expect(sent.slice(1)).toEqual(Array(4).fill("תמשיך לשלב הבא"));

  const state = await harness.runnerState();
  expect(state.waitingForUser?.reason).toBe("runaway-fuse");
});

test("wait marker is recognized only as the final non-empty line", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "ממתין לך\nאבל עדיין אפשר להתקדם" },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe("תמשיך לשלב הבא");
});
