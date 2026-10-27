import { test, expect } from "./fixture.js";

test("due intermediate message takes precedence over completion at the same boundary", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "סיימתי", finishDelayMs: 120 },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.page.evaluate(() => window.__sequenceRunner.queueMessage("INTERMEDIATE_UPDATE", 0));

  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe("INTERMEDIATE_UPDATE");

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "completion-marker-deferred-for-injection")).toBeTruthy();
});

test("scheduled intermediate message is sent after the requested number of completed responses", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "response one" },
      { type: "normal", text: "response two" },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.page.evaluate(() => window.__sequenceRunner.queueMessage("AFTER_TWO_RESPONSES", 2));

  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(3);
  expect(sent[1]).toBe("תמשיך לשלב הבא");
  expect(sent[2]).toBe("AFTER_TWO_RESPONSES");
});

test("immediate intermediate message sends while Stop is visible without clicking Stop", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "hold" },
      { type: "hold" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());

  await expect.poll(
    () => harness.page.locator('button[aria-label="Stop"]').count()
  ).toBe(1);

  await harness.page.evaluate(() => window.__sequenceRunner.sendMessageImmediately("URGENT_UPDATE"));
  await harness.waitForSentCount(2);

  const events = await harness.events();
  const sends = events.filter((event) => event.type === "send");
  expect(sends).toHaveLength(2);
  expect(sends[1].text).toBe("URGENT_UPDATE");
  expect(sends[1].stopVisible).toBeTruthy();
  expect(events.some((event) => event.type === "stop-click")).toBeFalsy();

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});

test("immediate message remains trackable when ChatGPT reuses the active turn key", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "hold" },
      {
        type: "normal",
        text: "סיימתי",
        wrapper: "search-unit",
        replaceActiveGeneration: true
      }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());

  await expect.poll(
    () => harness.page.locator('button[aria-label="Stop"]').count()
  ).toBe(1);

  await harness.page.evaluate(() => {
    const sendButton = document.querySelector(
      'form[data-chatgpt-composer] button[aria-label="Send"]'
    );

    if (!sendButton) {
      throw new Error("Mock Send button not found.");
    }

    const reuseActiveTurnKey = () => {
      const turns = [...document.querySelectorAll("[data-turn-key]")];
      if (turns.length < 2) {
        throw new Error("Expected the immediate send to create a second mock turn.");
      }

      const previousTurn = turns.at(-2);
      const latestTurn = turns.at(-1);
      const reusedTurnKey = previousTurn.getAttribute("data-turn-key");

      latestTurn.setAttribute("data-turn-key", reusedTurnKey);

      const userMessage = latestTurn.querySelector('[data-user-message-bubble="true"]');
      if (userMessage) {
        const userUnit = document.createElement("div");
        userUnit.setAttribute(
          "data-content-search-unit-key",
          `${reusedTurnKey}:3:user`
        );
        userMessage.before(userUnit);
        userUnit.appendChild(userMessage);
      }

      const observer = new MutationObserver(() => {
        const assistantUnit = latestTurn.querySelector(
          '[data-content-search-unit-key$=":assistant"]'
        );
        if (!assistantUnit) {
          return;
        }

        assistantUnit.setAttribute(
          "data-content-search-unit-key",
          `${reusedTurnKey}:4:assistant`
        );

        const selection = assistantUnit.querySelector(
          "[data-chatgpt-selection-message-id]"
        );
        selection?.setAttribute(
          "data-chatgpt-selection-message-id",
          `${reusedTurnKey}:4:assistant-message`
        );
        observer.disconnect();
      });

      observer.observe(latestTurn, {
        subtree: true,
        childList: true
      });

      sendButton.removeEventListener("click", reuseActiveTurnKey);
    };

    sendButton.addEventListener("click", reuseActiveTurnKey);
  });

  await harness.page.evaluate(() =>
    window.__sequenceRunner.sendMessageImmediately("URGENT_SAME_TURN")
  );
  await harness.waitForSentCount(2);
  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe("URGENT_SAME_TURN");

  const events = await harness.events();
  expect(events.some((event) => event.type === "stop-click")).toBeFalsy();

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(
    log.some(
      (entry) =>
        entry.event === "response-complete" &&
        entry.id === 2 &&
        entry.done === true
    )
  ).toBeTruthy();
});

test("queued-message CRUD and same-boundary ordering remain deterministic", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({ responses: [{ type: "hold" }] });
  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());

  const ids = await harness.page.evaluate(() => {
    const first = window.__sequenceRunner.queueMessage("FIRST", 3);
    const second = window.__sequenceRunner.queueMessage("SECOND", 3);
    const third = window.__sequenceRunner.queueMessage("THIRD", 5);
    return { first, second, third };
  });

  await harness.page.evaluate(({ first, second, third }) => {
    window.__sequenceRunner.updateQueuedMessage(first, "FIRST_UPDATED", 3);
    window.__sequenceRunner.moveQueuedMessage(second, "up");
    window.__sequenceRunner.deleteQueuedMessage(third);
  }, ids);

  const queued = await harness.page.evaluate(() => window.__sequenceRunner.getQueuedMessages());
  expect(queued).toHaveLength(2);
  expect(queued.map((item) => item.text)).toEqual(["SECOND", "FIRST_UPDATED"]);
  expect(queued.every((item) => item.remainingResponses === 3)).toBeTruthy();

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});
