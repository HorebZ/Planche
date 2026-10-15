import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	// Prebundled up front, so the lazy mock backend never triggers a re-optimization and a reload.
	optimizeDeps: {
		include: [
			"@tanstack/react-query",
			"@tanstack/react-virtual",
			"@tauri-apps/api/core",
			"@tauri-apps/api/event",
			"@tauri-apps/api/mocks",
			"@tauri-apps/api/window",
			"@tauri-apps/plugin-opener",
			"zustand",
		],
	},
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
		watch: { ignored: ["**/src-tauri/**"] },
	},
	test: {
		include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
	},
}));
