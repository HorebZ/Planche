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
  | { type: "draft"; column: OptionId | null; editor: string };

type UiState = {
  /** The project the user picked in this session. `null` falls back to the last opened one. */
  projectId: ProjectId | null;
  viewId: ViewId | null;
  /** The card the keyboard acts on. It holds the focus ring. */
  selectedId: ItemId | null;
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
  selectProject: (projectId: ProjectId) => void;
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
  projectId: null,
  viewId: null,
  selectedId: null,
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
      overlay: null,
      viewId: null,
      selectedId: null,
      revealId: null,
      undo: null,
      actionVersion: s.actionVersion + 1,
      contextVersion: s.contextVersion + 1,
    })),
  selectView: (viewId) =>
    set((s) => ({
      viewId,
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
