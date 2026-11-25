import { test, expect } from "./fixture.js";

const requestText = "הגענו לסף ההודעות";
const handoff = [
  "סיימתי",
  "[[SEQUENCE_RUNNER_NEW_CHAT]]",
  "בשלב זה מומלץ לעבור לצ'אט חדש.",
  "[[NEXT_CHAT_PROMPT]]",
  "NEXT_CHECKPOINT",
  "[[/NEXT_CHAT_PROMPT]]",
  "[[/SEQUENCE_RUNNER_NEW_CHAT]]"
].join("\n");

test("message rollover requests a saved checkpoint at the boundary in each fresh chat", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "First checkpoint" },
      { type: "normal", text: handoff },
      { type: "normal", text: "Second checkpoint" },
      { type: "normal", text: handoff },
      { type: "normal", text: "סיימתי" }
    ]
  });
  await harness.page.evaluate(() => {
    window.__sequenceRunner.setChatRolloverLimit(2);
    return window.__sequenceRunner.startExistingContext();
  });
  await harness.waitForState("DONE", 8000);
  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(5);
  expect(sent[0]).not.toContain(requestText);
  expect(sent[1]).toContain(requestText);
  expect(sent[1]).toContain("מקור האמת");
  expect(sent[2]).toContain("NEXT_CHECKPOINT");
  expect(sent[3]).toContain(requestText);
  expect(sent[4]).toContain("NEXT_CHECKPOINT");
  const state = await harness.runnerState();
  expect(state.handoffCount).toBe(2);
  expect(state.chatRollover.limit).toBe(2);
  expect(state.chatRollover.requested).toBe(false);
});

test("true completion wins over the message threshold", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({ responses: [{ type: "normal", text: "סיימתי" }] });
  await harness.page.evaluate(() => {
    window.__sequenceRunner.setChatRolloverLimit(2);
    return window.__sequenceRunner.startExistingContext();
  });
  await harness.waitForState("DONE");
  expect(await harness.sentMessages()).toHaveLength(1);
});

test("missing handoff after a rollover request stops instead of repeatedly sending", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "Checkpoint" },
      { type: "normal", text: "No handoff returned" }
    ]
  });
  await harness.page.evaluate(() => {
    window.__sequenceRunner.setChatRolloverLimit(2);
    return window.__sequenceRunner.startExistingContext();
  });
  await harness.waitForState("ERROR");
  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toContain(requestText);
  expect((await harness.events()).some(event => event.type === "new-chat-click")).toBe(false);
});

test("hidden retained turns do not trigger an early rollover; empty setting disables it", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "Checkpoint" },
      { type: "normal", text: "סיימתי" }
    ]
  });
  await harness.page.evaluate(() => {
    const hidden = document.createElement("article");
    hidden.setAttribute("data-turn-key", "hidden-retained");
    hidden.style.display = "none";
    hidden.innerHTML = '<div data-user-message-bubble="true">Old user</div><div data-markdown-text-style="assistant-message">Old assistant</div>';
    document.querySelector("#conversation").append(hidden);
    window.__sequenceRunner.setChatRolloverLimit(3);
    return window.__sequenceRunner.startExistingContext();
  });
  await harness.waitForState("DONE");
  const sent = await harness.sentMessages();
  expect(sent[1]).toBe("תמשיך לשלב הבא");
  await harness.page.evaluate(() => window.__sequenceRunner.restart());
  expect((await harness.runnerState()).chatRollover.limit).toBeNull();
});

test("explicit run limit takes precedence over count-based rollover", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({ responses: [{ type: "normal", text: "Checkpoint" }] });
  await harness.page.evaluate(() => {
    window.__sequenceRunner.setChatRolloverLimit(2);
    window.__sequenceRunner.setAbsoluteStepLimit(1);
    return window.__sequenceRunner.startExistingContext();
  });
  await harness.waitForState("STOPPED");
  expect(await harness.sentMessages()).toHaveLength(1);
});
