import { openUrl } from "@tauri-apps/plugin-opener";
import { Columns3, Link, List, Search } from "lucide-react";
import { statusTone } from "@/board/statusTone";
import { Button } from "@/components/ui/button";
import { DisplayMenu, type DisplayProperty } from "@/components/ui/display-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ProjectTone, projectTones } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusFilter } from "@/components/ui/status-filter";
import { SyncIndicator } from "@/components/ui/sync-indicator";
import type { Board, ProjectMeta, SyncStatus, ViewId } from "@/ipc/bindings";
import type { ProjectLayout } from "@/stores/preferences";
import { busyLabel, footerText } from "./syncText";

type ToolbarProps = {
  tone: ProjectTone;
  board: Board | null | undefined;
  project: ProjectMeta | null | undefined;
  status: SyncStatus | undefined;
  error?: string | null;
  onSelectView: (viewId: ViewId) => void;
  layout: ProjectLayout;
  onLayoutChange: (layout: ProjectLayout) => void;
  onSearch: () => void;
  hiddenProperties?: DisplayProperty[];
  onPropertyChange: (property: DisplayProperty, visible: boolean) => void;
  statuses: (string | null)[];
  onStatusesChange: (statuses: (string | null)[]) => void;
  filterOpen: boolean;
  onFilterOpenChange: (open: boolean) => void;
  onFilterClose: (event: Event) => void;
  dragging: boolean;
  visibleCount: number;
};

export function Toolbar({
  tone,
  board,
  project,
  status,
  error,
  onSelectView,
  layout,
  onLayoutChange,
  onSearch,
  hiddenProperties,
  onPropertyChange,
  statuses,
  onStatusesChange,
  filterOpen,
  onFilterOpenChange,
  onFilterClose,
  dragging,
  visibleCount,
}: ToolbarProps) {
  const busy = busyLabel(status, !board);
  const feedback = footerText(status, board?.synced_at ?? null, Date.now(), error);
  const failed = feedback.tone === "offline";
  const loading = !board && !failed;
  const boardViews = project?.views.filter((v) => v.layout === "Board") ?? [];
  const currentView = project?.views.find((v) => v.number === board?.view?.number);
  const count = board?.columns.reduce((n, c) => n + c.cards.length, 0) ?? 0;

  return (
    <header className="shrink-0">
      <div
        data-tauri-drag-region
        className="flex h-12 items-center gap-2 pr-3 pl-[18px]"
      >
        {board ? (
          <>
            <span
              aria-hidden
              data-slot="project-color"
              className={`size-2.5 rounded-[3px] ${projectTones[tone]}`}
            />
            <span className="truncate font-medium">{board.project.title}</span>
            <span
              aria-hidden
              className="text-fg-3"
            >
              /
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`GitHub view: ${board.view?.name ?? "No GitHub view"}`}
                className="flex h-7 min-w-0 items-center gap-2 rounded-md px-0.5 text-fg-2 outline-none hover:bg-hover focus-visible:shadow-ring"
              >
                <span className="truncate">{board.view?.name ?? "No GitHub view"}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[240px]">
                <DropdownMenuLabel>Project views</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={currentView?.id}
                  onValueChange={onSelectView}
                >
                  {boardViews.map((view) => (
                    <DropdownMenuRadioItem
                      key={view.id}
                      value={view.id}
                    >
                      {view.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <Skeleton className="h-3 w-[140px] rounded-xs" />
        )}
        <span className="flex-1" />
        <SyncIndicator
          state={
            failed
              ? "offline"
              : busy || loading
                ? "busy"
                : status || board?.synced_at
                  ? "idle"
                  : "unknown"
          }
          label={
            failed
              ? status?.state.type === "offline" && !error
                ? "Offline"
                : feedback.text
              : (busy ?? (loading ? "Loading project…" : undefined))
          }
          title={failed ? feedback.text : undefined}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open project on GitHub"
          disabled={!board}
          onClick={() => board && openUrl(board.project.url)}
          className="size-7 text-fg-3"
        >
          <Link className="size-4" />
        </Button>
      </div>
      <div className="flex h-[42px] items-center gap-1.5 pr-3 pl-4">
        <fieldset
          aria-label="Project layout"
          className="flex gap-1.5"
        >
          {(
            [
              { id: "board", label: "Board", Icon: Columns3 },
              { id: "list", label: "List", Icon: List },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={layout === id}
              disabled={!board}
              onClick={() => onLayoutChange(id)}
              className={`flex h-7 items-center gap-1.5 rounded-full px-3 font-medium focus-visible:shadow-ring ${layout === id ? "bg-active" : "text-fg-2 shadow-[inset_0_0_0_1px_var(--pl-border-strong)] hover:bg-hover"}`}
            >
              <Icon className="size-[15px] text-fg-3" />
              {label}
            </button>
          ))}
        </fieldset>
        <StatusFilter
          options={
            board?.columns.map((column) => ({
              id: column.option_id,
              name: column.name,
              status: statusTone(column.color, column.name),
            })) ?? []
          }
          selected={statuses}
          onChange={onStatusesChange}
          open={filterOpen}
          onOpenChange={onFilterOpenChange}
          onCloseAutoFocus={onFilterClose}
          disabled={!board || dragging}
        />
        {statuses.length ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={dragging}
            onClick={() => onStatusesChange([])}
          >
            Clear filters
          </Button>
        ) : null}
        <span className="flex-1" />
        {board ? (
          <span className="mr-2 text-[12px] text-fg-3 tabular-nums">
            {statuses.length ? `${visibleCount}/${count}` : count} issues
          </span>
        ) : null}
        <DisplayMenu
          hidden={hiddenProperties}
          onChange={onPropertyChange}
          disabled={!board}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search issues ⌘K"
          onClick={onSearch}
          className="size-[30px] rounded-full shadow-[inset_0_0_0_1px_var(--pl-border-strong)]"
        >
          <Search className="size-4" />
        </Button>
      </div>
    </header>
  );
}
