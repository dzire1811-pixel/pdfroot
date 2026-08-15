import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /background-removal-refinement\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  preserveOutput: "always",
  reporter: "list",
});
