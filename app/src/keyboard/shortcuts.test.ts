import { expect, test } from "vitest";
import type { Board, Card } from "@/ipc/bindings";
import { commandFor, keysOf, navigate, shortcuts } from "./shortcuts";

test("no two shortcuts share a key in one scope", () => {
	const seen = new Map<string, string>();
	for (const { key, scope, command } of shortcuts) {
		const id = `${scope} ${key}`;
		expect(seen.get(id), `${id} runs ${seen.get(id)} and ${command}`).toBeUndefined();
		seen.set(id, command);
	}
});

test("events resolve to the command of their scope", () => {
	const key = (init: Partial<KeyboardEvent>) => ({ metaKey: false, shiftKey: false, ...init }) as KeyboardEvent;
	expect(commandFor(key({ key: "j" }), "board")).toBe("card.next");
	expect(commandFor(key({ key: "J", shiftKey: true }), "board")).toBeUndefined();
	expect(commandFor(key({ key: "ArrowRight", shiftKey: true }), "board")).toBe("card.moveNext");
	expect(commandFor(key({ key: "C", metaKey: true, shiftKey: true }), "board")).toBe("card.copyLink");
	expect(commandFor(key({ key: "?", shiftKey: true }), "global")).toBe("help.open");
	expect(commandFor(key({ key: "k", metaKey: true }), "global")).toBe("palette.open");
	expect(commandFor(key({ key: "3" }), "menu")).toBe("status.3");
	expect(commandFor(key({ key: "6" }), "menu")).toBe("status.6");
	expect(commandFor(key({ key: ",", metaKey: true }), "global")).toBe("settings.open");
	expect(commandFor(key({ key: "H", metaKey: true, shiftKey: true }), "sidebar")).toBe("sidebar.hide");
	expect(keysOf("Meta+Shift+c")).toEqual(["⌘", "⇧", "C"]);
});

const card = (id: string): Card => ({
	item_id: id,
	position: 0,
	kind: "draft",
	id: "",
	title: id,
	assignees: [],
	pending: false,
	updated_by_sync: false,
});

/** Todo a b c, an empty In Progress, Done d. */
const board = {
	columns: [
		{ option_id: "todo", name: "Todo", color: null, cards: [card("a"), card("b"), card("c")] },
		{ option_id: "progress", name: "In Progress", color: null, cards: [] },
		{ option_id: "done", name: "Done", color: null, cards: [card("d")] },
	],
} as unknown as Board;

test("navigation stays in its column, keeps the nearest index, and skips empty columns", () => {
	expect(navigate(board, null, "next")).toBe("a");
	expect(navigate(board, "a", "next")).toBe("b");
	expect(navigate(board, "c", "next")).toBe("c");
	expect(navigate(board, "a", "prev")).toBe("a");
	expect(navigate(board, "c", "right")).toBe("d");
	expect(navigate(board, "d", "left")).toBe("a");
	expect(navigate(board, "d", "right")).toBe("d");
	expect(navigate(board, "gone", "left")).toBe("a");
});
