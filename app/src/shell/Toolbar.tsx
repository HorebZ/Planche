import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpRight, Columns3, Search } from "lucide-react";
import { useMemo } from "react";
import { statusTone } from "@/board/statusTone";
import { BoardFilter, type BoardFilters } from "@/components/ui/board-filter";
import { Button } from "@/components/ui/button";
import { DisplayMenu, type DisplayProperty } from "@/components/ui/display-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewButton } from "@/components/ui/view-button";
import type { Board, ProjectMeta, User, ViewId } from "@/ipc/bindings.types";
import type { ProjectLayout } from "@/stores/preferences";

type ToolbarProps = {
  board: Board | null | undefined;
  project: ProjectMeta | null | undefined;
  onSelectView: (viewId: ViewId) => void;
  layout: ProjectLayout;
  onLayoutChange: (layout: ProjectLayout) => void;
  onSearch: () => void;
  hiddenProperties?: DisplayProperty[];
  onPropertyChange: (property: DisplayProperty, visible: boolean) => void;
  filters: BoardFilters;
  onFiltersChange: (filters: BoardFilters) => void;
  viewer: User | null;
  filterOpen: boolean;
  onFilterOpenChange: (open: boolean) => void;
  onFilterClose: (event: Event) => void;
  dragging: boolean;
  visibleCount: number;
};

export function Toolbar({
  board,
  project,
  onSelectView,
  layout,
  onLayoutChange,
  onSearch,
  hiddenProperties,
  onPropertyChange,
  filters,
  onFiltersChange,
  viewer,
  filterOpen,
  onFilterOpenChange,
  onFilterClose,
  dragging,
  visibleCount,
}: ToolbarProps) {
  const boardViews = project?.views.filter((v) => v.layout === "Board") ?? [];
  const currentView = project?.views.find((v) => v.number === board?.view?.number);
  const count = board?.columns.reduce((n, c) => n + c.cards.length, 0) ?? 0;

  const filtering = Object.values(filters).some((values) => values.length);
  const viewerId = viewer?.id;
  const viewerLogin = viewer?.login;
  const filterGroups = useMemo(() => {
    const cards = board?.columns.flatMap((column) => column.cards) ?? [];
    const assignees = new Map(
      cards.flatMap((card) =>
        "assignees" in card ? card.assignees.map((user) => [user.id, user.login] as const) : [],
      ),
    );

    if (viewerId) {
      assignees.set(viewerId, `Me (${viewerLogin})`);
    }

    const labels = [
      ...new Set(
        cards.flatMap((card) => ("labels" in card ? card.labels.map((label) => label.name) : [])),
      ),
    ].sort();
    const repositories = [
      ...new Set(cards.flatMap((card) => ("repo" in card ? [card.repo] : []))),
    ].sort();

    return [
      {
        key: "statuses",
        name: "Status",
        options:
          board?.columns.map((column) => ({
            id: column.option_id,
            name: column.name,
            status: statusTone(column.color, column.name),
          })) ?? [],
      },
      {
        key: "assignees",
        name: "Assignee",
        options: [...assignees]
          .sort((left, right) => left[1].localeCompare(right[1]))
          .map(([id, name]) => ({ id, name })),
      },
      { key: "labels", name: "Label", options: labels.map((name) => ({ id: name, name })) },
      {
        key: "repositories",
        name: "Repository",
        options: repositories.map((name) => ({ id: name, name })),
      },
    ] satisfies Parameters<typeof BoardFilter<keyof BoardFilters>>[0]["groups"];
  }, [board, viewerId, viewerLogin]);

  return (
    <header
      data-slot="project-toolbar"
      className="shrink-0"
    >
      <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 py-1.5 pr-3 pl-4">
        <fieldset
          aria-label="Project views"
          className="flex min-w-0 gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        >
          {boardViews.map((view) => (
            <ViewButton
              key={view.id}
              aria-pressed={currentView?.id === view.id}
              disabled={!board || dragging}
              onClick={() => currentView?.id !== view.id && onSelectView(view.id)}
              className="max-w-[220px] shrink-0"
              title={view.name}
            >
              <Columns3 />
              <span className="truncate">{view.name}</span>
            </ViewButton>
          ))}
          {!board ? <Skeleton className="h-7 w-[100px] rounded-full" /> : null}
        </fieldset>
        {project?.can_update === false ? (
          <span className="text-fg-3 text-xs">Read-only</span>
        ) : null}
        <BoardFilter<keyof BoardFilters>
          groups={filterGroups}
          selected={filters}
          onChange={onFiltersChange}
          open={filterOpen}
          onOpenChange={onFilterOpenChange}
          onCloseAutoFocus={onFilterClose}
          disabled={!board || dragging}
        />
        <span className="flex-1" />
        {board ? (
          <span className="mr-2 text-[12px] text-fg-3 tabular-nums">
            {filtering ? `${visibleCount}/${count}` : count} issues
          </span>
        ) : null}
        <DisplayMenu
          layout={layout}
          onLayoutChange={onLayoutChange}
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
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open project on GitHub"
          disabled={!board}
          onClick={() => board && openUrl(board.project.url)}
          className="size-7 text-fg-3"
        >
          <ArrowUpRight className="size-4" />
        </Button>
      </div>
    </header>
  );
}
