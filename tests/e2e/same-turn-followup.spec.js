import { test, expect } from "./fixture.js";

test("immediate follow-up tracks assistant units appended inside the existing turn", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [{ type: "hold" }]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());

  await expect.poll(
    () => harness.page.locator('button[aria-label="Stop"]').count()
  ).toBe(1);

  await harness.page.evaluate(() => {
    const sendButton = document.querySelector('button[aria-label="Send"]');
    const composer = document.querySelector('[contenteditable="true"][data-composer-markdown]');
    const conversation = document.querySelector("#conversation");
    const thinkingControls = document.querySelector("#thinking-controls");

    if (!sendButton || !composer || !conversation || !thinkingControls) {
      throw new Error("Mock ChatGPT controls were not found");
    }

    const appendConversationUnit = (turn, role, index, text) => {
      const turnKey = turn.getAttribute("data-turn-key");
      const unitKey = `${turnKey}:${index}:${role}`;

      const outer = document.createElement("div");
      outer.setAttribute("data-chatgpt-search-unit-key", unitKey);

      const inner = document.createElement("div");
      inner.setAttribute("data-content-search-unit-key", unitKey);

      if (role === "user") {
        const bubble = document.createElement("div");
        bubble.setAttribute("data-user-message-bubble", "true");
        bubble.textContent = text;
        inner.appendChild(bubble);
      } else {
        const selection = document.createElement("div");
        selection.setAttribute(
          "data-chatgpt-selection-message-id",
          `${unitKey}:message`
        );
        selection.textContent = text;
        inner.appendChild(selection);
      }

      outer.appendChild(inner);
      turn.appendChild(outer);
      return unitKey;
    };

    sendButton.addEventListener(
      "click",
      (event) => {
        const text = String(composer.innerText || composer.textContent || "").trim();
        if (text !== "URGENT_UPDATE") {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        const turns = [...conversation.querySelectorAll("[data-turn-key]")];
        const turn = turns.at(-1);
        if (!turn) {
          throw new Error("Tracked mock turn was not found");
        }

        window.__sameTurnRegression = {
          sentText: text,
          turnKey: turn.getAttribute("data-turn-key")
        };

        composer.textContent = "";
        composer.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "deleteContentBackward"
          })
        );

        appendConversationUnit(turn, "user", 3, text);

        // The follow-up supersedes the active generation without clicking Stop.
        thinkingControls.querySelector('button[aria-label="Stop"]')?.remove();

        setTimeout(() => {
          appendConversationUnit(turn, "assistant", 4, "סיימתי");

          const actions = document.createElement("div");
          const regenerate = document.createElement("button");
          regenerate.type = "button";
          regenerate.setAttribute("aria-label", "Regenerate response");
          actions.appendChild(regenerate);
          turn.appendChild(actions);
        }, 30);
      },
      { capture: true }
    );
  });

  await harness.page.evaluate(() =>
    window.__sequenceRunner.sendMessageImmediately("URGENT_UPDATE")
  );

  await harness.waitForState("DONE");

  const evidence = await harness.page.evaluate(() => ({
    regression: window.__sameTurnRegression,
    turnCount: document.querySelectorAll("[data-turn-key]").length,
    log: window.__sequenceRunner.getLog()
  }));

  expect(evidence.regression?.sentText).toBe("URGENT_UPDATE");
  expect(evidence.turnCount).toBe(1);
  expect(
    evidence.log.some((entry) => entry.event === "same-turn-user-unit-tracked")
  ).toBeTruthy();
  expect(
    evidence.log.some((entry) => entry.event === "same-turn-assistant-unit-tracked")
  ).toBeTruthy();
  expect(
    evidence.log.some((entry) => entry.event === "response-complete" && entry.id === 2)
  ).toBeTruthy();

  const events = await harness.events();
  expect(events.some((entry) => entry.type === "stop-click")).toBeFalsy();
});
