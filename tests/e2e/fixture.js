import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mockRoot = path.join(repoRoot, "tests/mock-chatgpt");

const assets = new Map([
  ["/mock-chatgpt.js", {
    body: fs.readFileSync(path.join(mockRoot, "mock-chatgpt.js")),
    contentType: "text/javascript; charset=utf-8"
  }],
  ["/mock-chatgpt.css", {
    body: fs.readFileSync(path.join(mockRoot, "mock-chatgpt.css")),
    contentType: "text/css; charset=utf-8"
  }],
  ["/runner.js", {
    body: fs.readFileSync(path.join(repoRoot, "runner.js")),
    contentType: "text/javascript; charset=utf-8"
  }]
]);

const mockHtml = fs.readFileSync(path.join(mockRoot, "index.html"));
const runnerPath = path.join(repoRoot, "runner.js");
const bookmarkletPath = path.join(repoRoot, "runner.min.js");
const canonicalRunnerSource = fs.readFileSync(runnerPath, "utf8");

function replaceSingleTiming(source, from, to) {
  const matches = source.split(from).length - 1;
  if (matches !== 1) {
    throw new Error(`Expected exactly one timing literal ${from}, found ${matches}`);
  }
  return source.replace(from, to);
}

function buildFastTestRunnerSource() {
  let source = canonicalRunnerSource;

  // The E2E lab is deterministic, so production wall-clock guards can be
  // shortened without changing runner decisions or DOM behavior under test.
  source = replaceSingleTiming(source, "HANDOFF_MIN_READY_MS: 1000", "HANDOFF_MIN_READY_MS: 20");
  source = replaceSingleTiming(source, "STABLE_MS: 900", "STABLE_MS: 120");
  source = replaceSingleTiming(source, "FAST_RESPONSE_FALLBACK_MS: 2500", "FAST_RESPONSE_FALLBACK_MS: 180");
  source = replaceSingleTiming(source, "UI_REFRESH_MS: 1000", "UI_REFRESH_MS: 50");
  source = replaceSingleTiming(source, "WATCHDOG_MS: 400", "WATCHDOG_MS: 20");
  source = replaceSingleTiming(source, "CONTINUE_DELAY_MS: 350", "CONTINUE_DELAY_MS: 10");

  return source;
}

const fastTestRunnerSource = buildFastTestRunnerSource();

async function installMockRouting(page) {
  await page.route("http://mock.local/**", async (route) => {
    const url = new URL(route.request().url());
    const asset = assets.get(url.pathname);

    if (asset) {
      await route.fulfill({
        status: 200,
        body: asset.body,
        contentType: asset.contentType,
        headers: { "cache-control": "no-store" }
      });
      return;
    }

    await route.fulfill({
      status: 200,
      body: mockHtml,
      contentType: "text/html; charset=utf-8",
      headers: { "cache-control": "no-store" }
    });
  });
}

export const test = base.extend({
  harness: async ({ page }, use) => {
    await installMockRouting(page);

    const harness = {
      page,

      async load(url = "http://mock.local/c/start") {
        await page.goto(url);
        await page.waitForFunction(() => !!window.__mockChatGPT);
        await page.addScriptTag({ content: fastTestRunnerSource });
        await page.waitForFunction(() => !!window.__sequenceRunner);
        await expect.poll(
          () => page.evaluate(() => window.__sequenceRunner.getState().state)
        ).toBe("READY_TO_START");
      },

      async loadBookmarklet(url = "http://mock.local/c/start") {
        await page.goto(url);
        await page.waitForFunction(() => !!window.__mockChatGPT);

        const bookmarklet = fs.readFileSync(bookmarkletPath, "utf8");
        const prefix = "javascript:";
        expect(bookmarklet.startsWith(prefix)).toBeTruthy();
        const decoded = decodeURIComponent(bookmarklet.slice(prefix.length));

        await page.addScriptTag({ content: decoded });
        await page.waitForFunction(() => !!window.__sequenceRunner);
        await expect.poll(
          () => page.evaluate(() => window.__sequenceRunner.getState().state)
        ).toBe("READY_TO_START");
      },

      async setScenario(config) {
        await page.evaluate((value) => {
          window.__mockChatGPT.setScenario(value);
        }, config);
      },

      async runnerState() {
        return page.evaluate(() => window.__sequenceRunner.getState());
      },

      async waitForState(expectedState, timeout = 2500) {
        await expect.poll(
          () => page.evaluate(() => window.__sequenceRunner.getState().state),
          { timeout }
        ).toBe(expectedState);
      },

      async sentMessages() {
        return page.evaluate(() => window.__mockChatGPT.getSentMessages());
      },

      async waitForSentCount(count, timeout = 2500) {
        await expect.poll(
          () => page.evaluate(() => window.__mockChatGPT.getSentMessages().length),
          { timeout }
        ).toBe(count);
      },

      async events() {
        return page.evaluate(() => window.__mockChatGPT.getEvents());
      }
    };

    await use(harness);
  }
});

export { expect };
