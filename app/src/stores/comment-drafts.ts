import { create } from "zustand";

type Entry = { body: string; request: string | null; saving: boolean; error: string | null };
export const emptyComment: Entry = { body: "", request: null, saving: false, error: null };
export const commentKey = (account: string, content: string) => JSON.stringify([account, content]);
type Ticket = { key: string; request: string; body: string };

export const useCommentDrafts = create<{
  entries: Record<string, Entry>;
  edit: (key: string, body: string) => void;
  begin: (key: string) => Ticket | null;
  finish: (ticket: Ticket, accepted: boolean, error?: string) => void;
}>((set, get) => ({
  entries: {},
  edit: (key, body) =>
    set((state) => ({ entries: { ...state.entries, [key]: { ...emptyComment, body } } })),
  begin: (key) => {
    const entry = get().entries[key] ?? emptyComment;

    if (entry.saving || !entry.body.trim()) {
      return null;
    }

    const request = entry.request ?? crypto.randomUUID();
    set((state) => ({
      entries: { ...state.entries, [key]: { ...entry, request, saving: true, error: null } },
    }));

    return { key, request, body: entry.body };
  },
  finish: (ticket, accepted, error) => {
    const entry = get().entries[ticket.key];

    if (entry?.request !== ticket.request || entry.body !== ticket.body) {
      return;
    }

    set((state) => ({
      entries: {
        ...state.entries,
        [ticket.key]: accepted ? emptyComment : { ...entry, saving: false, error: error ?? null },
      },
    }));
  },
}));
