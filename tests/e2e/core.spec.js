import { test, expect } from "./fixture.js";

test("canonical runner completes a normal multi-step sequence", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "Step one complete." },
      { type: "normal", text: "All work complete.\nסיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[0]).toContain("בכל פעם שאכתוב 'תמשיך לשלב הבא'");
  expect(sent[1]).toBe("תמשיך לשלב הבא");
});

test("completion marker is accepted only when it is the final non-empty line", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "סיימתי\nאבל זה לא סוף התשובה" },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe("תמשיך לשלב הבא");
});

test("negative wording does not count as completion", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "עדיין לא סיימתי" },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  expect(await harness.sentMessages()).toHaveLength(2);
});

test("new-task mode embeds the task into the first runner prompt", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [{ type: "normal", text: "סיימתי" }]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startWithTask("TASK_ALPHA_123"));
  await harness.waitForState("DONE");

  const [firstPrompt] = await harness.sentMessages();
  expect(firstPrompt).toContain("זו המשימה שעליך לבצע כעת:");
  expect(firstPrompt).toContain("TASK_ALPHA_123");
  expect(firstPrompt).toContain("[[SEQUENCE_RUNNER_NEW_CHAT]]");
});

test("committed bookmarklet artifact boots the same runner in a browser", async ({ harness }) => {
  await harness.loadBookmarklet();

  const result = await harness.page.evaluate(() => ({
    version: window.__sequenceRunner.version,
    state: window.__sequenceRunner.getState().state,
    panel: !!document.querySelector("#sequence-runner-panel")
  }));

  expect(result).toEqual({
    version: "3.19",
    state: "READY_TO_START",
    panel: true
  });
});
