import { test, expect } from "./fixture.js";

function handoffResponse(nextPrompt = "NEXT_TASK_POINTER") {
  return [
    "Current chat segment is complete.",
    "סיימתי",
    "[[SEQUENCE_RUNNER_NEW_CHAT]]",
    "בשלב זה מומלץ לעבור לצ'אט חדש.",
    "[[NEXT_CHAT_PROMPT]]",
    nextPrompt,
    "[[/NEXT_CHAT_PROMPT]]",
    "[[/SEQUENCE_RUNNER_NEW_CHAT]]"
  ].join("\n");
}

test("valid handoff opens a fresh regular chat and continues with a wrapped new-task prompt", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    navigationClearDelayMs: 250,
    responses: [
      { type: "normal", text: handoffResponse("CONTINUE_FROM_SOURCE_OF_TRUTH") },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toContain("CONTINUE_FROM_SOURCE_OF_TRUTH");
  expect(sent[1]).toContain("זו המשימה שעליך לבצע כעת:");
  expect(sent[1]).toContain("[[SEQUENCE_RUNNER_NEW_CHAT]]");

  const state = await harness.runnerState();
  expect(state.handoffCount).toBe(1);

  const events = await harness.events();
  const click = events.find((event) => event.type === "new-chat-click");
  const ready = events.find((event) => event.type === "new-chat-ready");
  const sends = events.filter((event) => event.type === "send");

  expect(click?.kind).toBe("regular");
  expect(ready).toBeTruthy();
  expect(sends).toHaveLength(2);
  expect(ready.at).toBeGreaterThanOrEqual(click.at);
  expect(sends[1].at).toBeGreaterThanOrEqual(ready.at);
});

test("project handoff uses the exact project New Chat action and stays in the project route", async ({ harness }) => {
  await harness.load("http://mock.local/g/g-p-mock/c/start");
  await harness.setScenario({
    responses: [
      { type: "normal", text: handoffResponse("PROJECT_NEXT_TASK") },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const events = await harness.events();
  const click = events.find((event) => event.type === "new-chat-click");
  expect(click?.kind).toBe("project");

  const mockState = await harness.page.evaluate(() => window.__mockChatGPT.getState());
  expect(mockState.path).toMatch(/^\/g\/g-p-mock\/c\/mock-chat-/);
});

test("Deep work style and Collaborative decision mode persist across automatic handoff", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: handoffResponse("DEEP_NEXT_TASK") },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext("deep", "collaborative"));
  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);

  for (const prompt of sent) {
    expect(prompt).toContain("התקדם שלב משמעותי אחד");
    expect(prompt).toContain("קבע נקודות מעבר טבעיות");
    expect(prompt).toContain("מה הצ'אט הנוכחי צריך לסיים ומה הצ'אט הבא אמור לקחת");
    expect(prompt).toContain("במצב Collaborative");
    expect(prompt).toContain("חכה להכרעת המשתמש");
  }

  expect(sent[1]).toContain("DEEP_NEXT_TASK");
  const state = await harness.runnerState();
  expect(state.workStyle).toBe("deep");
  expect(state.decisionMode).toBe("collaborative");
});

test("malformed handoff stops with an explicit error instead of silently continuing", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      {
        type: "normal",
        text: [
          "[[SEQUENCE_RUNNER_NEW_CHAT]]",
          "[[NEXT_CHAT_PROMPT]]",
          "BROKEN_HANDOFF",
          "[[/NEXT_CHAT_PROMPT]]"
        ].join("\n")
      }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("ERROR");

  const events = await harness.events();
  expect(events.some((event) => event.type === "new-chat-click")).toBeFalsy();

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  const error = log.findLast((entry) => entry.event === "error");
  expect(error?.message).toContain("Invalid new-chat handoff response");
});
