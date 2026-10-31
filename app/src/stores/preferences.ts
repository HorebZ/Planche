import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProjectTone } from "@/components/ui/sidebar";

type Theme = "system" | "light" | "dark";
export type ProjectLayout = "board" | "list";
type ViewPreferences = { layout: ProjectLayout; collapsedGroups: string[] };
type Preferences = {
  theme: Theme;
  hiddenProjects: Record<string, string[]>;
  projectColors: Record<string, Record<string, ProjectTone>>;
  views: Record<string, ViewPreferences>;
  setLayout: (context: string, layout: ProjectLayout) => void;
  setGroupExpanded: (context: string, group: string, expanded: boolean) => void;
  setTheme: (theme: Theme) => void;
  setProjectHidden: (account: string, id: string, hidden: boolean) => void;
  setProjectColor: (account: string, id: string, color: ProjectTone) => void;
};

export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      theme: "system",
      hiddenProjects: {},
      projectColors: {},
      views: {},
      setLayout: (context, layout) =>
        set((state) => ({
          views: {
            ...state.views,
            [context]: { ...(state.views[context] ?? { collapsedGroups: [] }), layout },
          },
        })),
      setGroupExpanded: (context, group, expanded) =>
        set((state) => {
          const current = state.views[context] ?? { layout: "board", collapsedGroups: [] };

          return {
            views: {
              ...state.views,
              [context]: {
                ...current,
                collapsedGroups: expanded
                  ? current.collapsedGroups.filter((id) => id !== group)
                  : [...new Set([...current.collapsedGroups, group])],
              },
            },
          };
        }),
      setTheme: (theme) => set({ theme }),
      setProjectColor: (account, id, color) =>
        set((state) => ({
          projectColors: {
            ...state.projectColors,
            [account]: { ...state.projectColors[account], [id]: color },
          },
        })),
      setProjectHidden: (account, id, hidden) =>
        set((state) => ({
          hiddenProjects: {
            ...state.hiddenProjects,
            [account]: hidden
              ? [...new Set([...(state.hiddenProjects[account] ?? []), id])]
              : (state.hiddenProjects[account] ?? []).filter((item) => item !== id),
          },
        })),
    }),
    { name: "planche-ui-preferences" },
  ),
);
