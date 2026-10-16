import type { Board, ItemId } from "@/ipc/bindings";

export type Scope = "global" | "board" | "menu" | "palette" | "dialog";

/** One key per row. `key` is `KeyboardEvent.key`, after `Meta+` and `Shift+` when held. */
type Shortcut = { key: string; command: string; scope: Scope; label: string };

/** Every keyboard shortcut of the app. The handlers, the palette hints and the `?` sheet read it. */
export const shortcuts = [
	{ key: "Meta+k", command: "palette.open", scope: "global", label: "Command palette" },
	{ key: "c", command: "issue.new", scope: "global", label: "New issue" },
	{ key: "Meta+r", command: "sync.now", scope: "global", label: "Sync now" },
	{ key: "?", command: "help.open", scope: "global", label: "All shortcuts" },

	{ key: "j", command: "card.next", scope: "board", label: "Next card" },
	{ key: "ArrowDown", command: "card.next", scope: "board", label: "Next card" },
	{ key: "k", command: "card.prev", scope: "board", label: "Previous card" },
	{ key: "ArrowUp", command: "card.prev", scope: "board", label: "Previous card" },
	{ key: "ArrowLeft", command: "column.prev", scope: "board", label: "Previous column" },
	{ key: "ArrowRight", command: "column.next", scope: "board", label: "Next column" },
	{ key: "Enter", command: "card.open", scope: "board", label: "Open" },
	{ key: "Meta+o", command: "card.github", scope: "board", label: "Open on GitHub" },
	{ key: "Escape", command: "selection.clear", scope: "board", label: "Close, then clear the selection" },
	{ key: "Shift+ArrowRight", command: "card.moveNext", scope: "board", label: "Move to the next column" },
	{ key: "Shift+ArrowLeft", command: "card.movePrev", scope: "board", label: "Move to the previous column" },
	{ key: "s", command: "card.status", scope: "board", label: "Status" },
	{ key: "i", command: "card.assignMe", scope: "board", label: "Assign me" },
	{ key: "Meta+Shift+c", command: "card.copyLink", scope: "board", label: "Copy link" },
	{ key: "Meta+z", command: "undo", scope: "board", label: "Undo" },

	{ key: "1", command: "status.1", scope: "menu", label: "First status" },
	{ key: "2", command: "status.2", scope: "menu", label: "Second status" },
	{ key: "3", command: "status.3", scope: "menu", label: "Third status" },
	{ key: "4", command: "status.4", scope: "menu", label: "Fourth status" },
	{ key: "5", command: "status.5", scope: "menu", label: "Fifth status" },

	{ key: "ArrowUp", command: "palette.prev", scope: "palette", label: "Navigate" },
	{ key: "ArrowDown", command: "palette.next", scope: "palette", label: "Navigate" },
	{ key: "Enter", command: "palette.run", scope: "palette", label: "Run" },
	{ key: "Backspace", command: "palette.clearContext", scope: "palette", label: "Clear" },
	{ key: "?", command: "help.open", scope: "palette", label: "All shortcuts" },

	{ key: "Escape", command: "dialog.close", scope: "dialog", label: "Close" },
] as const satisfies readonly Shortcut[];

export type CommandId = (typeof shortcuts)[number]["command"];

const glyphs: Record<string, string> = {
	Meta: "⌘",
	Shift: "⇧",
	ArrowUp: "↑",
	ArrowDown: "↓",
	ArrowLeft: "←",
	ArrowRight: "→",
	Enter: "↵",
	Escape: "esc",
	Backspace: "⌫",
};

/** The keys of a shortcut as the `Kbd` chips draw them: `["⇧", "→"]`. */
export function keysOf(key: string): string[] {
	return key.split("+").map((part) => glyphs[part] ?? part.toUpperCase());
}

/** The keys of the first shortcut that runs `command`. */
export function keysFor(command: CommandId, scope?: Scope): string[] {
	const row = shortcuts.find((s) => s.command === command && (!scope || s.scope === scope));
	return row ? keysOf(row.key) : [];
}

/** The `key` string of an event, in the table's form. */
export function eventKey(event: KeyboardEvent): string {
	const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
	// A symbol such as `?` already says Shift.
	const shift = event.shiftKey && (key.length > 1 || /[a-z]/.test(key));
	return `${event.metaKey ? "Meta+" : ""}${shift ? "Shift+" : ""}${key}`;
}

/** The command `event` runs in `scope`, if any. */
export function commandFor(event: KeyboardEvent, scope: Scope): CommandId | undefined {
	if (event.ctrlKey || event.altKey) return undefined;
	const key = eventKey(event);
	return shortcuts.find((s) => s.scope === scope && s.key === key)?.command;
}

/** A field that takes text, where letter shortcuts would eat the user's typing. */
export function isTextField(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
	return target instanceof HTMLInputElement && !["checkbox", "radio", "button"].includes(target.type);
}

export type Direction = "next" | "prev" | "left" | "right";

/**
 * The card selected after a move of the selection. Up and down stay in the column; left and right
 * skip empty columns and keep the nearest index. Without a selection, the first card is picked.
 */
export function navigate(board: Board, selected: ItemId | null, direction: Direction): ItemId | null {
	const columns = board.columns;
	const column = columns.findIndex((c) => c.cards.some((card) => card.item_id === selected));
	if (column < 0) return columns.find((c) => c.cards.length > 0)?.cards[0].item_id ?? null;
	const cards = columns[column].cards;
	const index = cards.findIndex((card) => card.item_id === selected);
	if (direction === "next") return cards[Math.min(index + 1, cards.length - 1)].item_id;
	if (direction === "prev") return cards[Math.max(index - 1, 0)].item_id;
	const step = direction === "right" ? 1 : -1;
	for (let c = column + step; c >= 0 && c < columns.length; c += step) {
		const target = columns[c].cards;
		if (target.length > 0) return target[Math.min(index, target.length - 1)].item_id;
	}
	return selected;
}
