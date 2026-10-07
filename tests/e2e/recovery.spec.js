import { test, expect } from "./fixture.js";

const DEFAULT_WAKE_MESSAGE =
  "לוקח לך הרבה זמן, הכל בסדר? אם העבודה גדולה מדי, אתה יכול לחלק אותה ולהמשיך בהודעה נוספת.";

test("occupied composer defers automatic send and resumes after the user clears it", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({ responses: [{ type: "normal", text: "סיימתי" }] });
  await harness.page.evaluate(() => window.__mockChatGPT.setComposerText("USER_DRAFT"));

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("WAITING_FOR_COMPOSER");
  expect(await harness.sentMessages()).toHaveLength(0);

  await harness.page.evaluate(() => window.__mockChatGPT.setComposerText(""));
  await harness.waitForState("DONE");
  expect(await harness.sentMessages()).toHaveLength(1);
});

test("a deferred first contract survives an explicit immediate message", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "hold" },
      {
        type: "normal",
        replaceActiveGeneration: true,
        text: "Immediate message handled."
      },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => {
    window.__mockChatGPT.setComposerText("UNRELATED_BUSY_RESPONSE");
    document.querySelector('form[data-chatgpt-composer] button[aria-label="Send"]').click();
  });

  await expect.poll(
    () => harness.page.evaluate(() => window.__mockChatGPT.getState().activeGenerations)
  ).toBe(1);

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("WAITING_FOR_EXTERNAL_ACTIVITY");

  await harness.page.evaluate(() =>
    window.__sequenceRunner.sendMessageImmediately("MANUAL_INTERMEDIATE")
  );
  await harness.waitForState("DONE", 4000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(3);
  expect(sent[0]).toBe("UNRELATED_BUSY_RESPONSE");
  expect(sent[1]).toBe("MANUAL_INTERMEDIATE");
  expect(sent[2]).toContain("בכל פעם שאכתוב 'תמשיך לשלב הבא'");

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "pending-first-send-preserved-by-immediate-message")).toBeTruthy();
});

test("stale visible composer does not steal runner insertion from the current composer", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({ responses: [{ type: "normal", text: "סיימתי" }] });
  await harness.page.evaluate(() => window.__mockChatGPT.addStaleComposer("STALE_DRAFT"));

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const mockState = await harness.page.evaluate(() => window.__mockChatGPT.getState());
  expect(mockState.staleComposerTexts).toEqual(["STALE_DRAFT"]);

  const events = await harness.events();
  expect(events.some((event) => event.type === "stale-send-click")).toBeFalsy();
  expect(await harness.sentMessages()).toHaveLength(1);
});

test("restart fully resets a completed runner for a second task", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({ responses: [{ type: "normal", text: "סיימתי" }] });

  await harness.page.selectOption('[data-input="wake-after-minutes"]', "2");
  await harness.page.locator('[data-input="wake-message"]').fill("CUSTOM_WAKE");
  await harness.page.click('[data-action="start-run"]');
  await harness.waitForState("DONE");

  const firstRunState = await harness.runnerState();
  expect(firstRunState.longWaitWake).toEqual({
    afterMinutes: 2,
    message: "CUSTOM_WAKE"
  });

  await harness.page.evaluate(() => window.__sequenceRunner.restart());
  await harness.waitForState("READY_TO_START");

  const resetWake = await harness.page.evaluate(() => ({
    state: window.__sequenceRunner.getState().longWaitWake,
    delay: document.querySelector('[data-input="wake-after-minutes"]')?.value || null,
    preset: document.querySelector('[data-input="wake-message-preset"]')?.value || null,
    message: document.querySelector('[data-input="wake-message"]')?.value || null
  }));

  expect(resetWake).toEqual({
    state: {
      afterMinutes: 10,
      message: DEFAULT_WAKE_MESSAGE
    },
    delay: "10",
    preset: "supportive",
    message: DEFAULT_WAKE_MESSAGE
  });

  await harness.setScenario({ responses: [{ type: "normal", text: "סיימתי" }] });
  await harness.page.evaluate(() => window.__sequenceRunner.startWithTask("SECOND_TASK"));
  await harness.waitForState("DONE");

  const state = await harness.runnerState();
  expect(state.completedResponseCount).toBe(1);
  expect(state.taskMode).toBe("new");
  expect(state.longWaitWake).toEqual({
    afterMinutes: 10,
    message: DEFAULT_WAKE_MESSAGE
  });
});

test("step limit stops after the completed response and before another send", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "first response" },
      { type: "normal", text: "this must never be requested" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.setAbsoluteStepLimit(1));
  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("STOPPED");

  expect(await harness.sentMessages()).toHaveLength(1);
  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "stopped" && entry.reason === "step-limit")).toBeTruthy();
});

test("assistant search-unit fallback is accepted when the preferred markdown wrapper is absent", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", wrapper: "search-unit", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  expect(await harness.sentMessages()).toHaveLength(1);
});

test("replacing a turn DOM node with the same turn key does not lose the active cycle", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "סיימתי", replaceTurnAfterMs: 20 }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const events = await harness.events();
  expect(events.some((event) => event.type === "turn-replaced")).toBeTruthy();
});

test("final UI appearing before the last DOM mutation does not evaluate an incomplete response", async ({ harness }) => {
  // This test validates the actual production stability window, so unlike
  // ordinary deterministic E2E cases it intentionally loads canonical timing.
  await harness.loadCanonical();
  await harness.setScenario({
    responses: [
      {
        type: "normal",
        text: "Almost finished",
        tailText: "\nסיימתי",
        tailDelayMs: 180
      }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE", 5000);

  expect(await harness.sentMessages()).toHaveLength(1);
  const events = await harness.events();
  expect(events.some((event) => event.type === "assistant-tail-mutated")).toBeTruthy();
});

test("runner follows the latest post-send turn when the user sends messages while ChatGPT is working", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "hold" },
      { type: "silent" },
      {
        type: "normal",
        replaceActiveGeneration: true,
        text: "Manual messages incorporated.\nסיימתי"
      }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("GENERATING");

  await harness.page.evaluate(() => {
    window.__mockChatGPT.setComposerText("MANUAL_MESSAGE_ONE");
    document.querySelector('form[data-chatgpt-composer] button[aria-label="Send"]').click();
  });

  await expect.poll(
    () => harness.page.evaluate(() => window.__sequenceRunner.getState().currentCycle?.turnKey)
  ).toBe("mock-turn-2");

  await harness.page.evaluate(() => {
    window.__mockChatGPT.setComposerText("MANUAL_MESSAGE_TWO");
    document.querySelector('form[data-chatgpt-composer] button[aria-label="Send"]').click();
  });

  await expect.poll(
    () => harness.page.evaluate(() => window.__sequenceRunner.getState().currentCycle?.turnKey)
  ).toBe("mock-turn-3");

  await harness.waitForState("DONE");

  expect(await harness.sentMessages()).toHaveLength(3);

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) =>
    entry.event === "turn-rebound" &&
    entry.to === "mock-turn-2" &&
    entry.reason === "latest-post-send-turn"
  )).toBeTruthy();
  expect(log.some((entry) =>
    entry.event === "turn-rebound" &&
    entry.to === "mock-turn-3" &&
    entry.reason === "latest-post-send-turn"
  )).toBeTruthy();
});
