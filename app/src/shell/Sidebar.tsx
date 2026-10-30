import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { EyeOff, Search, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SettingsDialog } from "@/components/ui/settings";
import {
  defaultProjectTones,
  Sidebar,
  SidebarAccount,
  SidebarFooter,
  SidebarGroup,
} from "@/components/ui/sidebar";
import { SidebarProject } from "@/components/ui/sidebar-project";
import { commands, type ProjectId, type SyncInterval } from "@/ipc/bindings";
import { useAuth, useProjects, useSetSyncPrefs, useSyncPrefs, useSyncStatus } from "@/ipc/queries";
import { keysOf, shortcuts } from "@/keyboard/shortcuts";
import { usePreferences } from "@/stores/preferences";
import { useUi } from "@/stores/ui";
import { footerText } from "./syncText";

type AppSidebarProps = {
  projectId: ProjectId | null;
  cardCount?: number;
  syncedAt: string | null;
  onSelect: (projectId: ProjectId) => void;
  onSearch: () => void;
};

export async function signOut(queryClient: QueryClient) {
  await commands.authSignOut();
  await queryClient.invalidateQueries({ queryKey: ["auth"] });
}

export function AppSidebar({
  projectId,
  cardCount,
  syncedAt,
  onSelect,
  onSearch,
}: AppSidebarProps) {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const projects = useProjects();
  const login = auth.data?.login ?? "";
  const { hiddenProjects, setProjectHidden, projectColors, setProjectColor } = usePreferences();
  const [showHidden, setShowHidden] = useState(false);
  const hidden = hiddenProjects[login] ?? [];
  const all =
    projects.data?.owners.flatMap((owner) => owner.projects).filter((p) => !p.closed) ?? [];
  const visibleProjects = all.filter((p) => !hidden.includes(p.id));
  const hiddenItems = all.filter((p) => hidden.includes(p.id));
  const renderProject = (project: (typeof all)[number], isHidden: boolean) => (
    <SidebarProject
      key={project.id}
      name={project.title}
      tone={
        projectColors[login]?.[project.id] ??
        defaultProjectTones[project.number % defaultProjectTones.length]
      }
      onToneChange={(tone) => setProjectColor(login, project.id, tone)}
      count={project.id === projectId ? cardCount : undefined}
      active={project.id === projectId}
      hidden={isHidden}
      onOpen={() => onSelect(project.id)}
      onOpenGitHub={() => project.url && openUrl(project.url)}
      onHide={() => setProjectHidden(login, project.id, !isHidden)}
    />
  );
  return (
    <Sidebar>
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarAccount
              login={login}
              avatarUrl={auth.data?.avatar_url ?? undefined}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[216px]">
            <DropdownMenuLabel>Signed in as {login}</DropdownMenuLabel>
            <DropdownMenuItem
              variant="destructive"
              onSelect={async () => {
                await commands.authSignOut();
                await queryClient.invalidateQueries({ queryKey: ["auth"] });
              }}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search issues ⌘K"
          onClick={onSearch}
          className="size-7 text-fg-3"
        >
          <Search className="size-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto">
        <SidebarGroup title="Projects">
          {visibleProjects.map((project) => renderProject(project, false))}
          {showHidden ? hiddenItems.map((project) => renderProject(project, true)) : null}
          {hiddenItems.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowHidden(!showHidden)}
              aria-expanded={showHidden}
              className="flex h-7 items-center gap-2.5 rounded-md px-2.5 text-left text-fg-3 hover:bg-hover focus-visible:shadow-ring"
            >
              <EyeOff className="size-4" />
              {showHidden ? "Collapse hidden" : `${hiddenItems.length} hidden`}
            </button>
          ) : null}
        </SidebarGroup>
      </div>
      <span className="flex-1" />
      <SyncFooter syncedAt={syncedAt} />
    </Sidebar>
  );
}

function SyncFooter({ syncedAt }: { syncedAt: string | null }) {
  const status = useSyncStatus();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const prefs = useSyncPrefs();
  const setPrefs = useSetSyncPrefs();
  const { theme, setTheme } = usePreferences();
  const settingsOpen = useUi((s) => s.overlay?.type === "settings");
  const setSettingsOpen = (open: boolean) =>
    useUi.getState().open(open ? { type: "settings" } : null);
  const showSettings = () => setSettingsOpen(true);
  const now = useNow(30_000);
  const { tone, text } = footerText(status.data, syncedAt, now);
  return (
    <>
      <SidebarFooter
        tone={tone}
        text={text}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Settings ⌘,"
          onClick={showSettings}
          className="size-6 text-fg-3 hover:text-fg"
        >
          <Settings className="size-[17px]" />
        </Button>
      </SidebarFooter>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        login={auth.data?.login ?? ""}
        interval={prefs.data?.interval ?? "five_minutes"}
        onIntervalChange={(interval) =>
          prefs.data && setPrefs.mutate({ ...prefs.data, interval: interval as SyncInterval })
        }
        onWake={prefs.data?.on_wake ?? true}
        onWakeChange={(on_wake) => prefs.data && setPrefs.mutate({ ...prefs.data, on_wake })}
        theme={theme}
        onThemeChange={setTheme}
        onSignOut={async () => {
          await commands.authSignOut();
          await queryClient.invalidateQueries({ queryKey: ["auth"] });
        }}
        shortcuts={shortcuts
          .filter((s, index) => shortcuts.findIndex((row) => row.command === s.command) === index)
          .map((s) => ({ label: s.label, keys: keysOf(s.key).join("") }))}
      />
    </>
  );
}

/** The current time, refreshed every `ms`, for relative times. */
function useNow(ms: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}
