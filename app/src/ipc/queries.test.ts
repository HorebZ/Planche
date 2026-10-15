// @vitest-environment happy-dom
import { QueryObserver } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import { boardQuery, createQueryClient, listenToCore } from "./queries";

afterEach(() => clearMocks());

test("a board-changed event refetches get_board for that project", async () => {
	const calls: string[] = [];
	mockIPC(
		(cmd, args) => {
			calls.push(cmd);
			if (cmd === "get_board") return { project: { id: (args as { projectId: string }).projectId } };
			throw new Error(`unexpected ${cmd}`);
		},
		{ shouldMockEvents: true },
	);
	const client = createQueryClient();
	const stop = await listenToCore(client);
	// An observer keeps the query active, as a mounted board does.
	const observer = new QueryObserver(client, boardQuery("PVT_1", null));
	const unsubscribe = observer.subscribe(() => {});
	await expect.poll(() => calls.filter((c) => c === "get_board").length).toBe(1);

	await emit("board-changed", { project_id: "PVT_other" });
	await emit("board-changed", { project_id: "PVT_1" });
	await expect.poll(() => calls.filter((c) => c === "get_board").length).toBe(2);

	unsubscribe();
	stop();
});
