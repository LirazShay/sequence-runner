import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test, expect } from "./fixture.js";

const liveSmokePath = fileURLToPath(
  new URL("../../scripts/live-smoke.js", import.meta.url)
);

test("live smoke check validates the current DOM contract without mutating chat state", async ({ harness }) => {
  await harness.load();

  const source = await fs.readFile(liveSmokePath, "utf8");
  await harness.page.addScriptTag({ content: source });

  const result = await harness.page.evaluate(() => ({
    report: window.__sequenceRunnerLiveSmoke,
    runnerVersion: window.__sequenceRunner?.version || null
  }));

  expect(result.report.ok).toBe(true);
  expect(result.report.runner.version).toBe(result.runnerVersion);
  expect(result.report.wakeUi.delay).toBe("5");
  expect(result.report.wakeUi.preset).toBe("supportive");
  expect(result.report.wakeUi.options).toEqual(
    Array.from({ length: 20 }, (_, index) => String(index + 1))
  );
  expect(result.report.selectors.composers.visible).toBeGreaterThan(0);
  expect(result.report.checks.every((check) => check.ok)).toBe(true);
  expect(await harness.sentMessages()).toHaveLength(0);
});
