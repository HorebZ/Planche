import { expect, test } from "vitest";
import { applyIntent } from "@/board/moveCard";
import type { Board, Card, Intent, User } from "@/ipc/bindings";
import { inverse, describe as label } from "./inverse";

const hor: User = { id: "U_hor", login: "HorebZ", avatar_url: "" };
const lea: User = { id: "U_lea", login: "lea", avatar_url: "" };

function issue(n: number, position: number, assignees: User[] = []): Card {
	return {
		item_id: `PVTI_${n}`,
		position,
		kind: "issue",
		id: `I_${n}`,
		number: n,
		title: `Issue ${n}`,
		url: "",
		repo: "HorebZ/Planche",
		state: "open",
		assignees,
		labels: [],
		pending: false,
		updated_by_sync: false,
	};
}

/** Todo #9 #10 #11, In Progress #1, Done #2, in project order 1 9 10 11 2. */
function board(): Board {
	return {
		project: { id: "PVT_1", number: 2, title: "Planche", url: "" },
		view: null,
		field: { id: "F_status", name: "Status" },
		columns: [
			{ option_id: "todo", name: "Todo", color: "BLUE", cards: [issue(9, 1), issue(10, 2, [lea]), issue(11, 3)] },
			{ option_id: "progress", name: "In Progress", color: "YELLOW", cards: [issue(1, 0)] },
			{ option_id: "done", name: "Done", color: "GREEN", cards: [issue(2, 4)] },
		],
		pending_count: 0,
		synced_at: null,
	};
}

const base = { project_id: "PVT_1" } as const;
const move = (item: number, to: string, placement: Extract<Intent, { type: "move_card" }>["placement"]): Intent => ({
	...base,
	type: "move_card",
	item_id: `PVTI_${item}`,
	field_id: "F_status",
	to,
	placement,
});

/** The intent, then its inverse, gives the board back. */
function roundTrip(intent: Intent) {
	const before = board();
	const undo = inverse(before, intent);
	if (!undo) throw new Error("no inverse");
	expect(applyIntent(applyIntent(before, intent), undo)).toEqual(before);
	return undo;
}

test("a move from the middle of a column goes back after its old neighbor above", () => {
	expect(roundTrip(move(10, "done", "top"))).toEqual(move(10, "todo", { after: "PVTI_9" }));
});

test("a move of the first card in project order goes back to the top", () => {
	expect(roundTrip(move(1, "done", { after: "PVTI_2" }))).toEqual(move(1, "progress", "top"));
});

test("a move that keeps its position goes back keeping it", () => {
	expect(roundTrip(move(11, "progress", "keep"))).toEqual(move(11, "todo", "keep"));
});

test("an assignment swaps add and remove, and skips what changed nothing", () => {
	const intent: Intent = { ...base, type: "set_assignees", item_id: "PVTI_10", add: [hor, lea], remove: [] };
	expect(roundTrip(intent)).toEqual({ ...intent, add: [], remove: [hor] });
	const noop: Intent = { ...base, type: "set_assignees", item_id: "PVTI_9", add: [], remove: [lea] };
	expect(inverse(board(), noop)).toBeNull();
});

test("an archive goes back as an unarchive that carries the card", () => {
	const undo = roundTrip({ ...base, type: "archive", item_id: "PVTI_10" });
	expect(undo).toMatchObject({ type: "unarchive", column: "todo", card: { item_id: "PVTI_10" } });
	expect(inverse(board(), undo)).toEqual({ ...base, type: "archive", item_id: "PVTI_10" });
});

test("a new draft cannot be undone", () => {
	const create: Intent = {
		...base,
		type: "create_draft",
		item_id: "draft:1",
		field_id: "F_status",
		column: "todo",
		title: "Planche test draft",
	};
	expect(inverse(board(), create)).toBeNull();
});

test("each intent says what it did", () => {
	expect(label(board(), move(11, "done", "keep"))).toBe("#11 moved to Done");
	expect(label(board(), { ...base, type: "set_assignees", item_id: "PVTI_11", add: [hor], remove: [] })).toBe(
		"Assigned HorebZ to #11",
	);
	expect(label(board(), { ...base, type: "archive", item_id: "PVTI_11" })).toBe("#11 archived");
});
