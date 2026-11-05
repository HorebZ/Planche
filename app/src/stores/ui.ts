import { create } from "zustand";
import type { Rect } from "@/board/flip";
import { type BoardFilters, emptyFilters } from "@/components/ui/board-filter";
import type { Intent, ItemId, OptionId, ProjectId, ViewId } from "@/ipc/bindings.types";

/** What sits over the board and takes the keyboard. `draft` is the new-draft field of a column. */
export type Overlay =
  | { type: "palette" }
  | { type: "status" }
  | { type: "assign" }
  | { type: "help" }
  | { type: "settings" }
  | { type: "filters" }
  | { type: "draft"; column: OptionId | null; editor: string };

export type IssueTab = {
  id: string;
  projectId: ProjectId;
  viewId: ViewId | null;
  itemId: ItemId;
};

type UiState = {
  updatesOpen: boolean;
  setUpdatesOpen: (open: boolean) => void;
  /** The project the user picked in this session. `null` falls back to the last opened one. */
  projectId: ProjectId | null;
  viewId: ViewId | null;
  filters: BoardFilters;
  setFilters: (filters: BoardFilters) => void;
  /** The card the keyboard acts on. It holds the focus ring. */
  selectedId: ItemId | null;
  detailId: ItemId | null;
  linkedIssue: { content: string; url: string } | null;
  setLinkedIssue: (issue: UiState["linkedIssue"]) => void;
  detailExpanded: boolean;
  setDetailExpanded: (expanded: boolean) => void;
  openDetail: (id: ItemId) => void;
  closeDetail: () => void;
  issueTabs: IssueTab[];
  activeIssueTab: string | null;
  openIssueTab: (tab: IssueTab) => void;
  activateIssueTab: (id: string | null) => void;
  closeIssueTab: (id: string) => void;
  revealId: ItemId | null;
  revealCard: (id: ItemId) => void;
  finishReveal: (id: ItemId) => void;
  overlay: Overlay | null;
  /** The inverse of the last action, for the toast's Undo and ⌘Z. One level. */
  undo: { owner: number; intent: Intent; label: string } | null;
  actionVersion: number;
  /** Only context changes silence old warnings; starting another gesture must preserve them. */
  contextVersion: number;
  /** A card is lifted. Board updates wait for the drop, so nothing jumps under the pointer. */
  dragging: boolean;
  /** The card going back after a failed move, and where it was, to slide it back. */
  reverting: { id: ItemId; from: Rect } | null;
  selectProject: (projectId: ProjectId | null) => void;
  selectView: (viewId: ViewId | null) => void;
  select: (selectedId: ItemId | null) => void;
  open: (
    overlay:
      | Exclude<Overlay, { type: "draft" }>
      | { type: "draft"; column: OptionId | null }
      | null,
  ) => void;
  claimAction: () => number;
  invalidateUndo: () => void;
  acceptUndo: (owner: number, undo: UiState["undo"]) => boolean;
  takeUndo: (expectedOwner?: number) => UiState["undo"];
  setDragging: (dragging: boolean) => void;
  setReverting: (reverting: { id: ItemId; from: Rect } | null) => void;
};

export const useUi = create<UiState>()((set, get) => ({
  updatesOpen: false,
  setUpdatesOpen: (updatesOpen) => set({ updatesOpen }),
  projectId: null,
  viewId: null,
  filters: emptyFilters,
  setFilters: (filters) => {
    if (!get().dragging) {
      set({ filters });
    }
  },
  selectedId: null,
  detailId: null,
  linkedIssue: null,
  setLinkedIssue: (linkedIssue) =>
    set((state) => ({
      linkedIssue,
      overlay: null,
      undo: null,
      actionVersion: state.actionVersion + 1,
      contextVersion: state.contextVersion + 1,
    })),
  detailExpanded: false,
  setDetailExpanded: (detailExpanded) => set({ detailExpanded }),
  openDetail: (detailId) =>
    set((state) =>
      state.dragging
        ? state
        : {
            detailId,
            linkedIssue: null,
            detailExpanded: state.detailId ? state.detailExpanded : false,
            selectedId: state.detailId ? state.selectedId : detailId,
            overlay: null,
          },
    ),
  closeDetail: () =>
    set({ detailId: null, linkedIssue: null, detailExpanded: false, overlay: null }),
  issueTabs: [],
  activeIssueTab: null,
  openIssueTab: (tab) => {
    if (get().dragging) {
      return;
    }

    set((state) => ({
      projectId: state.projectId ?? tab.projectId,
      issueTabs: state.issueTabs.some((open) => open.id === tab.id)
        ? state.issueTabs
        : [...state.issueTabs, tab],
    }));
    get().activateIssueTab(tab.id);
  },
  activateIssueTab: (activeIssueTab) =>
    set((state) =>
      state.dragging ||
      (activeIssueTab !== null && !state.issueTabs.some((tab) => tab.id === activeIssueTab))
        ? state
        : {
            activeIssueTab,
            linkedIssue: null,
            detailId: null,
            detailExpanded: false,
            overlay: null,
            undo: null,
            actionVersion: state.actionVersion + 1,
            contextVersion: state.contextVersion + 1,
          },
    ),
  closeIssueTab: (id) => {
    const state = get();
    const index = state.issueTabs.findIndex((tab) => tab.id === id);

    if (index < 0 || state.dragging) {
      return;
    }

    const issueTabs = state.issueTabs.filter((tab) => tab.id !== id);

    set({ issueTabs });

    if (state.activeIssueTab === id) {
      get().activateIssueTab(issueTabs[Math.max(0, index - 1)]?.id ?? null);
    }
  },
  revealId: null,
  overlay: null,
  undo: null,
  actionVersion: 0,
  contextVersion: 0,
  dragging: false,
  reverting: null,
  selectProject: (projectId) =>
    set((s) => ({
      projectId,
      linkedIssue: null,
      overlay: null,
      viewId: null,
      filters: emptyFilters,
      selectedId: null,
      detailId: null,
      detailExpanded: false,
      activeIssueTab: null,
      revealId: null,
      undo: null,
      actionVersion: s.actionVersion + 1,
      contextVersion: s.contextVersion + 1,
    })),
  selectView: (viewId) =>
    set((s) => ({
      viewId,
      linkedIssue: null,
      detailId: null,
      detailExpanded: false,
      activeIssueTab: null,
      filters: emptyFilters,
      revealId: null,
      overlay: null,
      undo: null,
      actionVersion: s.actionVersion + 1,
      contextVersion: s.contextVersion + 1,
    })),
  select: (selectedId) => set({ selectedId }),
  revealCard: (id) => set({ selectedId: id, revealId: id }),
  finishReveal: (id) => {
    if (get().revealId === id) {
      set({ revealId: null });
    }
  },
  open: (overlay) =>
    set({
      overlay: overlay?.type === "draft" ? { ...overlay, editor: crypto.randomUUID() } : overlay,
    }),
  claimAction: () => {
    set((s) => ({ actionVersion: s.actionVersion + 1 }));

    return get().actionVersion;
  },
  invalidateUndo: () =>
    set((s) => ({
      detailId: null,
      linkedIssue: null,
      detailExpanded: false,
      issueTabs: [],
      activeIssueTab: null,
      filters: emptyFilters,
      revealId: null,
      overlay: null,
      undo: null,
      actionVersion: s.actionVersion + 1,
      contextVersion: s.contextVersion + 1,
    })),
  acceptUndo: (owner, undo) => {
    let accepted = false;

    set((s) => {
      if (s.actionVersion !== owner) {
        return s;
      }

      accepted = true;

      return { undo };
    });

    return accepted;
  },
  takeUndo: (expectedOwner) => {
    let taken: UiState["undo"] = null;

    set((s) => {
      if (!s.undo || (expectedOwner !== undefined && s.undo.owner !== expectedOwner)) {
        return s;
      }

      taken = s.undo;

      return { undo: null, actionVersion: s.actionVersion + 1 };
    });

    return taken;
  },
  setDragging: (dragging) => set({ dragging }),
  setReverting: (reverting) => set({ reverting }),
}));
