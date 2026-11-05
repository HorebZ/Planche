import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpRight, RefreshCw, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cardData } from "@/board/Card";
import { ShortcutSheet } from "@/command/ShortcutSheet";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { IssueTabPanel, IssueTabs } from "@/components/ui/issue-tabs";
import {
  RepositoryIssueBoard,
  RepositoryIssueFilters,
  RepositoryIssueList,
} from "@/components/ui/repository-issues";
import { notify } from "@/components/ui/toast";
import { commands, type ItemContent, type RepositoryIssueFilter } from "@/ipc/bindings.types";
import { authQuery, cachedIssueQuery, errorMessage, useOpenProject } from "@/ipc/queries";
import {
  cachedRepositoryIssuesQuery,
  cachedRepositoryOptionsQuery,
  forgetRepositoryContent,
  repositoriesQuery,
  repositoryIssuesQuery,
  repositoryOptionsQuery,
  repositoryQuery,
  repositoryShortcutsQuery,
} from "@/ipc/repositories.queries";
import { useShortcuts } from "@/keyboard/useShortcuts";
import {
  emptyRepositoryView,
  repositoryViewKey,
  useRepositoryViews,
} from "@/stores/repository-views";
import { useUi } from "@/stores/ui";
import { IssuePanel, LinkedIssuePanel } from "./IssuePanel";
import { AppSidebar } from "./Sidebar";

type RepositoryIssue = Extract<ItemContent, { kind: "issue" }>;

export function RepositoryShell({ account, id }: { account: string; id: string }) {
  const client = useQueryClient();
  const key = repositoryViewKey(account, id);
  const view = useRepositoryViews((state) => state.entries[key] ?? emptyRepositoryView);
  const update = (changes: Partial<typeof view>) =>
    useRepositoryViews.getState().update(key, changes);
  const selected = useQuery(repositoriesQuery(account));
  const saved = selected.data?.find((saved) => saved.repository.id === id);
  const cached = useQuery(cachedRepositoryIssuesQuery(account, id, view.filter));
  const fresh = useQuery(repositoryIssuesQuery(account, id, view.filter));
  const cachedOptions = useQuery(cachedRepositoryOptionsQuery(account, id));
  const options = useQuery(repositoryOptionsQuery(account, id));
  const openProject = useOpenProject();
  const [filterOpen, setFilterOpen] = useState(false);
  const [newTab, setNewTab] = useState(false);
  const tabIssues = useQueries({ queries: view.tabs.map((id) => cachedIssueQuery(account, id)) });
  const activeContent = tabIssues[view.tabs.indexOf(view.activeTab ?? "")]?.data?.content;
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const restored = useRef("");
  const filterKey = JSON.stringify(view.filter);
  const unavailable = saved?.unavailable || fresh.data?.kind === "unavailable";
  const data = unavailable
    ? null
    : fresh.data
      ? fresh.data.kind === "unavailable"
        ? null
        : fresh.data.data
      : cached.data;
  const offline = fresh.data?.kind === "offline";
  const boardView = view.filter.state === "all";
  const byId = new Map(
    (data?.issues ?? [])
      .filter((issue): issue is RepositoryIssue => issue.kind === "issue")
      .map((issue) => [issue.id, issue]),
  );
  const issues = boardView
    ? (data?.columns ?? []).flatMap((column) => column.items.flatMap((id) => byId.get(id) ?? []))
    : [...byId.values()];
  const detail = issues.find((issue) => issue.id === view.detail);
  const error =
    pageError ??
    (fresh.error ? errorMessage(fresh.error) : cached.error ? errorMessage(cached.error) : null);
  const selectTab = (activeTab: string | null) => {
    useUi.getState().setLinkedIssue(null);
    update({ activeTab });
  };
  const openTab = (issue: string) => {
    useUi.getState().setLinkedIssue(null);
    update({
      tabs: view.tabs.includes(issue) ? view.tabs : [...view.tabs, issue],
      activeTab: issue,
      detail: null,
    });
  };
  const closeTab = (id: string) => {
    const tabs = view.tabs.filter((tab) => tab !== id);

    update({
      tabs,
      activeTab:
        view.activeTab === id
          ? (tabs[Math.max(0, view.tabs.indexOf(id) - 1)] ?? null)
          : view.activeTab,
    });
    useUi.getState().setLinkedIssue(null);
  };
  const cycleTab = (direction: number) => {
    const tabs = [null, ...view.tabs];
    const index = tabs.indexOf(view.activeTab);

    selectTab(tabs[(index + direction + tabs.length) % tabs.length]);
  };
  const search = (inTab = false) => {
    setNewTab(inTab);
    useUi.getState().open({ type: "palette" });
  };
  const open = (issue: string) => {
    selectTab(view.tabs.includes(issue) ? issue : null);
    update({ detail: view.tabs.includes(issue) ? null : issue, selected: issue });
  };
  const close = () => {
    update({ detail: null });
    requestAnimationFrame(() =>
      scroll.current
        ?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(view.detail ?? "")}"]`)
        ?.focus({ preventScroll: true }),
    );
  };
  const changeFilter = (filter: RepositoryIssueFilter) => {
    setPageError(null);
    update({ filter, scrollTop: 0, detail: null, selected: null });
  };
  const refresh = () => {
    setPageError(null);
    void fresh.refetch();
    void options.refetch();
    void client.invalidateQueries({ queryKey: repositoryQuery(account, id).queryKey });
  };
  const external = (url: string) =>
    void openUrl(url).catch((error) => notify(errorMessage(error), "error"));
  const more = async () => {
    if (!data?.next_cursor || loadingMore || fresh.isFetching) {
      return;
    }
    const filter = view.filter;
    setLoadingMore(true);
    setPageError(null);
    try {
      const result = await commands.refreshRepositoryIssues(account, id, filter, data.next_cursor);
      if (
        client.getQueryData(authQuery.queryKey)?.id !== account ||
        !client
          .getQueryData(repositoriesQuery(account).queryKey)
          ?.some((saved) => saved.repository.id === id)
      ) {
        return;
      }
      if (result.kind === "unavailable") {
        await forgetRepositoryContent(client, account, id);
      }
      client.setQueryData(repositoryIssuesQuery(account, id, filter).queryKey, result);
      client.setQueryData(
        cachedRepositoryIssuesQuery(account, id, filter).queryKey,
        result.kind === "unavailable" ? null : result.data,
      );
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  };
  const save = async () => {
    if (saving) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const result = await commands.saveRepositoryIssueShortcut(account, id, view.filter);
      if (
        client.getQueryData(authQuery.queryKey)?.id !== account ||
        !client
          .getQueryData(repositoriesQuery(account).queryKey)
          ?.some((saved) => saved.repository.id === id)
      ) {
        return;
      }
      client.setQueryData(repositoryShortcutsQuery(account, id).queryKey, result);
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  const navigate = (direction: number) => {
    if (!issues.length) {
      return;
    }
    const current = issues.findIndex((issue) => issue.id === (view.detail ?? view.selected));
    const next = issues[Math.min(issues.length - 1, Math.max(0, current + direction))];
    if (!next) {
      return;
    }
    update({ selected: next.id, ...(view.detail ? { detail: next.id } : {}) });
    if (!view.detail) {
      scroll.current
        ?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(next.id)}"]`)
        ?.focus();
    }
  };
  const linkedIssue = useUi((state) => state.linkedIssue);
  const overlay = useUi((state) => state.overlay);
  useShortcuts(
    {
      "card.next": () => !view.activeTab && navigate(1),
      "card.prev": () => !view.activeTab && navigate(-1),
      "card.open": () => view.selected && open(view.selected),
      "detail.close": () => (view.activeTab ? selectTab(null) : close()),
      "tab.open": () => view.detail && openTab(view.detail),
      "tab.close": () => (view.activeTab ? closeTab(view.activeTab) : view.detail && close()),
      "tab.next": () => cycleTab(1),
      "tab.prev": () => cycleTab(-1),
      "selection.clear": () => update({ selected: null }),
      "card.github": () =>
        external(
          linkedIssue?.url ??
            (activeContent?.kind === "issue" ? activeContent.url : undefined) ??
            issues.find((issue) => issue.id === (view.detail ?? view.selected))?.url ??
            saved?.repository.url ??
            "https://github.com",
        ),
      "sync.now": refresh,
      "palette.open": () => search(),
      "settings.open": () => useUi.getState().open({ type: "settings" }),
      "help.open": () => useUi.getState().open({ type: "help" }),
      "filters.open": () => {
        selectTab(null);
        setFilterOpen(true);
      },
    },
    Boolean(view.detail || view.activeTab),
  );

  useEffect(() => {
    if (selected.isSuccess && !saved) {
      useRepositoryViews.getState().close();
    }
  }, [selected.isSuccess, saved]);
  useLayoutEffect(() => {
    if (data && scroll.current && restored.current !== filterKey) {
      scroll.current.scrollTop = view.scrollTop;
      restored.current = filterKey;
    }
  }, [data, filterKey, view.scrollTop]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg-sunken">
      <AppSidebar
        projectId={null}
        syncedAt={data?.fetched_at ?? null}
        onSearch={() => search()}
        onSelect={(project) => {
          useRepositoryViews.getState().close();
          useUi.getState().selectProject(project);
          openProject.mutate(project);
        }}
      />
      <main className="my-2 mr-2 flex min-w-0 flex-1 flex-col">
        <IssueTabs
          tabs={[
            {
              id: "source",
              title: saved?.repository.full_name ?? "Repository",
              project: "Repository",
              kind: "board",
              closable: false,
            },
            ...view.tabs.map((id, index) => {
              const content = tabIssues[index].data?.content;
              const issue = unavailable ? null : content?.kind === "issue" ? content : byId.get(id);

              return {
                id,
                title: issue ? `#${issue.number} ${issue.title}` : "Issue unavailable",
                project: issue?.repo ?? saved?.repository.full_name ?? "Repository",
                status: issue?.state === "closed" ? ("done" as const) : ("todo" as const),
              };
            }),
          ]}
          active={view.activeTab ?? "source"}
          onSelect={(id) => selectTab(id === "source" ? null : id)}
          onClose={closeTab}
          onAdd={() => search(true)}
        >
          <IssueTabPanel value="source">
            <section
              className="flex min-h-0 min-w-0 flex-1 flex-col"
              aria-label="Repository browser"
            >
              <header
                data-slot="repository-toolbar"
                className="shrink-0"
              >
                <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 py-1.5 pr-3 pl-4">
                  <RepositoryIssueFilters
                    filter={view.filter}
                    options={
                      options.data === undefined ? (cachedOptions.data ?? null) : options.data
                    }
                    onChange={changeFilter}
                    onSave={() => void save()}
                    saving={saving}
                    open={filterOpen}
                    onOpenChange={setFilterOpen}
                    onCloseAutoFocus={(event) => {
                      event.preventDefault();
                      scroll.current
                        ?.querySelector<HTMLElement>("[data-item-id]")
                        ?.focus({ preventScroll: true });
                    }}
                  />
                  <span className="flex-1" />
                  {data && (
                    <span className="mr-2 text-[12px] text-fg-3 tabular-nums">
                      {data.issues.length} issues
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Search issues ⌘K"
                    onClick={() => search()}
                    className="size-[30px] rounded-full shadow-[inset_0_0_0_1px_var(--pl-border-strong)]"
                  >
                    <Search className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Refresh issues"
                    disabled={fresh.isFetching || loadingMore}
                    onClick={refresh}
                    className="size-7 text-fg-3"
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                  {saved && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Open repository on GitHub"
                      onClick={() => external(saved.repository.url)}
                      className="size-7 text-fg-3"
                    >
                      <ArrowUpRight className="size-4" />
                    </Button>
                  )}
                </div>
              </header>
              <div className="flex shrink-0 flex-col gap-2 px-4 pb-2">
                {saveError && (
                  <p
                    role="alert"
                    className="text-danger text-xs"
                  >
                    {saveError}
                  </p>
                )}
                <p
                  role="status"
                  className="text-fg-3 text-xs"
                >
                  {unavailable
                    ? "Repository unavailable with your current GitHub access."
                    : !data
                      ? offline
                        ? "Offline · No saved issues for these filters."
                        : fresh.isFetching || cached.isPending
                          ? "Loading issues…"
                          : "No saved issues for these filters."
                      : `${offline ? "Offline · Saved issues · " : fresh.isFetching ? "Refreshing · Saved issues · " : ""}${data.issues.length} issues loaded · ${data.complete ? "Complete result" : "Partial cache · More pages remain on GitHub"}`}
                </p>
                {(options.error || cachedOptions.error) && (
                  <p
                    role="alert"
                    className="text-danger text-xs"
                  >
                    Could not load filter options.{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => void options.refetch()}
                    >
                      Retry options
                    </button>
                  </p>
                )}
                {error && (
                  <p
                    role="alert"
                    className="text-danger text-xs"
                  >
                    {error}{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={refresh}
                    >
                      Retry issues
                    </button>
                  </p>
                )}
              </div>
              <div
                ref={scroll}
                className={
                  boardView
                    ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                    : "min-h-0 flex-1 overflow-y-auto"
                }
                data-slot="repository-scroll"
                onScroll={(event) => {
                  if (!boardView) {
                    update({ scrollTop: event.currentTarget.scrollTop });
                  }
                }}
              >
                {data &&
                  (boardView ? (
                    <div className="min-h-0 flex-1">
                      <RepositoryIssueBoard
                        issues={issues.map((issue) => ({ ...cardData(issue), id: issue.id }))}
                        columns={data.columns ?? []}
                        selected={view.detail ?? view.selected}
                        onOpen={open}
                        onSelect={(selected) => update({ selected })}
                      />
                    </div>
                  ) : (
                    <RepositoryIssueList
                      issues={issues.map((issue) => ({ ...cardData(issue), id: issue.id }))}
                      selected={view.detail ?? view.selected}
                      onOpen={open}
                      onSelect={(selected) => update({ selected })}
                    />
                  ))}
                {data?.next_cursor && (
                  <div className="shrink-0 p-4">
                    <Button
                      disabled={loadingMore || fresh.isFetching}
                      onClick={() => void more()}
                    >
                      {loadingMore ? "Loading issues…" : "Load more issues"}
                    </Button>
                  </div>
                )}
              </div>
            </section>
            {view.detail && !unavailable ? (
              <IssuePanel
                key={view.detail}
                account={account}
                content={view.detail}
                summary={detail ?? null}
                repository={saved?.repository.full_name ?? "Repository"}
                offline={offline}
                active={!view.activeTab && !linkedIssue}
                expanded={view.expanded}
                onExpandedChange={(expanded) => update({ expanded })}
                onOpenTab={() => view.detail && openTab(view.detail)}
                onBack={close}
                onPrevious={
                  issues.findIndex((issue) => issue.id === view.detail) > 0
                    ? () => navigate(-1)
                    : undefined
                }
                onNext={
                  issues.findIndex((issue) => issue.id === view.detail) < issues.length - 1
                    ? () => navigate(1)
                    : undefined
                }
              />
            ) : null}
            {linkedIssue && !view.activeTab ? (
              <LinkedIssuePanel
                account={account}
                offline={offline}
              />
            ) : null}
          </IssueTabPanel>
          {view.tabs.map((id) => (
            <IssueTabPanel
              key={id}
              value={id}
            >
              {unavailable ? (
                <p
                  role="status"
                  className="p-4 text-fg-3 text-sm"
                >
                  Repository unavailable with your current GitHub access.
                </p>
              ) : (
                <IssuePanel
                  account={account}
                  content={id}
                  summary={byId.get(id) ?? null}
                  repository={saved?.repository.full_name ?? "Repository"}
                  offline={offline}
                  expanded
                  active={view.activeTab === id && !linkedIssue}
                  onBack={() => selectTab(null)}
                />
              )}
              {linkedIssue && view.activeTab === id ? (
                <LinkedIssuePanel
                  account={account}
                  offline={offline}
                />
              ) : null}
            </IssueTabPanel>
          ))}
        </IssueTabs>
      </main>
      <CommandDialog
        open={overlay?.type === "palette"}
        onOpenChange={(open) => !open && useUi.getState().open(null)}
      >
        <CommandInput placeholder="Search loaded repository issues…" />
        <CommandList>
          <CommandEmpty>No loaded issue matches. Load more pages to search further.</CommandEmpty>
          <CommandGroup heading="Loaded issues">
            {issues.map((issue) => (
              <CommandItem
                key={issue.id}
                value={`${issue.number} ${issue.title}`}
                onSelect={() => {
                  useUi.getState().open(null);
                  newTab ? openTab(issue.id) : open(issue.id);
                }}
              >
                #{issue.number} {issue.title}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <ShortcutSheet />
    </div>
  );
}
