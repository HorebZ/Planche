import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "system" | "light" | "dark";
type Preferences = {
  theme: Theme;
  hiddenProjects: Record<string, string[]>;
  setTheme: (theme: Theme) => void;
  setProjectHidden: (account: string, id: string, hidden: boolean) => void;
};

export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      theme: "system",
      hiddenProjects: {},
      setTheme: (theme) => set({ theme }),
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
