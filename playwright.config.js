import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 6 : undefined,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  globalTimeout: process.env.CI ? 40000 : undefined,
  timeout: 15000,
  expect: {
    timeout: 5000
  },
  use: {
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  outputDir: "test-results"
});
