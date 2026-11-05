import { create } from "zustand";
import type { RepositoryIssueFilter } from "@/ipc/bindings.types";
import { useUi } from "./ui";

export const emptyRepositoryView = {
  filter: { state: "open", milestone: null, labels: [] } as RepositoryIssueFilter,
  scrollTop: 0,
  detail: null as string | null,
  selected: null as string | null,
  expanded: false,
  tabs: [] as string[],
  activeTab: null as string | null,
};
export const repositoryViewKey = (account: string, repository: string) =>
  JSON.stringify([account, repository]);

type View = typeof emptyRepositoryView;

export const useRepositoryViews = create<{
  active: { account: string; repository: string } | null;
  entries: Record<string, View>;
  open: (account: string, repository: string, filter?: RepositoryIssueFilter) => void;
  close: () => void;
  update: (key: string, changes: Partial<View>) => void;
}>((set) => ({
  active: null,
  entries: {},
  open: (account, repository, filter) => {
    useUi.getState().setLinkedIssue(null);

    set((state) => {
      const key = repositoryViewKey(account, repository);

      return {
        active: { account, repository },
        entries: filter
          ? { ...state.entries, [key]: { ...emptyRepositoryView, filter } }
          : state.entries,
      };
    });
  },
  close: () => set({ active: null }),
  update: (key, changes) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: { ...(state.entries[key] ?? emptyRepositoryView), ...changes },
      },
    })),
}));
