import { useQueries, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AssigneePicker } from "@/board/AssigneePicker";
import { Board } from "@/board/Board";
import { EmptyBoard, LoadingBoard } from "@/board/BoardStates";
import { cardData, focusCard } from "@/board/Card";
import { filterBoard, selectionAfterRemoval } from "@/board/filter";
import { NewDraft } from "@/board/NewDraft";
import { StatusMenu } from "@/board/StatusMenu";
import { statusTone } from "@/board/statusTone";
import { type DispatchResult, useActions } from "@/board/useActions";
import { CommandPalette } from "@/command/CommandPalette";
import {
  archive,
  columnIndexOf,
  createDraft,
  moveTo,
  paletteCommands,
  toggleAssignee,
} from "@/command/commands";
import { ShortcutSheet } from "@/command/ShortcutSheet";
import { emptyFilters } from "@/components/ui/board-filter";
import { BoardErrorCard, NoFilterResults } from "@/components/ui/board-states";
import { IssueListGroup } from "@/components/ui/issue-list";
import { IssueTabPanel, IssueTabs } from "@/components/ui/issue-tabs";
import { defaultProjectTones } from "@/components/ui/sidebar";
import { notify } from "@/components/ui/toast";
import type { Card, Column, OptionId, ProjectId, User } from "@/ipc/bindings.types";
import {
  boardQuery,
  currentProjectQuery,
  errorMessage,
  projectQuery,
  useAuth,
  useBoard,
  useOpenProject,
  useProject,
  useProjects,
  useRefresh,
  useSyncStatus,
} from "@/ipc/queries";
import { type Direction, navigate } from "@/keyboard/shortcuts";
import { useShortcuts } from "@/keyboard/useShortcuts";
import { cn } from "@/lib/cn";
import { useSettledError } from "@/lib/useSettledError";
import { type ProjectLayout, usePreferences } from "@/stores/preferences";
import { useUi } from "@/stores/ui";
import { LinkedIssuePanel } from "./IssuePanel";
import { ProjectIssueDetail } from "./ProjectIssueDetail";
import { AppSidebar, signOut } from "./Sidebar";
import { SyncErrorToast } from "./SyncErrorToast";
import { footerText } from "./syncText";
import { Toolbar } from "./Toolbar";

/** The card's page on github.com. A draft has none, so its project's. */
function urlOf(card: Card, projectUrl: string) {
  return "url" in card ? card.url : projectUrl;
}

/** The main window: sidebar, toolbar, and the board of the open project. */
export function Shell({ projectId }: { projectId: ProjectId }) {
  const showPalette = () => show({ type: "palette" });
  const queryClient = useQueryClient();
  const viewId = useUi((s) => s.viewId);
  const selectedId = useUi((s) => s.selectedId);
  const detailId = useUi((s) => s.detailId);
  const linkedIssue = useUi((s) => s.linkedIssue);
  const detailExpanded = useUi((s) => s.detailExpanded);
  const issueTabs = useUi((s) => s.issueTabs);
  const activeIssueTab = useUi((s) => s.activeIssueTab);
  const boardTabs = useUi((s) => s.boardTabs);
  const activeBoardTab = useUi((s) => s.activeBoardTab);
  const sourceTabId = activeBoardTab ?? "source";
  const activeTab = issueTabs.find((tab) => tab.id === activeIssueTab);
  const revealId = useUi((s) => s.revealId);
  const overlay = useUi((s) => s.overlay);
  const filters = useUi((s) => s.filters);
  const filtering = Object.values(filters).some((values) => values.length);
  const dragging = useUi((s) => s.dragging);
  const drafting = overlay?.type === "draft";
  const { selectProject, selectView, select, open: show, setFilters } = useUi.getState();
  const board = useBoard(projectId, viewId);
  const tabSources = issueTabs.filter(
    (tab, index) =>
      issueTabs.findIndex(
        (source) => source.projectId === tab.projectId && source.viewId === tab.viewId,
      ) === index,
  );
  const sourceBoards = useQueries({
    queries: tabSources.map((tab) => boardQuery(tab.projectId, tab.viewId)),
  });
  const tabBoards = issueTabs.map(
    (tab) =>
      sourceBoards[
        tabSources.findIndex(
          (source) => source.projectId === tab.projectId && source.viewId === tab.viewId,
        )
      ],
  );
  const activeBoard = activeTab ? tabBoards[issueTabs.indexOf(activeTab)] : board;
  const actionProjectId = activeTab?.projectId ?? projectId;
  const actionViewId = activeTab ? activeTab.viewId : viewId;
  const project = useProject(projectId);
  const projects = useProjects();
  const status = useSyncStatus();
  const auth = useAuth();
  const hiddenProjects = usePreferences((s) => s.hiddenProjects[auth.data?.login ?? ""]);
  const projectColors = usePreferences((s) => s.projectColors[auth.data?.login ?? ""]);
  const projectList = projects.data?.owners.flatMap((owner) => owner.projects) ?? [];
  const firstProject = projectList.find(
    (project) => !project.closed && !hiddenProjects?.includes(project.id),
  );
  const boardProjects = [...new Set(boardTabs.map((tab) => tab.projectId))];
  const tabProjects = useQueries({ queries: boardProjects.map(projectQuery) });
  const openProject = useOpenProject();
  const refresh = useRefresh();
  const actions = useActions(actionProjectId, actionViewId);

  useLayoutEffect(() => {
    if (!boardTabs.length && !useUi.getState().boardTabs.length) {
      useUi.getState().openBoardTab(projectId);
    }
  }, [projectId, boardTabs.length]);

  const data = board.data ?? null;
  const actionData = activeBoard.data ?? null;
  const context = JSON.stringify([auth.data?.login, projectId, data?.view?.number ?? null]);
  const viewPreferences = usePreferences((s) => s.views[context]);
  const layout = viewPreferences?.layout ?? "board";
  const setLayout = (layout: ProjectLayout) => usePreferences.getState().setLayout(context, layout);
  const card =
    actionData?.columns
      .flatMap((c) => c.cards)
      .find((c) => c.item_id === (activeTab?.itemId ?? detailId ?? selectedId)) ?? null;
  const visibleBoard = useMemo(() => (data ? filterBoard(data, filters) : null), [data, filters]);
  const visibleIds = useMemo(
    () =>
      visibleBoard?.columns
        .filter(
          (column) =>
            layout === "board" ||
            !viewPreferences?.collapsedGroups.includes(column.option_id ?? "none"),
        )
        .flatMap((column) => column.cards.map((card) => card.item_id)) ?? [],
    [visibleBoard, layout, viewPreferences?.collapsedGroups],
  );
  const visibleCount =
    visibleBoard?.columns.reduce((count, column) => count + column.cards.length, 0) ?? 0;
  const detailOrder = useRef<string[]>([]);
  const detailIds = detailId && visibleIds.includes(detailId) ? visibleIds : detailOrder.current;
  const detailIndex = detailId ? detailIds.indexOf(detailId) : -1;
  const previousDetail = detailIds
    .slice(0, Math.max(0, detailIndex))
    .reverse()
    .find((id) => visibleIds.includes(id));
  const nextDetail =
    detailIndex < 0
      ? undefined
      : detailIds.slice(detailIndex + 1).find((id) => visibleIds.includes(id));

  useEffect(() => {
    openProject.mutate(actionProjectId);
  }, [actionProjectId, openProject.mutate]);

  useLayoutEffect(() => {
    const item = data?.columns
      .flatMap((column) => column.cards)
      .find((card) => card.item_id === detailId);
    const existing =
      item && item.kind !== "redacted" && issueTabs.find((tab) => tab.id === item.id);

    if (existing) {
      useUi.getState().activateIssueTab(existing.id);
    }
  }, [detailId, data, issueTabs]);

  useLayoutEffect(() => {
    if (detailId && visibleIds.includes(detailId)) {
      detailOrder.current = visibleIds;
    }
  }, [detailId, visibleIds]);

  const previousIds = useRef<string[]>([]);
  const viewRef = useRef<HTMLElement>(null);
  const sourceScroll = useRef<{ element: HTMLElement; top: number; left: number }[]>([]);

  useLayoutEffect(() => {
    sourceScroll.current = [];

    return useUi.subscribe((state, previous) => {
      if ((state.projectId && state.projectId !== projectId) || state.viewId !== viewId) {
        sourceScroll.current = [];
        return;
      }

      if (
        !previous.detailId &&
        !previous.activeIssueTab &&
        (state.detailId || state.activeIssueTab)
      ) {
        sourceScroll.current = [
          ...(viewRef.current?.querySelectorAll<HTMLElement>(
            '[data-slot="column-scroll"], [data-slot="board"], [data-slot="issue-list"]',
          ) ?? []),
        ].map((element) => ({ element, top: element.scrollTop, left: element.scrollLeft }));
      }
    });
  }, [projectId, viewId]);

  useLayoutEffect(() => {
    if (!data || dragging) {
      return;
    }

    const previous = previousIds.current;

    previousIds.current = visibleIds;

    if (revealId || !selectedId || visibleIds.includes(selectedId)) {
      return;
    }

    const next = selectionAfterRemoval(previous, visibleIds, selectedId);

    if (next) {
      if (overlay || detailId || activeIssueTab) {
        select(next);
      } else {
        useUi.getState().revealCard(next);
        focusCard(next);
      }
    } else {
      select(null);

      if (!overlay && !detailId && !activeIssueTab) {
        viewRef.current?.focus();
      }
    }
  }, [data, visibleIds, selectedId, revealId, dragging, overlay, detailId, activeIssueTab, select]);

  const returning = useRef(false);

  useLayoutEffect(() => {
    if (detailId || activeIssueTab) {
      returning.current = true;

      return;
    }

    if (!returning.current) {
      return;
    }

    returning.current = false;
    const positions = sourceScroll.current;
    sourceScroll.current = [];

    requestAnimationFrame(() => {
      const state = useUi.getState();

      if (
        !state.detailId &&
        !state.activeIssueTab &&
        !state.overlay &&
        (state.projectId === null || state.projectId === projectId) &&
        state.viewId === viewId
      ) {
        for (const { element, top, left } of positions) {
          element.scrollTo({ top, left });
        }
      }
    });

    if (useUi.getState().overlay || document.activeElement?.closest('[role="tablist"]')) {
      return;
    }

    const id = useUi.getState().selectedId;

    if (id) {
      useUi.getState().revealCard(id);
      focusCard(id);
    } else {
      viewRef.current?.focus();
    }
  }, [detailId, activeIssueTab, projectId, viewId]);

  const viewer: User | null = auth.data?.id
    ? { id: auth.data.id, login: auth.data.login ?? "", avatar_url: auth.data.avatar_url ?? "" }
    : null;

  const syncNow = useCallback(() => {
    if (refresh.isPending) {
      return;
    }

    refresh.mutate(actionProjectId, {
      onSuccess: () => void activeBoard.refetch(),
    });
  }, [refresh, actionProjectId, activeBoard.refetch]);

  const goTo = (id: ProjectId) => {
    selectProject(id);
    openProject.mutate(id);
  };
  const newDraft = (column: OptionId | null) => {
    if (!project.data?.can_update) {
      notify("This project is read-only");
      return;
    }
    if (activeIssueTab) {
      useUi.getState().activateIssueTab(null);
    }
    useUi.getState().closeDetail();
    show({ type: "draft", column });
  };

  const newIssue = () => {
    if (!data) {
      return;
    }

    const column = card
      ? data.columns[columnIndexOf(data, card)]
      : data.columns.find(
          (column) => !filters.statuses.length || filters.statuses.includes(column.option_id),
        );

    newDraft(column?.option_id ?? null);
  };

  const step = (direction: Direction) => {
    if (activeIssueTab) {
      return;
    }
    if (detailId) {
      const id = direction === "next" ? nextDetail : previousDetail;

      if (id) {
        useUi.getState().openDetail(id);
      }

      return;
    }

    if (!visibleBoard) {
      return;
    }

    if (layout === "board") {
      return select(navigate(visibleBoard, selectedId, direction));
    }

    const rows = [...document.querySelectorAll<HTMLElement>('[data-slot="issue-list-row"]')];
    const at = rows.findIndex((row) => row.dataset.itemId === selectedId);

    if (direction === "left" || direction === "right") {
      const group = rows[at]?.closest('[data-slot="issue-list-group"]');
      const header = group?.querySelector<HTMLButtonElement>('[data-slot="issue-list-toggle"]');

      if (header && (header.getAttribute("aria-expanded") === "true") === (direction === "left")) {
        header.click();
        header.focus();
        select(null);
      }

      return;
    }

    const next =
      at < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, at + (direction === "next" ? 1 : -1)));

    rows[next]?.focus();
  };

  const moveBy = (offset: number) => {
    if (!actionData || !card) {
      return;
    }

    const target = actionData.columns[columnIndexOf(actionData, card) + offset];

    if (target) {
      void actions.run(moveTo(actionData, card, target.option_id));
    }
  };

  const toggle = (user: User | null) => {
    if (!actionData || !card) {
      return;
    }

    if (!user) {
      return notify("Planche does not know your GitHub user yet. Sync, then try again.", "error");
    }

    const intent = toggleAssignee(actionData, card, user);

    if (intent) {
      void actions.run(intent);
    }
  };

  const openTab = () => {
    if (card && card.kind !== "redacted") {
      useUi.getState().openIssueTab({
        id: card.id,
        projectId: actionProjectId,
        viewId: actionViewId,
        itemId: card.item_id,
      });
    }
  };
  const cycleTab = (offset: number) => {
    const ids = [...boardTabs.map((tab) => tab.id), ...issueTabs.map((tab) => tab.id)];
    const index = ids.indexOf(activeIssueTab ?? sourceTabId);
    const id = ids[(index + offset + ids.length) % ids.length];

    selectTab(id);
  };
  const selectTab = (id: string) =>
    boardTabs.some((tab) => tab.id === id)
      ? useUi.getState().activateBoardTab(id)
      : useUi.getState().activateIssueTab(id);
  const closeTab = (id: string) =>
    boardTabs.some((tab) => tab.id === id)
      ? useUi.getState().closeBoardTab(id)
      : useUi.getState().closeIssueTab(id);

  useShortcuts({
    "sidebar.hide": () =>
      usePreferences.getState().setProjectHidden(auth.data?.login ?? "", projectId, true),
    "tab.open": openTab,
    "tab.close": () =>
      activeIssueTab
        ? useUi.getState().closeIssueTab(activeIssueTab)
        : detailId || linkedIssue
          ? useUi.getState().closeDetail()
          : activeBoardTab && useUi.getState().closeBoardTab(activeBoardTab),
    "tab.next": () => cycleTab(1),
    "tab.prev": () => cycleTab(-1),
    "filters.open": () => data && show({ type: "filters" }),
    "palette.open": showPalette,
    "settings.open": () => show({ type: "settings" }),
    "issue.new": newIssue,
    "sync.now": syncNow,
    "help.open": () => show({ type: "help" }),
    "card.next": () => step("next"),
    "card.prev": () => step("prev"),
    "column.next": () => step("right"),
    "column.prev": () => step("left"),
    "card.open": () => card && useUi.getState().openDetail(card.item_id),
    "detail.close": () =>
      activeIssueTab ? useUi.getState().activateIssueTab(null) : useUi.getState().closeDetail(),
    "card.github": () =>
      linkedIssue
        ? void openUrl(linkedIssue.url)
        : card &&
          card.kind !== "redacted" &&
          actionData &&
          void openUrl(urlOf(card, actionData.project.url)),
    "selection.clear": () => {
      select(null);

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    "card.moveNext": () => moveBy(1),
    "card.movePrev": () => moveBy(-1),
    "card.status": () => card && card.kind !== "redacted" && show({ type: "status" }),
    "card.assignMe": () => toggle(viewer),
    "card.copyLink": () => {
      if (!card || !actionData) {
        return;
      }

      navigator.clipboard.writeText(urlOf(card, actionData.project.url)).then(
        () => notify("Link copied", "success"),
        (error) => notify(`Couldn't copy the link: ${errorMessage(error)}`, "error"),
      );
    },
    undo: () => void actions.undo(),
  });

  const commands = paletteCommands(actionData, card, projects.data?.owners ?? [], {
    move: (to) => actionData && card && void actions.run(moveTo(actionData, card, to)),
    assign: () => show({ type: "assign" }),
    archive: () => actionData && card && void actions.run(archive(actionData, card)),
    newIssue,
    syncNow,
    openProject: goTo,
    signOut: () => void signOut(queryClient),
    showBoard: () => {
      useUi.getState().activateIssueTab(null);
      useUi.getState().closeDetail();
      setLayout("board");
    },
    showList: () => {
      useUi.getState().activateIssueTab(null);
      useUi.getState().closeDetail();
      setLayout("list");
    },
  });

  const { run } = actions;
  const onCreateDraft = useCallback(
    (
      column: Column,
      title: string,
      observe?: (result: DispatchResult) => void,
    ): Promise<DispatchResult> =>
      data
        ? run(createDraft(data, column.option_id, title), observe)
        : Promise.resolve({
            type: "rejected",
            error: { kind: "Invalid", message: "Project unavailable" },
          }),
    [data, run],
  );

  const cards = data?.columns.reduce((sum, c) => sum + c.cards.length, 0);
  const syncing = status.data?.state.type === "syncing";
  const offline = status.data?.state.type === "offline";
  // A later automatic sync also clears a failed manual refresh.
  const refreshError =
    refresh.variables === projectId && (status.data?.last_sync_at ?? 0) <= refresh.submittedAt
      ? refresh.error
      : null;
  const failure = board.error ?? status.error ?? refreshError;
  const error = failure ? errorMessage(failure) : null;
  const feedback = footerText(status.data, data?.synced_at ?? null, Date.now(), error);
  const retrying = board.isFetching || status.isFetching || refresh.isPending;
  const message = useSettledError(
    feedback.tone === "offline" ? feedback.text : null,
    retrying || syncing,
    JSON.stringify([projectId, viewId]),
  );
  const failed = message !== null;

  const retry = () => {
    if (retrying) {
      return;
    }

    if (board.error) {
      void board.refetch();
    } else {
      syncNow();
    }

    if (status.error) {
      void status.refetch();
    }
  };

  const chooseProject = () => {
    queryClient.setQueryData(currentProjectQuery.queryKey, null);
    selectProject(null);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg-sunken">
      <AppSidebar
        projectId={projectId}
        cardCount={cards}
        syncedAt={data?.synced_at ?? null}
        error={error}
        onSelect={goTo}
        onSearch={showPalette}
      />
      <main className="relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden">
        <IssueTabs
          tabs={[
            ...boardTabs.map((tab) => {
              const meta = tabProjects[boardProjects.indexOf(tab.projectId)]?.data;
              const summary = projectList.find((project) => project.id === tab.projectId);
              const title =
                summary?.title ??
                meta?.title ??
                (tab.projectId === projectId ? data?.project.title : null) ??
                "Project";
              const view =
                tab.projectId === projectId && tab.id === activeBoardTab
                  ? data?.view
                  : tab.viewId
                    ? meta?.views.find((view) => view.id === tab.viewId)
                    : meta?.views
                        .filter((view) => view.layout === "Board")
                        .sort((left, right) => left.number - right.number)[0];

              return {
                id: tab.id,
                title: view ? `${title} / ${view.name}` : title,
                project: title,
                kind: "board" as const,
                tone:
                  projectColors?.[tab.projectId] ??
                  defaultProjectTones[
                    (summary?.number ?? meta?.number ?? 0) % defaultProjectTones.length
                  ],
                closable: boardTabs.length > 1,
              };
            }),
            ...issueTabs.map((tab, index) => {
              const source = tabBoards[index].data;
              const column = source?.columns.find((column) =>
                column.cards.some((card) => card.item_id === tab.itemId),
              );
              const item = column?.cards.find((card) => card.item_id === tab.itemId);

              return {
                id: tab.id,
                title:
                  item && "number" in item
                    ? `#${item.number} ${item.title}`
                    : item && "title" in item
                      ? item.title
                      : "Unavailable item",
                project: source?.project.title ?? "Project unavailable",
                status:
                  item?.kind === "draft" || !column
                    ? ("draft" as const)
                    : statusTone(column.color, column.name),
              };
            }),
          ]}
          active={activeIssueTab ?? sourceTabId}
          onSelect={selectTab}
          onClose={closeTab}
          onAdd={() => firstProject && useUi.getState().openBoardTab(firstProject.id)}
          addDisabled={!firstProject || dragging}
        >
          <IssueTabPanel value={sourceTabId}>
            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col",
                (detailId || linkedIssue) &&
                  (detailExpanded && !linkedIssue ? "invisible" : "@min-[960px]:visible invisible"),
              )}
            >
              <Toolbar
                board={data}
                project={project.data}
                onSelectView={selectView}
                layout={layout}
                onLayoutChange={setLayout}
                onSearch={showPalette}
                filters={filters}
                onFiltersChange={setFilters}
                viewer={viewer}
                filterOpen={overlay?.type === "filters"}
                onFilterOpenChange={(open) => show(open ? { type: "filters" } : null)}
                onFilterClose={(event) => {
                  event.preventDefault();

                  requestAnimationFrame(() => {
                    const { selectedId: id, overlay, dragging } = useUi.getState();

                    if (overlay || dragging) {
                      return;
                    }

                    if (id) {
                      useUi.getState().revealCard(id);
                      focusCard(id);
                    } else {
                      viewRef.current?.focus();
                    }
                  });
                }}
                dragging={dragging}
                visibleCount={visibleCount}
                hiddenProperties={viewPreferences?.hiddenProperties}
                onPropertyChange={(property, visible) =>
                  usePreferences.getState().setPropertyVisible(context, property, visible)
                }
              />
              {data ? (
                <SyncErrorToast
                  key={projectId}
                  message={message}
                  retryAt={status.data?.retry_at ?? null}
                  onRetry={retry}
                  pending={retrying || syncing}
                />
              ) : null}
              <section
                ref={viewRef}
                tabIndex={-1}
                aria-label="Project view"
                className="min-h-0 flex-1 outline-none"
              >
                {data == null && failed ? (
                  <div className="grid h-full place-items-center overflow-y-auto p-6">
                    <BoardErrorCard
                      message={message ?? feedback.text}
                      pending={retrying || syncing}
                      onRetry={retry}
                      onBack={chooseProject}
                    />
                  </div>
                ) : data == null ? (
                  <LoadingBoard />
                ) : filtering && visibleCount === 0 && !drafting ? (
                  <NoFilterResults onReset={() => setFilters(emptyFilters)} />
                ) : cards === 0 && !drafting && layout === "board" ? (
                  <EmptyBoard
                    board={data}
                    onNewIssue={project.data?.can_update ? newIssue : undefined}
                    onNewDraft={project.data?.can_update ? newDraft : undefined}
                  />
                ) : layout === "list" ? (
                  <div
                    data-slot="issue-list"
                    className="h-full overflow-y-auto"
                  >
                    {visibleBoard?.columns.map((column) => (
                      <IssueListGroup
                        key={column.option_id ?? "none"}
                        name={column.name}
                        status={statusTone(column.color, column.name)}
                        items={column.cards.map((card) => ({
                          ...cardData(card),
                          status:
                            card.kind === "draft" ? "draft" : statusTone(column.color, column.name),
                          id: card.item_id,
                        }))}
                        onOpen={useUi.getState().openDetail}
                        onSelect={(id) => !detailId && select(id)}
                        revealId={revealId}
                        onRevealed={useUi.getState().finishReveal}
                        hiddenProperties={viewPreferences?.hiddenProperties}
                        expanded={
                          !viewPreferences?.collapsedGroups.includes(column.option_id ?? "none")
                        }
                        onExpandedChange={(expanded) =>
                          usePreferences
                            .getState()
                            .setGroupExpanded(context, column.option_id ?? "none", expanded)
                        }
                        onAddDraft={() => newDraft(column.option_id)}
                        draft={
                          overlay?.type === "draft" && overlay.column === column.option_id ? (
                            <NewDraft
                              key={overlay.editor}
                              projectId={projectId}
                              column={column.option_id}
                              onSubmit={(title, observe) => onCreateDraft(column, title, observe)}
                            />
                          ) : undefined
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <Board
                    readOnly={!project.data?.can_update}
                    board={visibleBoard ?? data}
                    canonicalBoard={data}
                    hiddenProperties={viewPreferences?.hiddenProperties}
                    onMove={run}
                    onCreateDraft={onCreateDraft}
                  />
                )}
              </section>
            </div>
            {detailId && data ? (
              <ProjectIssueDetail
                key={detailId}
                board={data}
                viewId={viewId}
                account={auth.data?.id ?? null}
                offline={offline}
                active={!linkedIssue}
                itemId={detailId}
                expanded={detailExpanded}
                onExpandedChange={useUi.getState().setDetailExpanded}
                onOpenTab={card && card.kind !== "redacted" ? openTab : undefined}
                onBack={useUi.getState().closeDetail}
                onPrevious={
                  previousDetail ? () => useUi.getState().openDetail(previousDetail) : undefined
                }
                onNext={nextDetail ? () => useUi.getState().openDetail(nextDetail) : undefined}
                onStatus={() => show({ type: "status" })}
                onAssign={() => show({ type: "assign" })}
              />
            ) : null}
            {linkedIssue && !activeIssueTab && auth.data?.id ? (
              <LinkedIssuePanel
                account={auth.data.id}
                offline={offline}
              />
            ) : null}
          </IssueTabPanel>
          {boardTabs
            .filter((tab) => tab.id !== sourceTabId)
            .map((tab) => (
              <IssueTabPanel
                key={tab.id}
                value={tab.id}
              />
            ))}
          {issueTabs.map((tab, index) => (
            <IssueTabPanel
              key={tab.id}
              value={tab.id}
            >
              <ProjectIssueDetail
                board={tabBoards[index].data ?? null}
                viewId={tab.viewId}
                account={auth.data?.id ?? null}
                offline={offline}
                itemId={tab.itemId}
                expanded
                active={activeIssueTab === tab.id && !linkedIssue}
                contextNotice={
                  tab.projectId !== projectId
                    ? `Actions apply to ${tabBoards[index].data?.project.title ?? "the original Project"}. Current source: ${data?.project.title ?? "another Project"}.`
                    : undefined
                }
                onBack={() => useUi.getState().activateIssueTab(null)}
                onStatus={() => show({ type: "status" })}
                onAssign={() => show({ type: "assign" })}
              />
              {linkedIssue && activeIssueTab === tab.id && auth.data?.id ? (
                <LinkedIssuePanel
                  account={auth.data.id}
                  offline={offline}
                />
              ) : null}
            </IssueTabPanel>
          ))}
        </IssueTabs>
      </main>
      <CommandPalette
        board={actionData}
        card={card}
        commands={commands}
        onReveal={(id) => {
          if (
            !activeTab &&
            filtering &&
            !visibleBoard?.columns.some((column) =>
              column.cards.some((card) => card.item_id === id),
            )
          ) {
            setFilters(emptyFilters);
            notify("Filters cleared to show the search result");
          }

          if (activeTab && actionData) {
            const item = actionData.columns
              .flatMap((column) => column.cards)
              .find((card) => card.item_id === id);

            if (item && item.kind !== "redacted") {
              useUi.getState().openIssueTab({ ...activeTab, id: item.id, itemId: id });
            }
          } else if (detailId) {
            useUi.getState().openDetail(id);
          } else {
            useUi.getState().revealCard(id);
          }
        }}
      />
      <ShortcutSheet />
      {actionData && card ? (
        <>
          <StatusMenu
            board={actionData}
            card={card}
            onMove={(to) => void actions.run(moveTo(actionData, card, to))}
          />
          <AssigneePicker
            board={actionData}
            card={card}
            viewer={viewer}
            onToggle={toggle}
          />
        </>
      ) : null}
    </div>
  );
}
