import { create } from "zustand";
import type { Rect } from "@/board/flip";
import type { Intent, ItemId, OptionId, ProjectId, ViewId } from "@/ipc/bindings";

/** What sits over the board and takes the keyboard. `draft` is the new-draft field of a column. */
export type Overlay =
	| { type: "palette" }
	| { type: "status" }
	| { type: "assign" }
	| { type: "help" }
	| { type: "settings" }
	| { type: "draft"; column: OptionId | null };

type UiState = {
	/** The project the user picked in this session. `null` falls back to the last opened one. */
	projectId: ProjectId | null;
	viewId: ViewId | null;
	/** The card the keyboard acts on. It holds the focus ring. */
	selectedId: ItemId | null;
	overlay: Overlay | null;
	/** The inverse of the last action, for the toast's Undo and ⌘Z. One level. */
	undo: { intent: Intent; label: string } | null;
	/** A card is lifted. Board updates wait for the drop, so nothing jumps under the pointer. */
	dragging: boolean;
	/** The card going back after a failed move, and where it was, to slide it back. */
	reverting: { id: ItemId; from: Rect } | null;
	selectProject: (projectId: ProjectId) => void;
	selectView: (viewId: ViewId | null) => void;
	select: (selectedId: ItemId | null) => void;
	open: (overlay: Overlay | null) => void;
	setUndo: (undo: UiState["undo"]) => void;
	setDragging: (dragging: boolean) => void;
	setReverting: (reverting: { id: ItemId; from: Rect } | null) => void;
};

export const useUi = create<UiState>()((set) => ({
	projectId: null,
	viewId: null,
	selectedId: null,
	overlay: null,
	undo: null,
	dragging: false,
	reverting: null,
	selectProject: (projectId) => set({ projectId, viewId: null, selectedId: null, undo: null }),
	selectView: (viewId) => set({ viewId }),
	select: (selectedId) => set({ selectedId }),
	open: (overlay) => set({ overlay }),
	setUndo: (undo) => set({ undo }),
	setDragging: (dragging) => set({ dragging }),
	setReverting: (reverting) => set({ reverting }),
}));
