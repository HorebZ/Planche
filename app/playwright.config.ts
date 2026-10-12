import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	reporter: "list",
	use: { baseURL: "http://localhost:1420" },
	projects: [{ name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1600, height: 1000 } } }],
	webServer: {
		command: "bun run dev",
		url: "http://localhost:1420/playground",
		reuseExistingServer: true,
	},
});
