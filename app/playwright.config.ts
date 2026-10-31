import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "src",
  fullyParallel: true,
  reporter: "list",
  use: {
    ...devices["Desktop Safari"],
    baseURL: process.env.BASE_URL ?? "http://localhost:1420",
    viewport: { width: 1600, height: 1000 },
  },
  projects: [
    {
      name: "webkit",
      testMatch: "**/*.e2e.ts",
      testIgnore: ["**/*.visual.e2e.ts", "**/*.perf.e2e.ts", "**/*.video.e2e.ts"],
    },
    { name: "visual", testMatch: "**/*.visual.e2e.ts" },
    { name: "perf", testMatch: "**/*.perf.e2e.ts" },
    { name: "video", testMatch: "**/*.video.e2e.ts" },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:1420/playground",
    reuseExistingServer: true,
  },
});
