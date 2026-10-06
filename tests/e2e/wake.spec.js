import { test, expect } from "./fixture.js";

const DEFAULT_WAKE_MESSAGE =
  "לוקח לך הרבה זמן, הכל בסדר? אם העבודה גדולה מדי, אתה יכול לחלק אותה ולהמשיך בהודעה נוספת.";

async function installWakeClock(harness) {
  await harness.page.evaluate(() => {
    const realDateNow = Date.now.bind(Date);
    window.__wakeClockOffsetMs = 0;
    window.__wakeRealDateNow = realDateNow;
    Date.now = () => realDateNow() + window.__wakeClockOffsetMs;
  });
}

async function advanceWakeClock(harness, offsetMs) {
  await harness.page.evaluate((value) => {
    window.__wakeClockOffsetMs = value;
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

test("start panel exposes configurable wake defaults and presets", async ({ harness }) => {
  await harness.load();

  const config = await harness.page.evaluate(() => {
    const delay = document.querySelector('[data-input="wake-after-minutes"]');
    const preset = document.querySelector('[data-input="wake-message-preset"]');
    const message = document.querySelector('[data-input="wake-message"]');

    return {
      delay: delay?.value || null,
      delayOptions: delay ? [...delay.options].map((option) => option.value) : [],
      preset: preset?.value || null,
      presetOptions: preset ? [...preset.options].map((option) => option.value) : [],
      message: message?.value || null
    };
  });

  expect(config.delay).toBe("5");
  expect(config.delayOptions).toEqual(
    Array.from({ length: 20 }, (_, index) => String(index + 1))
  );
  expect(config.preset).toBe("supportive");
  expect(config.presetOptions).toEqual(["supportive", "short", "custom"]);
  expect(config.message).toBe(DEFAULT_WAKE_MESSAGE);

  await harness.page.selectOption('[data-input="wake-message-preset"]', "short");
  await expect(harness.page.locator('[data-input="wake-message"]')).toHaveValue("מה קורה?");

  await harness.page.selectOption('[data-input="wake-message-preset"]', "supportive");
  await expect(harness.page.locator('[data-input="wake-message"]')).toHaveValue(DEFAULT_WAKE_MESSAGE);
});

test("edited wake delay and message are used for the active response", async ({ harness }) => {
  await harness.load();
  await installWakeClock(harness);
  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });

  await harness.page.selectOption('[data-input="wake-after-minutes"]', "2");
  await harness.page.locator('[data-input="wake-message"]').fill("בדיקת התקדמות מותאמת");
  await expect(harness.page.locator('[data-input="wake-message-preset"]')).toHaveValue("custom");
  await harness.page.click('[data-action="start-run"]');
  await waitForTrackedGeneration(harness);

  await advanceWakeClock(harness, 2 * 60 * 1000 + 1000);
  await harness.waitForSentCount(2);

  const sent = await harness.sentMessages();
  expect(sent[1]).toBe("בדיקת התקדמות מותאמת");

  const state = await harness.page.evaluate(() => window.__sequenceRunner.getState());
  expect(state.longWaitWake).toEqual({
    afterMinutes: 2,
    message: "בדיקת התקדמות מותאמת"
  });

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});

test("response that completes before five minutes is never nudged", async ({ harness }) => {
  await harness.load();
  await installWakeClock(harness);
  await harness.setScenario({
    responses: [{ type: "normal", text: "סיימתי", finishDelayMs: 120 }]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  expect(await harness.sentMessages()).toHaveLength(1);
  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "long-wait-wake-sent")).toBeFalsy();
});

test("same active response is nudged once after five minutes without clicking Stop", async ({ harness }) => {
  await harness.load();
  await installWakeClock(harness);
  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await waitForTrackedGeneration(harness);

  await advanceWakeClock(harness, 5 * 60 * 1000 + 1000);
  await harness.waitForSentCount(2);

  await new Promise((resolve) => setTimeout(resolve, 120));

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe(DEFAULT_WAKE_MESSAGE);
  expect(sent).not.toContain("תמשיך לשלב הבא");

  const events = await harness.events();
  expect(events.some((event) => event.type === "stop-click")).toBeFalsy();

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.filter((entry) => entry.event === "long-wait-wake-threshold")).toHaveLength(1);
  expect(log.filter((entry) => entry.event === "long-wait-wake-sent")).toHaveLength(1);

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});

test("wake inserts text before requiring Send while generation is active", async ({ harness }) => {
  await harness.load();
  await installWakeClock(harness);
  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await waitForTrackedGeneration(harness);

  await harness.page.evaluate(() => {
    const composer = document.querySelector('[contenteditable="true"][data-composer-markdown]');
    const sendButton = document.querySelector('button[aria-label="Send"]');

    if (!composer || !sendButton) {
      throw new Error("Mock composer/send controls not found");
    }

    sendButton.disabled = true;

    composer.addEventListener("input", () => {
      const text = String(composer.innerText || composer.textContent || "").trim();
      if (text) {
        sendButton.disabled = false;
      }
    });
  });

  await advanceWakeClock(harness, 5 * 60 * 1000 + 1000);
  await harness.waitForSentCount(2);

  const sent = await harness.sentMessages();
  expect(sent[1]).toBe(DEFAULT_WAKE_MESSAGE);

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some(
    (entry) => entry.event === "long-wait-wake-deferred" && entry.reason === "send-unavailable"
  )).toBeFalsy();
  expect(log.filter((entry) => entry.event === "long-wait-wake-sent")).toHaveLength(1);

  const events = await harness.events();
  expect(events.some((event) => event.type === "stop-click")).toBeFalsy();

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});

test("wake eligibility resets for the next tracked Assistant response", async ({ harness }) => {
  await harness.load();
  await installWakeClock(harness);
  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }, { type: "hold" }] });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await waitForTrackedGeneration(harness);

  await advanceWakeClock(harness, 5 * 60 * 1000 + 1000);
  await harness.waitForSentCount(2);

  await expect.poll(
    () => harness.page.evaluate(() => window.__sequenceRunner.getState().currentCycle?.id)
  ).toBe(2);
  await waitForTrackedGeneration(harness);

  await advanceWakeClock(harness, 10 * 60 * 1000 + 2000);
  await harness.waitForSentCount(3);

  const sent = await harness.sentMessages();
  expect(sent.slice(1)).toEqual([DEFAULT_WAKE_MESSAGE, DEFAULT_WAKE_MESSAGE]);

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.filter((entry) => entry.event === "long-wait-wake-sent")).toHaveLength(2);

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});

test("occupied composer defers the wake without overwriting user text", async ({ harness }) => {
  await harness.load();
  await installWakeClock(harness);
  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await waitForTrackedGeneration(harness);

  await harness.page.evaluate(() => window.__mockChatGPT.setComposerText("USER_DRAFT"));
  await advanceWakeClock(harness, 5 * 60 * 1000 + 1000);

  await expect.poll(
    () => harness.page.evaluate(() => window.__sequenceRunner.getLog().some(
      (entry) => entry.event === "long-wait-wake-deferred"
    ))
  ).toBeTruthy();

  expect(await harness.sentMessages()).toHaveLength(1);
  const draft = await harness.page.evaluate(() => window.__mockChatGPT.getState().composerText);
  expect(draft).toBe("USER_DRAFT");

  await harness.page.evaluate(() => window.__mockChatGPT.setComposerText(""));
  await harness.waitForSentCount(2);

  const sent = await harness.sentMessages();
  expect(sent[1]).toBe(DEFAULT_WAKE_MESSAGE);

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});
