import { create } from "zustand";
import type { ItemId, ProjectId, ViewId } from "@/ipc/bindings";

type UiState = {
	/** The project the user picked in this session. `null` falls back to the last opened one. */
	projectId: ProjectId | null;
	viewId: ViewId | null;
	/** A card is lifted. Board updates wait for the drop, so nothing jumps under the pointer. */
	dragging: boolean;
	/** The card going back after a failed move, which animates to its old place. */
	reverting: ItemId | null;
	selectProject: (projectId: ProjectId) => void;
	selectView: (viewId: ViewId | null) => void;
	setDragging: (dragging: boolean) => void;
	setReverting: (itemId: ItemId | null) => void;
};

export const useUi = create<UiState>()((set) => ({
	projectId: null,
	viewId: null,
	dragging: false,
	reverting: null,
	selectProject: (projectId) => set({ projectId, viewId: null }),
	selectView: (viewId) => set({ viewId }),
	setDragging: (dragging) => set({ dragging }),
	setReverting: (reverting) => set({ reverting }),
}));
