import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProjectTone } from "@/components/ui/sidebar";

type Theme = "system" | "light" | "dark";
type Preferences = {
  theme: Theme;
  hiddenProjects: Record<string, string[]>;
  projectColors: Record<string, Record<string, ProjectTone>>;
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
