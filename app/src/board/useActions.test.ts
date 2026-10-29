// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CancelledError, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { toast } from "@/components/ui/toast";
import type { Board, DispatchOutcome, Intent } from "@/ipc/bindings";
import { authQuery, boardQuery, createQueryClient, currentProjectQuery, listenToCore } from "@/ipc/queries";
import { Shell } from "@/shell/Shell";
import { useUi } from "@/stores/ui";
import { applyIntent } from "./moveCard";
import { type DispatchResult, dispatchIntent, useActions } from "./useActions";

afterEach(() => {
	vi.useRealTimers();
	clearMocks();
});

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
	const receipt = deferred();
	const calls: string[] = [];
	mockIPC(
		(cmd) => {
			calls.push(cmd);
			if (cmd === "get_board") return calls.includes("dispatch_intent") ? moved : original;
			// Rust queues the move and returns the board with it replayed.
			if (cmd === "dispatch_intent") return receipt.promise;
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
	await expect.poll(() => calls.includes("dispatch_intent")).toBe(true);
	expect(client.getQueryData(query.queryKey)).toEqual(optimistic);
	receipt.resolve({ type: "accepted", seq: 1 });
	await sent;
	expect(calls).toContain("dispatch_intent");
	await expect.poll(() => client.getQueryData(query.queryKey)).toEqual(moved);

	// GitHub refuses it: Rust drops the row and the board changes back.
	calls.length = 0;
	await emit("mutation-failed", { intent: first.intent, message: "Could not resolve to a node" });
	await emit("board-changed", { project_id: original.project.id });
	await expect.poll(() => client.getQueryData(query.queryKey)).toEqual(original);

	unsubscribe();
	stop();
});

function deferred() {
	let resolve: (outcome: DispatchOutcome) => void = () => {};
	let reject: (error: Error) => void = () => {};
	const promise = new Promise<DispatchOutcome>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

function harness() {
	const client = createQueryClient();
	client.setQueryData(authQuery.queryKey, { id: "U", login: "u", avatar_url: null, missing_scopes: [] });
	client.setQueryData(boardQuery(first.board.project.id, null).queryKey, first.board);
	useUi.getState().selectProject(first.board.project.id);
	const receipts: ReturnType<typeof deferred>[] = [];
	mockIPC((cmd) => {
		if (cmd === "get_board") return first.board;
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
			for (const receipt of receipts) receipt.resolve({ type: "accepted", seq: 1 });
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
		await expect.poll(() => h.receipts.length).toBeGreaterThan(1);
		h.receipts[1].resolve({ type: "accepted", seq: 1 });
		await b;
		const undoB = useUi.getState().undo;
		expect(undoB?.intent).toMatchObject({ type: "move_card", item_id: first.intent.item_id });
		h.receipts[0].resolve({ type: "accepted", seq: 1 });
		await a;
		expect(useUi.getState().undo).toBe(undoB);
	} finally {
		h.close();
	}
});

test.each(
	["project", "view", "account", "fallback"].flatMap((context) => [
		[context, "action"],
		[context, "undo"],
	]),
)("a %s roundtrip suppresses old %s outcomes", async (context, kind) => {
	const h = harness();
	try {
		h.client.setQueryData(authQuery.queryKey, { id: "U", login: "u", avatar_url: null, missing_scopes: [] });
		h.client.setQueryData(boardQuery(first.board.project.id, null).queryKey, first.board);
		const confirmed = h.actions.run(first.intent);
		await expect.poll(() => h.receipts.length).toBeGreaterThan(0);
		h.receipts[0].resolve({ type: "accepted", seq: 1 });
		await confirmed;
		expect(useUi.getState().undo).not.toBeNull();
		vi.useFakeTimers();
		const results: string[] = [];
		const sent = kind === "undo" ? h.actions.undo() : h.actions.run(first.intent, (r) => results.push(r.type));
		await vi.advanceTimersByTimeAsync(0);
		expect(h.receipts).toHaveLength(2);
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
			h.client.setQueryData(boardQuery(first.board.project.id, null).queryKey, first.board);
		} else {
			useUi.setState({ projectId: null });
			h.client.setQueryData(currentProjectQuery.queryKey, "Q");
			h.client.setQueryData(currentProjectQuery.queryKey, first.board.project.id);
		}
		await expect.poll(() => h.receipts.length).toBeGreaterThan(1);
		await vi.advanceTimersByTimeAsync(15_000);
		expect(await sent).toMatchObject({ type: "unknown" });
		expect(toast.getHistory()).toHaveLength(toastCount);
		h.receipts[1].resolve({ type: "accepted", seq: 1 });
		await vi.advanceTimersByTimeAsync(0);
		if (kind === "action") expect(results).toEqual(["unknown", "accepted"]);
		expect(h.receipts).toHaveLength(2);
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
		await expect.poll(() => h.receipts.length).toBeGreaterThan(0);
		h.receipts[0].resolve({ type: "accepted", seq: 1 });
		await confirmed;
		const prior = useUi.getState().undo;
		const a = h.actions.run(first.intent);
		const b = h.actions.run(first.intent);
		expect(useUi.getState().undo).toBe(prior);
		await expect.poll(() => h.receipts.length).toBeGreaterThan(rejected + 1);
		h.receipts[rejected + 1].reject(new Error("transport"));
		await (rejected === 0 ? a : b);
		expect(useUi.getState().undo).toBe(prior);
		h.receipts[2 - rejected].resolve({ type: "accepted", seq: 1 });
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
		await expect.poll(() => h.receipts.length).toBeGreaterThan(0);
		h.receipts[0].resolve({ type: "accepted", seq: 1 });
		await confirmed;
		const pending = h.actions.run(first.intent);
		const undone = h.actions.undo();
		await h.actions.undo();
		await expect.poll(() => h.receipts.length).toBe(3);
		expect(useUi.getState().undo).toBeNull();
		h.receipts[1].resolve({ type: "accepted", seq: 1 });
		h.receipts[2].resolve({ type: "accepted", seq: 1 });
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
		await expect.poll(() => h.receipts.length).toBeGreaterThan(0);
		h.receipts[0].resolve({ type: "accepted", seq: 1 });
		await a;
		const old = toast.getHistory().at(-1);
		if (!old || !("jsx" in old) || !old.jsx) throw new Error("missing Undo toast");
		flushSync(() => toastRoot.render(old.jsx));
		const b = h.actions.run(first.intent);
		await expect.poll(() => h.receipts.length).toBeGreaterThan(1);
		h.receipts[1].resolve({ type: "accepted", seq: 1 });
		await b;
		const undoB = useUi.getState().undo;
		const button = container.querySelector("button");
		if (!button) throw new Error("missing Undo button");
		button.click();
		expect(h.receipts).toHaveLength(2);
		expect(useUi.getState().undo).toBe(undoB);
		const current = toast.getHistory().at(-1);
		if (!current || !("jsx" in current) || !current.jsx) throw new Error("missing current toast");
		expect(toast.getToasts().map((entry) => entry.id)).toContain(current.id);
		flushSync(() => toastRoot.render(current.jsx));
		const currentButton = container.querySelector("button");
		if (!currentButton) throw new Error("missing current Undo button");
		const historyCount = toast.getHistory().length;
		currentButton.click();
		await expect.poll(() => h.receipts.length).toBe(3);
		expect(useUi.getState().undo).toBeNull();
		h.receipts[2].resolve({ type: "accepted", seq: 1 });
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
		h.client.setQueryData(boardQuery(first.board.project.id, null).queryKey, first.board);
		const move = h.actions.run(first.intent);
		await expect.poll(() => h.receipts.length).toBeGreaterThan(0);
		h.receipts[0].resolve({ type: "accepted", seq: 1 });
		await move;
		const confirmed = useUi.getState().undo;
		expect(confirmed).not.toBeNull();
		h.client.setQueryData(authQuery.queryKey, { ...auth, login: "renamed" });
		expect(useUi.getState().undo).toBe(confirmed);
		const created = h.actions.run(draft);
		expect(useUi.getState().undo).toBe(confirmed);
		await expect.poll(() => h.receipts.length).toBeGreaterThan(1);
		h.receipts[1].resolve({ type: "accepted", seq: 1 });
		await created;
		expect(useUi.getState().undo).toBeNull();
	} finally {
		h.close();
	}
});
test("an older dispatch receipt never replaces a newer optimistic action", async () => {
	const a = deferred();
	const b = deferred();
	let sends = 0;
	mockIPC((cmd) => {
		if (cmd === "dispatch_intent") return ++sends === 1 ? a.promise : b.promise;
		if (cmd === "get_board") return first.board;
		throw new Error(`unexpected ${cmd}`);
	});
	const client = createQueryClient();
	const query = boardQuery(first.board.project.id, null);
	client.setQueryData(query.queryKey, first.board);
	const observed: unknown[] = [];
	const stop = new QueryObserver(client, query).subscribe((result) => observed.push(result.data));
	try {
		const sentA = dispatchIntent(client, first.board.project.id, null, first.intent);
		await expect.poll(() => sends).toBe(1);
		const sentB = dispatchIntent(client, first.board.project.id, null, draft);
		await expect.poll(() => sends).toBe(2);
		const optimisticB = client.getQueryData(query.queryKey);
		const boundary = observed.length;
		a.resolve({ type: "accepted", seq: 1 });
		await sentA;
		expect(client.getQueryData(query.queryKey)).toBe(optimisticB);
		expect(observed.slice(boundary)).not.toContainEqual(first.board);
		b.resolve({ type: "accepted", seq: 1 });
		await sentB;
	} finally {
		a.resolve({ type: "accepted", seq: 1 });
		b.resolve({ type: "accepted", seq: 1 });
		stop();
		client.clear();
	}
});

test.each(
	["success", "failure"].flatMap((late) => [
		[late, "newer"],
		[late, "action"],
		[late, "undo"],
	]),
)("timeout releases reads and observes late %s with %s", async (late, kind) => {
	const h = harness();
	try {
		const observed: string[] = [];
		vi.useFakeTimers();
		if (kind === "undo") {
			const seed = h.actions.run(first.intent);
			await vi.advanceTimersByTimeAsync(0);
			h.receipts[0].resolve({ type: "accepted", seq: 1 });
			await seed;
		}
		const index = h.receipts.length;
		const count = toast.getHistory().length;
		const a = kind === "undo" ? h.actions.undo() : h.actions.run(first.intent, (result) => observed.push(result.type));
		await vi.advanceTimersByTimeAsync(0);
		expect(h.receipts).toHaveLength(index + 1);
		await vi.advanceTimersByTimeAsync(15_000);
		expect(await a).toMatchObject({ type: "unknown" });
		expect(toast.getHistory()).toHaveLength(count + 1);
		await expect(h.client.fetchQuery(boardQuery(first.board.project.id, null))).resolves.toEqual(first.board);
		const b = kind === "newer" ? h.actions.run(first.intent) : undefined;
		await vi.advanceTimersByTimeAsync(0);
		if (b) h.receipts[index + 1].resolve({ type: "accepted", seq: 1 });
		await b;
		const undoB = useUi.getState().undo;
		if (late === "success") h.receipts[index].resolve({ type: "accepted", seq: 1 });
		else h.receipts[index].reject(new Error("late transport"));
		await vi.advanceTimersByTimeAsync(0);
		if (kind !== "undo") expect(observed).toEqual(late === "success" ? ["unknown", "accepted"] : ["unknown"]);
		if (kind === "newer" || late === "failure" || kind === "undo") expect(useUi.getState().undo).toBe(undoB);
		expect(h.receipts).toHaveLength(index + (b ? 2 : 1));
		expect(toast.getHistory()).toHaveLength(count + (b || late === "success" ? 2 : 1));
		const unknown = toast
			.getHistory()
			.slice(count)
			.filter((entry) => "jsx" in entry && entry.jsx && renderToStaticMarkup(entry.jsx).includes("Could not confirm"));
		expect(unknown).toHaveLength(1);
	} finally {
		vi.useRealTimers();
		h.close();
	}
});

test.each(["action", "undo", "project", "account"])("unconfirmed %s reports only in its context", async (kind) => {
	const h = harness();
	try {
		const confirmed = h.actions.run(first.intent);
		await expect.poll(() => h.receipts.length).toBe(1);
		h.receipts[0].resolve({ type: "accepted", seq: 1 });
		await confirmed;
		const sent = kind === "undo" ? h.actions.undo() : h.actions.run(first.intent);
		await expect.poll(() => h.receipts.length).toBe(2);
		if (kind === "project") useUi.getState().selectProject("Q");
		const auth = { id: "V", login: "v", avatar_url: null, missing_scopes: [] };
		if (kind === "account") h.client.setQueryData(authQuery.queryKey, auth);
		const count = toast.getHistory().length;
		h.receipts[1].reject(new Error("transport"));
		expect(await sent).toMatchObject({ type: "unknown" });
		expect(toast.getHistory()).toHaveLength(count + Number(kind === "action" || kind === "undo"));
		if (kind === "action" || kind === "undo") {
			const last = toast.getHistory().at(-1);
			if (!last || !("jsx" in last) || !last.jsx) throw new Error("missing notification");
			expect(renderToStaticMarkup(last.jsx)).toContain("Could not confirm");
		}
	} finally {
		h.close();
	}
});

test("account roundtrip before preparation rejects locally without invoking IPC", async () => {
	const h = harness();
	try {
		const sent = h.actions.run(first.intent);
		h.client.setQueryData(authQuery.queryKey, { id: "V", login: "v", avatar_url: null, missing_scopes: [] });
		h.client.setQueryData(authQuery.queryKey, { id: "U", login: "u", avatar_url: null, missing_scopes: [] });
		expect(await sent).toMatchObject({ type: "rejected" });
		expect(h.receipts).toHaveLength(0);
	} finally {
		h.close();
	}
});

test("same-stack preparations capture optimism in user order without awaiting receipts", async () => {
	const h = harness();
	const snapshots: (Board | null | undefined)[] = [];
	try {
		const a = dispatchIntent(h.client, first.board.project.id, null, first.intent, undefined, (before) =>
			snapshots.push(before),
		);
		const b = dispatchIntent(h.client, first.board.project.id, null, first.intent, undefined, (before) =>
			snapshots.push(before),
		);
		await expect.poll(() => h.receipts.length).toBe(2);
		expect(snapshots[0]).toEqual(first.board);
		expect(
			snapshots[1]?.columns.flatMap((column) => column.cards).find((card) => card.item_id === first.intent.item_id)
				?.pending,
		).toBe(true);
		h.receipts[1].resolve({ type: "accepted", seq: 1 });
		h.receipts[0].resolve({ type: "accepted", seq: 1 });
		await Promise.all([a, b]);
	} finally {
		h.close();
	}
});

async function startPendingAction(h: ReturnType<typeof harness>, kind: string, observe = true) {
	if (kind === "undo") {
		const seed = h.actions.run(first.intent);
		await vi.advanceTimersByTimeAsync(0);
		h.receipts[0].resolve({ type: "accepted", seq: 1 });
		await seed;
	}
	const index = h.receipts.length;
	const results: string[] = [];
	const pending =
		kind === "undo" ? h.actions.undo() : h.actions.run(first.intent, observe ? (r) => results.push(r.type) : undefined);
	await vi.advanceTimersByTimeAsync(0);
	return { pending, index, results };
}

test.each([
	["action", "transport"],
	["action", "timeout"],
	["undo", "transport"],
	["undo", "timeout"],
])("an older %s still reports %s after an unrelated newer gesture", async (kind, failure) => {
	const h = harness();
	vi.useFakeTimers();
	try {
		const a = await startPendingAction(h, kind, false);
		const b = h.actions.run({ ...first.intent, item_id: "PVTI_A" });
		await vi.advanceTimersByTimeAsync(0);
		h.receipts[a.index + 1].resolve({ type: "accepted", seq: 1 });
		await b;
		const undoB = useUi.getState().undo;
		expect(undoB?.intent.item_id).toBe("PVTI_A");
		const optimism = h.client.getQueryData(boardQuery(first.board.project.id, null).queryKey);
		const count = toast.getHistory().length;
		if (failure === "transport") h.receipts[a.index].reject(new Error("transport"));
		else await vi.advanceTimersByTimeAsync(15_000);
		expect(await a.pending).toMatchObject({ type: "unknown" });
		expect(useUi.getState().undo).toBe(undoB);
		expect(h.client.getQueryData(boardQuery(first.board.project.id, null).queryKey)).toBe(optimism);
		expect(h.receipts).toHaveLength(a.index + 2);
		expect(toast.getHistory()).toHaveLength(count + 1);
		const last = toast.getHistory().at(-1);
		if (!last || !("jsx" in last) || !last.jsx) throw new Error("missing notification");
		const rendered = renderToStaticMarkup(last.jsx);
		expect(rendered).toContain(kind === "undo" ? "Could not confirm Undo:" : "Could not confirm:");
		expect(rendered).toContain("&quot;Card C&quot; moved to In Progress");
		expect(rendered).toContain(failure === "transport" ? "transport" : "No response after 15 s");
		h.receipts[a.index].reject(new Error("late transport"));
		await vi.advanceTimersByTimeAsync(0);
		expect(toast.getHistory()).toHaveLength(count + 1);
		const undone = h.actions.undo();
		await vi.advanceTimersByTimeAsync(0);
		expect(toast.getToasts().map((entry) => entry.id)).toContain(last.id);
		expect(toast.getToasts().map((entry) => entry.id)).not.toContain(`action-${undoB?.owner}`);
		expect(h.receipts).toHaveLength(a.index + 3);
		await h.actions.undo();
		expect(h.receipts).toHaveLength(a.index + 3);
		h.receipts[a.index + 2].resolve({ type: "accepted", seq: 1 });
		await undone;
	} finally {
		vi.useRealTimers();
		h.close();
	}
});

test.each([false, true])("a certain rejection after timeout=%s preserves newer optimism and Undo", async (timeout) => {
	const h = harness();
	vi.useFakeTimers();
	try {
		const results: DispatchOutcome["type"][] = [];
		const a = h.actions.run(draft, (r) => {
			if (r.type !== "unknown") results.push(r.type);
		});
		await vi.advanceTimersByTimeAsync(0);
		if (timeout) {
			await vi.advanceTimersByTimeAsync(15_000);
			expect(await a).toMatchObject({ type: "unknown" });
		}
		const b = h.actions.run(first.intent);
		await vi.advanceTimersByTimeAsync(0);
		h.receipts[1].resolve({ type: "accepted", seq: 2 });
		await b;
		const undoB = useUi.getState().undo;
		const key = boardQuery(first.board.project.id, null).queryKey;
		const optimism = h.client.getQueryData(key);
		h.receipts[0].resolve({ type: "rejected", error: { kind: "Cache", message: "disk full" } });
		await vi.advanceTimersByTimeAsync(0);
		expect(results).toEqual(["rejected"]);
		expect(useUi.getState().undo).toBe(undoB);
		expect(h.client.getQueryData(key)).toBe(optimism);
		expect(h.receipts).toHaveLength(2);
		const last = toast.getHistory().at(-1);
		if (!last || !("jsx" in last) || !last.jsx) throw new Error("missing rejection toast");
		expect(renderToStaticMarkup(last.jsx)).toContain("disk full");
	} finally {
		vi.useRealTimers();
		h.close();
	}
});

test("a certain rejection restores only its own projection and preserves prior Undo", async () => {
	const h = harness();
	try {
		const seed = h.actions.run(first.intent);
		await expect.poll(() => h.receipts.length).toBe(1);
		h.receipts[0].resolve({ type: "accepted", seq: 1 });
		await seed;
		const undo = useUi.getState().undo;
		const key = boardQuery(first.board.project.id, null).queryKey;
		const before = h.client.getQueryData(key);
		const sent = h.actions.run(draft);
		await expect.poll(() => h.receipts.length).toBe(2);
		h.receipts[1].resolve({ type: "rejected", error: { kind: "Cache", message: "disk full" } });
		expect(await sent).toEqual({ type: "rejected", error: { kind: "Cache", message: "disk full" } });
		expect(h.client.getQueryData(key)).toEqual(before);
		expect(useUi.getState().undo).toBe(undo);
	} finally {
		h.close();
	}
});

test("accepted seq survives projection failure with cached board and a recoverable Shell alert", async () => {
	const h = harness();
	const container = document.createElement("div");
	const root = createRoot(container);
	let fail: boolean | "cancel" = true;
	let sends = 0;
	mockIPC((cmd) => {
		if (cmd === "dispatch_intent") {
			sends++;
			return { type: "accepted", seq: 42 };
		}
		if (cmd === "get_board") {
			if (fail === "cancel") throw new CancelledError({ revert: true });
			if (fail) throw new Error("cache read failed");
			return first.board;
		}
		if (cmd === "list_projects" || cmd === "cached_projects") return { owners: [] };
		if (cmd === "sync_status") return { state: { type: "idle" }, retry_at: null };
		if (cmd === "get_project") return null;
		if (cmd === "get_sync_prefs") return { interval: "off", on_wake: false, on_focus: false };
		throw new Error(`unexpected ${cmd}`);
	});
	try {
		flushSync(() =>
			root.render(
				createElement(
					QueryClientProvider,
					{ client: h.client },
					createElement(Shell, { projectId: first.board.project.id }),
				),
			),
		);
		const results: DispatchResult[] = [];
		expect(await h.actions.run(first.intent, (r) => results.push(r))).toEqual({ type: "accepted", seq: 42 });
		const key = boardQuery(first.board.project.id, null).queryKey;
		const optimistic = h.client.getQueryData(key);
		await expect
			.poll(() => container.querySelector('[role="alert"]')?.textContent)
			.toContain("Could not refresh this projectcache read failed");
		expect(container.querySelector('[data-slot="board-column"]')?.textContent).toContain("Todo");
		expect(h.client.getQueryData(key)).toBe(optimistic);
		expect(results).toEqual([{ type: "accepted", seq: 42 }]);
		fail = false;
		await h.client.invalidateQueries({ queryKey: key });
		await expect.poll(() => container.querySelector('[role="alert"]')).toBeNull();
		expect(results).toEqual([{ type: "accepted", seq: 42 }]);
		fail = "cancel";
		await h.client.invalidateQueries({ queryKey: key });
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(h.client.getQueryData(key)).toEqual(first.board);
		expect(sends).toBe(1);
	} finally {
		flushSync(() => root.unmount());
		h.close();
	}
});
