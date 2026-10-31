import { useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback } from "react";
import { AssigneePicker } from "@/board/AssigneePicker";
import { Board } from "@/board/Board";
import { EmptyBoard, LoadingBoard, SyncBar } from "@/board/BoardStates";
import { cardData } from "@/board/Card";
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
import { Banner } from "@/components/ui/banner";
import { BoardErrorCard } from "@/components/ui/board-states";
import { Button } from "@/components/ui/button";
import { IssueListGroup } from "@/components/ui/issue-list";
import { defaultProjectTones } from "@/components/ui/sidebar";
import { notify } from "@/components/ui/toast";
import type { Card, Column, OptionId, ProjectId, User } from "@/ipc/bindings";
import {
  currentProjectQuery,
  errorMessage,
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
import { type ProjectLayout, usePreferences } from "@/stores/preferences";
import { useUi } from "@/stores/ui";
import { OfflineBanner } from "./OfflineBanner";
import { AppSidebar, signOut } from "./Sidebar";
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
  const revealId = useUi((s) => s.revealId);
  const overlay = useUi((s) => s.overlay);
  const drafting = overlay?.type === "draft";
  const { selectProject, selectView, select, open: show } = useUi.getState();
  const board = useBoard(projectId, viewId);
  const project = useProject(projectId);
  const projects = useProjects();
  const status = useSyncStatus();
  const auth = useAuth();
  const projectColor = usePreferences((s) => s.projectColors[auth.data?.login ?? ""]?.[projectId]);
  const openProject = useOpenProject();
  const refresh = useRefresh();
  const actions = useActions(projectId, viewId);

  const data = board.data ?? null;
  const context = JSON.stringify([auth.data?.login, projectId, data?.view?.number ?? null]);
  const viewPreferences = usePreferences((s) => s.views[context]);
  const layout = viewPreferences?.layout ?? "board";
  const setLayout = (layout: ProjectLayout) => usePreferences.getState().setLayout(context, layout);
  const card = data?.columns.flatMap((c) => c.cards).find((c) => c.item_id === selectedId) ?? null;
  const viewer: User | null = auth.data?.id
    ? { id: auth.data.id, login: auth.data.login ?? "", avatar_url: auth.data.avatar_url ?? "" }
    : null;

  const syncNow = useCallback(() => {
    if (refresh.isPending) {
      return;
    }

    refresh.mutate(projectId, {
      onError: (error) => notify(`Sync failed: ${errorMessage(error)}`, "error"),
      onSuccess: () => void board.refetch(),
    });
  }, [refresh, projectId, board.refetch]);

  const goTo = (id: ProjectId) => {
    selectProject(id);
    openProject.mutate(id);
  };
  const newDraft = (column: OptionId | null) => {
    show({ type: "draft", column });
  };

  const newIssue = () => {
    if (!data) {
      return;
    }

    const column = card ? data.columns[columnIndexOf(data, card)] : data.columns[0];

    newDraft(column?.option_id ?? null);
  };

  const step = (direction: Direction) => {
    if (!data) {
      return;
    }

    if (layout === "board") {
      return select(navigate(data, selectedId, direction));
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
    if (!data || !card) {
      return;
    }

    const target = data.columns[columnIndexOf(data, card) + offset];

    if (target) {
      void actions.run(moveTo(data, card, target.option_id));
    }
  };

  const toggle = (user: User | null) => {
    if (!data || !card) {
      return;
    }

    if (!user) {
      return notify("Planche does not know your GitHub user yet. Sync, then try again.", "error");
    }

    const intent = toggleAssignee(data, card, user);

    if (intent) {
      void actions.run(intent);
    }
  };

  useShortcuts({
    "palette.open": showPalette,
    "settings.open": () => show({ type: "settings" }),
    "issue.new": newIssue,
    "sync.now": syncNow,
    "help.open": () => show({ type: "help" }),
    "card.next": () => step("next"),
    "card.prev": () => step("prev"),
    "column.next": () => step("right"),
    "column.prev": () => step("left"),
    // The detail panel arrives with #11. Until then, Enter opens the card on github.com.
    "card.open": () => card && data && void openUrl(urlOf(card, data.project.url)),
    "card.github": () => card && data && void openUrl(urlOf(card, data.project.url)),
    "selection.clear": () => {
      select(null);

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    "card.moveNext": () => moveBy(1),
    "card.movePrev": () => moveBy(-1),
    "card.status": () => card && show({ type: "status" }),
    "card.assignMe": () => toggle(viewer),
    "card.copyLink": () => {
      if (!card || !data) {
        return;
      }

      navigator.clipboard.writeText(urlOf(card, data.project.url)).then(
        () => notify("Link copied", "success"),
        (error) => notify(`Couldn't copy the link: ${errorMessage(error)}`, "error"),
      );
    },
    undo: () => void actions.undo(),
  });

  const commands = paletteCommands(data, card, projects.data?.owners ?? [], {
    move: (to) => data && card && void actions.run(moveTo(data, card, to)),
    assign: () => show({ type: "assign" }),
    archive: () => data && card && void actions.run(archive(data, card)),
    newIssue,
    syncNow,
    openProject: goTo,
    signOut: () => void signOut(queryClient),
    showBoard: () => setLayout("board"),
    showList: () => setLayout("list"),
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

  const openIssue = (id: string) => {
    const target = data?.columns.flatMap((c) => c.cards).find((c) => c.item_id === id);

    if (target && data) {
      void openUrl(urlOf(target, data.project.url));
    }
  };

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
  const failed = feedback.tone === "offline";
  const retrying = board.isFetching || status.isFetching || refresh.isPending;

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
      <main className="relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-bg shadow-panel">
        <Toolbar
          tone={
            projectColor ??
            defaultProjectTones[(data?.project.number ?? 0) % defaultProjectTones.length]
          }
          board={data}
          project={project.data}
          status={status.data}
          error={error}
          onSelectView={selectView}
          layout={layout}
          onLayoutChange={setLayout}
          onSearch={showPalette}
          hiddenProperties={viewPreferences?.hiddenProperties}
          onPropertyChange={(property, visible) =>
            usePreferences.getState().setPropertyVisible(context, property, visible)
          }
        />
        {syncing ? <SyncBar /> : null}
        {data && offline && !error ? (
          <OfflineBanner
            retryAt={status.data?.retry_at ?? null}
            onRetry={syncNow}
            pending={refresh.isPending}
          />
        ) : null}
        {data && failed && (!offline || error) ? (
          <Banner
            className="mx-3.5 mt-2.5"
            title="Could not refresh this project"
            description={feedback.text}
            meta="Showing saved data"
            action={
              <Button
                size="sm"
                disabled={retrying}
                onClick={retry}
              >
                Retry now
              </Button>
            }
          />
        ) : null}
        <div className="min-h-0 flex-1">
          {data == null && failed ? (
            <div className="grid h-full place-items-center overflow-y-auto p-6">
              <BoardErrorCard
                message={feedback.text}
                pending={retrying}
                onRetry={retry}
                onBack={chooseProject}
              />
            </div>
          ) : data == null ? (
            <LoadingBoard />
          ) : cards === 0 && !drafting && layout === "board" ? (
            <EmptyBoard
              board={data}
              onNewIssue={newIssue}
              onNewDraft={newDraft}
            />
          ) : layout === "list" ? (
            <div
              data-slot="issue-list"
              className="h-full overflow-y-auto"
            >
              {data.columns.map((column) => (
                <IssueListGroup
                  key={column.option_id ?? "none"}
                  name={column.name}
                  status={statusTone(column.color, column.name)}
                  items={column.cards.map((card) => ({
                    ...cardData(card),
                    status: card.kind === "draft" ? "draft" : statusTone(column.color, column.name),
                    id: card.item_id,
                    pending: card.pending,
                  }))}
                  onOpen={openIssue}
                  onSelect={select}
                  revealId={revealId}
                  onRevealed={useUi.getState().finishReveal}
                  hiddenProperties={viewPreferences?.hiddenProperties}
                  expanded={!viewPreferences?.collapsedGroups.includes(column.option_id ?? "none")}
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
              board={data}
              hiddenProperties={viewPreferences?.hiddenProperties}
              onMove={run}
              onCreateDraft={onCreateDraft}
            />
          )}
        </div>
      </main>
      <CommandPalette
        board={data}
        card={card}
        commands={commands}
      />
      <ShortcutSheet />
      {data && card ? (
        <>
          <StatusMenu
            board={data}
            card={card}
            onMove={(to) => void actions.run(moveTo(data, card, to))}
          />
          <AssigneePicker
            board={data}
            card={card}
            viewer={viewer}
            onToggle={toggle}
          />
        </>
      ) : null}
    </div>
  );
}
