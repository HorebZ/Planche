// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryObserver } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import type { Board, Intent } from "@/ipc/bindings";
import { boardQuery, createQueryClient, listenToCore } from "@/ipc/queries";
import { applyIntent } from "./moveCard";
import { dispatchIntent } from "./useActions";

afterEach(() => clearMocks());

const [first]: { board: Board; intent: Intent }[] = JSON.parse(
	// happy-dom gives import.meta.url an http scheme, so the path starts from app/.
	readFileSync(resolve(process.cwd(), "../fixtures/move_cases.json"), "utf8"),
);

test("a move shows at once, and a mutation-failed puts the cached board back", async () => {
	const original = first.board;
	const moved = applyIntent(original, first.intent);
	// The optimistic board marks the moved card Pending until Rust answers.
	const optimistic: Board = {
		...moved,
		columns: moved.columns.map((c) => ({
			...c,
			cards: c.cards.map((card) => (card.item_id === first.intent.item_id ? { ...card, pending: true } : card)),
		})),
	};
	const calls: string[] = [];
	mockIPC(
		(cmd, args) => {
			calls.push(cmd);
			if (cmd === "get_board") return original;
			// Rust queues the move and returns the board with it replayed.
			if (cmd === "dispatch_intent") return applyIntent(original, (args as { intent: Intent }).intent);
			throw new Error(`unexpected ${cmd}`);
		},
		{ shouldMockEvents: true },
	);
	const client = createQueryClient();
	const stop = await listenToCore(client);
	const query = boardQuery(original.project.id, null);
	const unsubscribe = new QueryObserver(client, query).subscribe(() => {});
	await expect.poll(() => client.getQueryData(query.queryKey)).toEqual(original);

	const sent = dispatchIntent(client, original.project.id, null, first.intent);
	// The same tick as the drop, before Rust answers.
	expect(client.getQueryData(query.queryKey)).toEqual(optimistic);
	await sent;
	expect(calls).toContain("dispatch_intent");
	expect(client.getQueryData(query.queryKey)).toEqual(moved);

	// GitHub refuses it: Rust drops the row and the board changes back.
	await emit("mutation-failed", { intent: first.intent, message: "Could not resolve to a node" });
	await emit("board-changed", { project_id: original.project.id });
	await expect.poll(() => client.getQueryData(query.queryKey)).toEqual(original);

	unsubscribe();
	stop();
});
