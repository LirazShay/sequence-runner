import { test, expect } from "./fixture.js";

test("management panel keeps frequent controls above test and diagnostic sections", async ({ harness }) => {
  await harness.load();

  const sequence = await harness.page.evaluate(() => {
    const body = document.querySelector('#sequence-runner-panel [data-role="body"] > div:last-child');
    if (!body) {
      throw new Error("Panel content container not found");
    }

    return [...body.children]
      .map((node) => node.getAttribute("data-role"))
      .filter(Boolean);
  });

  expect(sequence).toEqual([
    "start-config",
    "metrics",
    "intermediate",
    "run-limit",
    "long-wait-wake",
    "diagnostic"
  ]);
});
