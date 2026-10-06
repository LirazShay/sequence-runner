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

  const report = await harness.page.evaluate(() => window.__sequenceRunnerLiveSmoke);

  expect(report.ok).toBe(true);
  expect(report.runner.version).toBe(window.__sequenceRunner?.version);
  expect(report.wakeUi.delay).toBe("5");
  expect(report.wakeUi.preset).toBe("supportive");
  expect(report.wakeUi.options).toEqual(
    Array.from({ length: 20 }, (_, index) => String(index + 1))
  );
  expect(report.selectors.composers.visible).toBeGreaterThan(0);
  expect(report.checks.every((check) => check.ok)).toBe(true);
  expect(await harness.sentMessages()).toHaveLength(0);
});
