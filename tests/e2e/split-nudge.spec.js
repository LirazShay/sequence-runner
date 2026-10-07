import { test, expect } from "./fixture.js";

const DEFAULT_WAKE_MESSAGE =
  "לוקח לך הרבה זמן, הכל בסדר? אם העבודה גדולה מדי, אתה יכול לחלק אותה ולהמשיך בהודעה נוספת.";

const DEFAULT_SPLIT_MESSAGE =
  "העבודה הזו מתארכת יותר מדי לתשובה אחת. עצור בנקודת checkpoint בטוחה: סיים ואמת רק את המקטע הנוכחי. אם מה שנשאר גדול, חלק אותו למקטעים לפי התכנון, סכם בקצרה מה הושלם ומה המקטע הבא, ואז עצור וחכה ל'תמשיך לשלב הבא'. אל תתחיל את המקטע הבא באותה תשובה.";

const SHORT_SPLIT_MESSAGE =
  "פצל את העבודה עכשיו: סיים checkpoint בטוח, סכם מה הושלם ומה הבא, עצור, והמשך רק אחרי 'תמשיך לשלב הבא'.";

async function installClock(harness) {
  await harness.page.evaluate(() => {
    const realDateNow = Date.now.bind(Date);
    window.__longWorkClockOffsetMs = 0;
    Date.now = () => realDateNow() + window.__longWorkClockOffsetMs;
  });
}

async function advanceClock(harness, offsetMs) {
  await harness.page.evaluate((value) => {
    window.__longWorkClockOffsetMs = value;
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

test("start panel exposes configurable split defaults and presets", async ({ harness }) => {
  await harness.load();

  const config = await harness.page.evaluate(() => {
    const delay = document.querySelector('[data-input="split-after-minutes"]');
    const preset = document.querySelector('[data-input="split-message-preset"]');
    const message = document.querySelector('[data-input="split-message"]');

    return {
      delay: delay?.value || null,
      delayOptions: delay ? [...delay.options].map((option) => option.value) : [],
      preset: preset?.value || null,
      presetOptions: preset ? [...preset.options].map((option) => option.value) : [],
      message: message?.value || null
    };
  });

  expect(config.delay).toBe("10");
  expect(config.delayOptions).toEqual(
    Array.from({ length: 20 }, (_, index) => String(index + 1))
  );
  expect(config.preset).toBe("split");
  expect(config.presetOptions).toEqual(["split", "short", "custom"]);
  expect(config.message).toBe(DEFAULT_SPLIT_MESSAGE);

  await harness.page.selectOption('[data-input="split-message-preset"]', "short");
  await expect(harness.page.locator('[data-input="split-message"]')).toHaveValue(SHORT_SPLIT_MESSAGE);

  await harness.page.selectOption('[data-input="split-message-preset"]', "split");
  await expect(harness.page.locator('[data-input="split-message"]')).toHaveValue(DEFAULT_SPLIT_MESSAGE);
});

test("custom split delay and message are used for the active work", async ({ harness }) => {
  await harness.load();
  await installClock(harness);
  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });

  await harness.page.selectOption('[data-input="wake-after-minutes"]', "20");
  await harness.page.selectOption('[data-input="split-after-minutes"]', "2");
  await harness.page.locator('[data-input="split-message"]').fill("CUSTOM_SPLIT_NOW");
  await harness.page.click('[data-action="start-run"]');
  await waitForTrackedGeneration(harness);

  await advanceClock(harness, 2 * 60 * 1000 + 1000);
  await harness.waitForSentCount(2);

  const sent = await harness.sentMessages();
  expect(sent[1]).toBe("CUSTOM_SPLIT_NOW");

  const state = await harness.page.evaluate(() => window.__sequenceRunner.getState());
  expect(state.longWaitSplit.afterMinutes).toBe(2);
  expect(state.longWaitSplit.message).toBe("CUSTOM_SPLIT_NOW");
  expect(state.longWaitSplit.state).toBe("sent");

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.filter((entry) => entry.event === "long-wait-split-sent")).toHaveLength(1);
  expect(log.some((entry) => entry.event === "long-wait-wake-sent")).toBeFalsy();

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});

test("five-minute wake does not restart the ten-minute split clock", async ({ harness }) => {
  await harness.load();
  await installClock(harness);
  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }, { type: "hold" }] });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await waitForTrackedGeneration(harness);

  await advanceClock(harness, 5 * 60 * 1000 + 1000);
  await harness.waitForSentCount(2);

  let sent = await harness.sentMessages();
  expect(sent[1]).toBe(DEFAULT_WAKE_MESSAGE);

  await expect.poll(
    () => harness.page.evaluate(() => window.__sequenceRunner.getState().currentCycle?.label)
  ).toBe("wake");
  await waitForTrackedGeneration(harness);

  await advanceClock(harness, 10 * 60 * 1000 + 1000);
  await harness.waitForSentCount(3);

  sent = await harness.sentMessages();
  expect(sent[2]).toBe(DEFAULT_SPLIT_MESSAGE);

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.filter((entry) => entry.event === "long-wait-wake-sent")).toHaveLength(1);
  expect(log.filter((entry) => entry.event === "long-wait-split-sent")).toHaveLength(1);

  const events = await harness.events();
  expect(events.some((event) => event.type === "stop-click")).toBeFalsy();

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});

test("split escalation can precede wake and suppresses the weaker nudge", async ({ harness }) => {
  await harness.load();
  await installClock(harness);
  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });

  await harness.page.selectOption('[data-input="wake-after-minutes"]', "5");
  await harness.page.selectOption('[data-input="split-after-minutes"]', "2");
  await harness.page.click('[data-action="start-run"]');
  await waitForTrackedGeneration(harness);

  await advanceClock(harness, 6 * 60 * 1000);
  await harness.waitForSentCount(2);
  await new Promise((resolve) => setTimeout(resolve, 120));

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe(DEFAULT_SPLIT_MESSAGE);

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.filter((entry) => entry.event === "long-wait-split-sent")).toHaveLength(1);
  expect(log.some((entry) => entry.event === "long-wait-wake-sent")).toBeFalsy();

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});

test("occupied composer defers split without overwriting user text", async ({ harness }) => {
  await harness.load();
  await installClock(harness);
  await harness.setScenario({ responses: [{ type: "hold" }, { type: "hold" }] });

  await harness.page.selectOption('[data-input="wake-after-minutes"]', "20");
  await harness.page.selectOption('[data-input="split-after-minutes"]', "2");
  await harness.page.click('[data-action="start-run"]');
  await waitForTrackedGeneration(harness);

  await harness.page.evaluate(() => window.__mockChatGPT.setComposerText("USER_DRAFT"));
  await advanceClock(harness, 2 * 60 * 1000 + 1000);

  await expect.poll(
    () => harness.page.evaluate(() => window.__sequenceRunner.getLog().some(
      (entry) => entry.event === "long-wait-split-deferred"
    ))
  ).toBeTruthy();

  expect(await harness.sentMessages()).toHaveLength(1);
  expect(await harness.page.evaluate(() => window.__mockChatGPT.getState().composerText)).toBe("USER_DRAFT");

  await harness.page.evaluate(() => window.__mockChatGPT.setComposerText(""));
  await harness.waitForSentCount(2);

  const sent = await harness.sentMessages();
  expect(sent[1]).toBe(DEFAULT_SPLIT_MESSAGE);

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});
