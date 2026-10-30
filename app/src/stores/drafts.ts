import { create } from "zustand";
import type { DispatchResult } from "@/board/useActions";

export type DraftTicket = {
  key: string;
  editor: string;
  revision: number;
  title: string;
  id: string;
};
type Entry = { title: string; revision: number; ticket: DraftTicket | null; message: string };
export const emptyDraft: Entry = { title: "", revision: 0, ticket: null, message: "" };
export const draftKey = (account: string, project: string, column: string | null) =>
  JSON.stringify([account, project, column]);
export const useDrafts = create<{
  entries: Record<string, Entry>;
  edit: (key: string, title: string) => void;
  begin: (key: string, editor: string) => DraftTicket | null;
  finish: (ticket: DraftTicket, result: DispatchResult) => boolean;
}>((set, get) => ({
  entries: {},
  edit: (key, title) =>
    set((s) => {
      const entry = s.entries[key] ?? emptyDraft;
      return {
        entries: { ...s.entries, [key]: { ...entry, title, revision: entry.revision + 1 } },
      };
    }),
  begin: (key, editor) => {
    const entry = get().entries[key] ?? emptyDraft;
    if (entry.ticket || !entry.title.trim()) {
      return null;
    }
    const ticket = {
      key,
      editor,
      revision: entry.revision,
      title: entry.title.trim(),
      id: crypto.randomUUID(),
    };
    set((s) => ({ entries: { ...s.entries, [key]: { ...entry, ticket, message: "Saving…" } } }));
    return ticket;
  },
  finish: (ticket, result) => {
    const entry = get().entries[ticket.key];
    if (!entry || entry.ticket?.id !== ticket.id) {
      return false;
    }
    const clear = result.type === "accepted" && entry.revision === ticket.revision;
    set((s) => ({
      entries: {
        ...s.entries,
        [ticket.key]: {
          ...entry,
          title: clear ? "" : entry.title,
          ticket: result.type === "unknown" ? ticket : null,
          message:
            result.type === "unknown"
              ? "Not confirmed — sending again is blocked"
              : result.type === "rejected"
                ? result.error.message
                : "",
        },
      },
    }));
    return clear;
  },
}));
