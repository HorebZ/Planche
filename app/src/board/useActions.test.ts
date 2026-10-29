// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { toast } from "@/components/ui/toast";
import type { Board, Intent } from "@/ipc/bindings";
import { authQuery, boardQuery, createQueryClient, currentProjectQuery, listenToCore } from "@/ipc/queries";
import { useUi } from "@/stores/ui";
import { applyIntent } from "./moveCard";
import { dispatchIntent, useActions } from "./useActions";

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

function deferred() {
	let resolve: (board: Board) => void = () => {};
	let reject: (error: Error) => void = () => {};
	const promise = new Promise<Board>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

function harness() {
	const client = createQueryClient();
	client.setQueryData(boardQuery(first.board.project.id, null).queryKey, first.board);
	useUi.getState().selectProject(first.board.project.id);
	const receipts: ReturnType<typeof deferred>[] = [];
	mockIPC((cmd) => {
		if (cmd !== "dispatch_intent") throw new Error(`unexpected ${cmd}`);
		const receipt = deferred();
		receipts.push(receipt);
		return receipt.promise;
	});
	const mounted: { actions?: ReturnType<typeof useActions> } = {};
	function Hook() {
		mounted.actions = useActions(first.board.project.id, null);
		return null;
	}
	const root = createRoot(document.createElement("div"));
	flushSync(() => root.render(createElement(QueryClientProvider, { client }, createElement(Hook))));
	if (!mounted.actions) throw new Error("hook did not mount");
	return {
		actions: mounted.actions,
		client,
		receipts,
		close: () => {
			for (const receipt of receipts) receipt.resolve(first.board);
			flushSync(() => root.unmount());
			client.clear();
		},
	};
}

const draft: Intent = {
	type: "create_draft",
	project_id: first.board.project.id,
	item_id: "draft:a",
	field_id: first.board.field.id,
	column: null,
	title: "A",
};

test.each([draft, first.intent])("an older $type receipt preserves the newer move Undo", async (intent) => {
	const h = harness();
	try {
		const a = h.actions.run(intent);
		const b = h.actions.run(first.intent);
		h.receipts[1].resolve(first.board);
		await b;
		const undoB = useUi.getState().undo;
		expect(undoB?.intent).toMatchObject({ type: "move_card", item_id: first.intent.item_id });
		h.receipts[0].resolve(first.board);
		await a;
		expect(useUi.getState().undo).toBe(undoB);
	} finally {
		h.close();
	}
});

test.each(["project", "view", "account", "fallback"])("a %s context change cannot resurrect Undo", async (context) => {
	const h = harness();
	try {
		h.client.setQueryData(authQuery.queryKey, { id: "U", login: "u", avatar_url: null, missing_scopes: [] });
		const confirmed = h.actions.run(first.intent);
		h.receipts[0].resolve(first.board);
		await confirmed;
		expect(useUi.getState().undo).not.toBeNull();
		const sent = h.actions.run(first.intent);
		const toastCount = toast.getHistory().length;
		if (context === "project") {
			useUi.getState().selectProject("Q");
			useUi.getState().selectProject(first.board.project.id);
		} else if (context === "view") {
			useUi.getState().selectView("V2");
			useUi.getState().selectView(null);
		} else if (context === "account") {
			h.client.setQueryData(authQuery.queryKey, { id: "V", login: "v", avatar_url: null, missing_scopes: [] });
			h.client.setQueryData(authQuery.queryKey, { id: "U", login: "u", avatar_url: null, missing_scopes: [] });
		} else {
			useUi.setState({ projectId: null });
			h.client.setQueryData(currentProjectQuery.queryKey, "Q");
			h.client.setQueryData(currentProjectQuery.queryKey, first.board.project.id);
		}
		h.receipts[1].resolve(first.board);
		await sent;
		expect(useUi.getState().undo).toBeNull();
		expect(toast.getHistory()).toHaveLength(toastCount);
	} finally {
		h.close();
	}
});

test.each([0, 1])("rejected receipt %i preserves the confirmed Undo", async (rejected) => {
	const h = harness();
	try {
		const confirmed = h.actions.run(first.intent);
		h.receipts[0].resolve(first.board);
		await confirmed;
		const prior = useUi.getState().undo;
		const a = h.actions.run(first.intent);
		const b = h.actions.run(first.intent);
		expect(useUi.getState().undo).toBe(prior);
		h.receipts[rejected + 1].reject(new Error("transport"));
		await (rejected === 0 ? a : b);
		expect(useUi.getState().undo).toBe(prior);
		h.receipts[2 - rejected].resolve(first.board);
		await (rejected === 0 ? b : a);
		if (rejected === 1) expect(useUi.getState().undo).toBe(prior);
		else expect(useUi.getState().undo).not.toBe(prior);
	} finally {
		h.close();
	}
});

test("Undo consumes once and prevents an in-flight receipt from reinstalling it", async () => {
	const h = harness();
	try {
		const confirmed = h.actions.run(first.intent);
		h.receipts[0].resolve(first.board);
		await confirmed;
		const pending = h.actions.run(first.intent);
		const undone = h.actions.undo();
		await h.actions.undo();
		expect(h.receipts).toHaveLength(3);
		expect(useUi.getState().undo).toBeNull();
		h.receipts[1].resolve(first.board);
		h.receipts[2].resolve(first.board);
		await Promise.all([pending, undone]);
		expect(useUi.getState().undo).toBeNull();
	} finally {
		h.close();
	}
});

test("an old toast cannot consume a newer Undo", async () => {
	const h = harness();
	const container = document.createElement("div");
	const toastRoot = createRoot(container);
	try {
		const a = h.actions.run(first.intent);
		h.receipts[0].resolve(first.board);
		await a;
		const old = toast.getHistory().at(-1);
		if (!old || !("jsx" in old) || !old.jsx) throw new Error("missing Undo toast");
		flushSync(() => toastRoot.render(old.jsx));
		const b = h.actions.run(first.intent);
		h.receipts[1].resolve(first.board);
		await b;
		const undoB = useUi.getState().undo;
		const button = container.querySelector("button");
		if (!button) throw new Error("missing Undo button");
		button.click();
		expect(h.receipts).toHaveLength(2);
		expect(useUi.getState().undo).toBe(undoB);
		const current = toast.getHistory().at(-1);
		if (!current || !("jsx" in current) || !current.jsx) throw new Error("missing current toast");
		flushSync(() => toastRoot.render(current.jsx));
		const currentButton = container.querySelector("button");
		if (!currentButton) throw new Error("missing current Undo button");
		const historyCount = toast.getHistory().length;
		currentButton.click();
		expect(h.receipts).toHaveLength(3);
		expect(useUi.getState().undo).toBeNull();
		h.receipts[2].resolve(first.board);
		await expect.poll(() => toast.getHistory().length).toBe(historyCount + 1);
	} finally {
		flushSync(() => {
			toastRoot.unmount();
		});
		h.close();
	}
});

test("a current draft clears Undo, while a cosmetic auth update preserves it", async () => {
	const h = harness();
	try {
		const auth = { id: "U", login: "u", avatar_url: null, missing_scopes: [] };
		h.client.setQueryData(authQuery.queryKey, auth);
		const move = h.actions.run(first.intent);
		h.receipts[0].resolve(first.board);
		await move;
		const confirmed = useUi.getState().undo;
		expect(confirmed).not.toBeNull();
		h.client.setQueryData(authQuery.queryKey, { ...auth, login: "renamed" });
		expect(useUi.getState().undo).toBe(confirmed);
		const created = h.actions.run(draft);
		expect(useUi.getState().undo).toBe(confirmed);
		h.receipts[1].resolve(first.board);
		await created;
		expect(useUi.getState().undo).toBeNull();
	} finally {
		h.close();
	}
});
