import { test, expect } from "./fixture.js";

const DEFAULT_WAKE_MESSAGE =
  "לוקח לך הרבה זמן, הכל בסדר? אם העבודה גדולה מדי, אתה יכול לחלק אותה ולהמשיך בהודעה נוספת.";
const DEFAULT_SPLIT_MESSAGE =
  "העבודה הזו מתארכת יותר מדי לתשובה אחת. עצור בנקודת checkpoint בטוחה: סיים ואמת רק את המקטע הנוכחי. אם מה שנשאר גדול, חלק אותו למקטעים לפי התכנון, סכם בקצרה מה הושלם ומה המקטע הבא, ואז עצור וחכה ל'תמשיך לשלב הבא'. אל תתחיל את המקטע הבא באותה תשובה.";

async function installRunnerClock(harness) {
  await harness.page.evaluate(() => {
    const realDateNow = Date.now.bind(Date);
    window.__composerTransactionClockOffsetMs = 0;
    Date.now = () => realDateNow() + window.__composerTransactionClockOffsetMs;
  });
}

async function advanceRunnerClock(harness, offsetMs) {
  await harness.page.evaluate((value) => {
    window.__composerTransactionClockOffsetMs = value;
  }, offsetMs);
}

async function waitForTrackedGeneration(harness) {
  await expect.poll(
    () => harness.page.evaluate(() => {
      const cycle = window.__sequenceRunner.getState().currentCycle;
      return !!cycle?.turnKey && !!document.querySelector('button[aria-label="Stop"]');
    })
  ).toBeTruthy();
}

async function disableSendButton(harness) {
  await harness.page.evaluate(() => {
    const button = document.querySelector('form[data-chatgpt-composer] button[aria-label="Send"]');
    if (!button) {
      throw new Error("Mock Send button not found");
    }
    button.disabled = true;
  });
}

async function enableSendButton(harness) {
  await harness.page.evaluate(() => {
    const button = document.querySelector('form[data-chatgpt-composer] button[aria-label="Send"]');
    if (!button) {
      throw new Error("Mock Send button not found");
    }
    button.disabled = false;
  });
}

test("normal Runner send timeout rolls back only the text it inserted", async ({ harness }) => {
  await harness.load();
  await disableSendButton(harness);

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("ERROR", 5000);

  const mockState = await harness.page.evaluate(() => window.__mockChatGPT.getState());
  expect(mockState.composerText).toBe("");
  expect(await harness.sentMessages()).toEqual([]);

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some(
    (entry) => entry.event === "composer-write-rolled-back" && entry.reason === "send-button-unavailable"
  )).toBeTruthy();
});

test("explicit immediate-send timeout rolls back Runner-owned text and never clicks Stop", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({ responses: [{ type: "hold" }] });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await waitForTrackedGeneration(harness);
  await disableSendButton(harness);

  const result = await harness.page.evaluate(async () => {
    try {
      await window.__sequenceRunner.sendMessageImmediately("IMMEDIATE_TIMEOUT");
      return { error: null };
    } catch (error) {
      return { error: error?.message || String(error) };
    }
  });

  expect(result.error).toContain("Send button did not become available");
  const mockState = await harness.page.evaluate(() => window.__mockChatGPT.getState());
  expect(mockState.composerText).toBe("");
  expect(await harness.sentMessages()).toHaveLength(1);

  const events = await harness.events();
  expect(events.some((event) => event.type === "stop-click")).toBeFalsy();

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some(
    (entry) => entry.event === "composer-write-rolled-back" && entry.source === "user-immediate"
  )).toBeTruthy();

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});

test("failed automatic wake cannot strand its own text or block the next continuation", async ({ harness }) => {
  await harness.load();
  await installRunnerClock(harness);
  await harness.setScenario({
    responses: [
      { type: "normal", text: "Checkpoint complete.", finishDelayMs: 700 },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() =>
    window.__sequenceRunner.startExistingContext(
      "steady",
      "autonomous",
      false,
      10,
      undefined,
      20
    )
  );
  await waitForTrackedGeneration(harness);
  await disableSendButton(harness);
  await advanceRunnerClock(harness, 10 * 60 * 1000 + 1000);

  await expect.poll(
    () => harness.page.evaluate(() => window.__sequenceRunner.getLog().some(
      (entry) => entry.event === "long-wait-wake-failed"
    )),
    { timeout: 5000 }
  ).toBeTruthy();

  const logAfterFailure = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(logAfterFailure.some(
    (entry) =>
      entry.event === "composer-write-rolled-back" &&
      entry.source === "long-wait-wake" &&
      entry.reason === "send-button-unavailable"
  )).toBeTruthy();

  await enableSendButton(harness);
  await harness.waitForState("DONE", 5000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe("תמשיך לשלב הבא");
  expect(sent).not.toContain(DEFAULT_WAKE_MESSAGE);

  const finalMockState = await harness.page.evaluate(() => window.__mockChatGPT.getState());
  expect(finalMockState.composerText).toBe("");

  const events = await harness.events();
  expect(events.some((event) => event.type === "stop-click")).toBeFalsy();
});

test("failed automatic split rolls back its own composer text and keeps generation intact", async ({ harness }) => {
  await harness.load();
  await installRunnerClock(harness);
  await harness.setScenario({ responses: [{ type: "hold" }] });

  await harness.page.evaluate(() =>
    window.__sequenceRunner.startExistingContext(
      "steady",
      "autonomous",
      false,
      20,
      undefined,
      10
    )
  );
  await waitForTrackedGeneration(harness);
  await disableSendButton(harness);
  await advanceRunnerClock(harness, 10 * 60 * 1000 + 1000);

  await expect.poll(
    () => harness.page.evaluate(() => window.__sequenceRunner.getLog().some(
      (entry) => entry.event === "long-wait-split-failed"
    )),
    { timeout: 5000 }
  ).toBeTruthy();

  const mockState = await harness.page.evaluate(() => window.__mockChatGPT.getState());
  expect(mockState.composerText).toBe("");
  expect(await harness.sentMessages()).toHaveLength(1);
  expect(await harness.sentMessages()).not.toContain(DEFAULT_SPLIT_MESSAGE);

  const events = await harness.events();
  expect(events.some((event) => event.type === "stop-click")).toBeFalsy();

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});

test("a user draft that appears during Runner insertion is preserved instead of being cleared", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({ responses: [{ type: "hold" }] });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await waitForTrackedGeneration(harness);

  await harness.page.evaluate(() => {
    const composer = document.querySelector('form[data-chatgpt-composer] [contenteditable="true"][data-composer-markdown]');
    if (!composer) {
      throw new Error("Mock composer not found");
    }

    composer.addEventListener(
      "paste",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        setTimeout(() => {
          window.__mockChatGPT.setComposerText("USER_DRAFT_DURING_INSERT");
        }, 20);
      },
      { capture: true, once: true }
    );
  });

  const result = await harness.page.evaluate(async () => {
    try {
      await window.__sequenceRunner.sendMessageImmediately("RUNNER_IMMEDIATE_TEXT");
      return { error: null };
    } catch (error) {
      return {
        error: error?.message || String(error),
        code: error?.code || null
      };
    }
  });

  expect(result.code).toBe("COMPOSER_CHANGED_DURING_INSERT");
  const mockState = await harness.page.evaluate(() => window.__mockChatGPT.getState());
  expect(mockState.composerText).toBe("USER_DRAFT_DURING_INSERT");
  expect(await harness.sentMessages()).toHaveLength(1);

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some(
    (entry) => entry.event === "composer-write-conflict" && entry.source === "user-immediate"
  )).toBeTruthy();

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});
