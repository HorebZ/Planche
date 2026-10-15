import { create } from "zustand";
import type { ProjectId, ViewId } from "@/ipc/bindings";

type UiState = {
	/** The project the user picked in this session. `null` falls back to the last opened one. */
	projectId: ProjectId | null;
	viewId: ViewId | null;
	selectProject: (projectId: ProjectId) => void;
	selectView: (viewId: ViewId | null) => void;
};

export const useUi = create<UiState>()((set) => ({
	projectId: null,
	viewId: null,
	selectProject: (projectId) => set({ projectId, viewId: null }),
	selectView: (viewId) => set({ viewId }),
}));
