import { useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cardData } from "@/board/Card";
import { IssueActivity } from "@/board/IssueActivity";
import { IssueComments } from "@/board/IssueComments";
import { IssueDescription } from "@/board/IssueDescription";
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
import { Input } from "@/components/ui/input";
import { IssueDetail } from "@/components/ui/issue-detail";
import { RepositoryIssueFilters, RepositoryIssueList } from "@/components/ui/repository-issues";
import { notify } from "@/components/ui/toast";
import { commands, type ItemContent, type RepositoryIssueFilter } from "@/ipc/bindings.types";
import {
  authQuery,
  cachedIssueQuery,
  errorMessage,
  issueQuery,
  useOpenProject,
} from "@/ipc/queries";
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [name, setName] = useState("");
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
  const issues = (data?.issues ?? []).filter(
    (issue): issue is RepositoryIssue => issue.kind === "issue",
  );
  const detail = issues.find((issue) => issue.id === view.detail);
  const error =
    pageError ??
    (fresh.error ? errorMessage(fresh.error) : cached.error ? errorMessage(cached.error) : null);
  const open = (issue: string) => update({ detail: issue, selected: issue });
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
    if (saving || !name.trim()) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const result = await commands.saveRepositoryIssueShortcut(account, id, name, view.filter);
      if (
        client.getQueryData(authQuery.queryKey)?.id !== account ||
        !client
          .getQueryData(repositoriesQuery(account).queryKey)
          ?.some((saved) => saved.repository.id === id)
      ) {
        return;
      }
      client.setQueryData(repositoryShortcutsQuery(account, id).queryKey, result);
      setName("");
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
  const overlay = useUi((state) => state.overlay);
  useShortcuts(
    {
      "card.next": () => navigate(1),
      "card.prev": () => navigate(-1),
      "card.open": () => view.selected && open(view.selected),
      "detail.close": close,
      "selection.clear": () => update({ selected: null }),
      "card.github": () =>
        external(
          issues.find((issue) => issue.id === (view.detail ?? view.selected))?.url ??
            saved?.repository.url ??
            "https://github.com",
        ),
      "sync.now": refresh,
      "palette.open": () => useUi.getState().open({ type: "palette" }),
      "settings.open": () => useUi.getState().open({ type: "settings" }),
      "help.open": () => useUi.getState().open({ type: "help" }),
      "filters.open": () =>
        document.querySelector<HTMLButtonElement>('[aria-label="Filter by milestone"]')?.focus(),
    },
    Boolean(view.detail),
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
        onSearch={() => useUi.getState().open({ type: "palette" })}
        onSelect={(project) => {
          useRepositoryViews.getState().close();
          useUi.getState().selectProject(project);
          openProject.mutate(project);
        }}
      />
      <main className="@container relative my-2 mr-2 flex min-w-0 flex-1 overflow-hidden rounded-xl bg-bg shadow-panel">
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          aria-label="Repository browser"
        >
          <header
            data-tauri-drag-region
            className="flex shrink-0 flex-wrap items-center gap-3 border-line border-b px-5 py-3"
          >
            <h1 className="min-w-0 flex-1 truncate font-semibold text-sm">
              {saved?.repository.full_name ?? "Repository"}
            </h1>
            <Button
              size="sm"
              variant="ghost"
              disabled={fresh.isFetching || loadingMore}
              onClick={refresh}
            >
              Refresh issues
            </Button>
            {saved && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => external(saved.repository.url)}
              >
                Open on GitHub
              </Button>
            )}
          </header>
          <div className="flex shrink-0 flex-col gap-3 border-line border-b px-5 py-3">
            <RepositoryIssueFilters
              filter={view.filter}
              options={options.data === undefined ? (cachedOptions.data ?? null) : options.data}
              onChange={changeFilter}
            />
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <Input
                className="h-7 w-44"
                aria-label="Saved filter name"
                placeholder="Name this filter…"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                disabled={!name.trim() || saving}
              >
                Save filter
              </Button>
            </form>
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
              {data && ` · Saved ${data.fetched_at}`}
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
            className="min-h-0 flex-1 overflow-y-auto"
            onScroll={(event) => update({ scrollTop: event.currentTarget.scrollTop })}
          >
            {data && (
              <RepositoryIssueList
                issues={issues.map((issue) => ({ ...cardData(issue), id: issue.id }))}
                selected={view.detail ?? view.selected}
                onOpen={open}
                onSelect={(selected) => update({ selected })}
              />
            )}
            {data?.next_cursor && (
              <div className="p-4">
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
        {view.detail && !unavailable && (
          <RepositoryDetail
            key={view.detail}
            account={account}
            content={view.detail}
            summary={detail ?? null}
            repository={saved?.repository.full_name ?? "Repository"}
            offline={offline}
            expanded={view.expanded}
            onExpandedChange={(expanded) => update({ expanded })}
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
        )}
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
                  open(issue.id);
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

function RepositoryDetail({
  account,
  content,
  summary,
  repository,
  offline,
  ...props
}: {
  account: string;
  content: string;
  summary: RepositoryIssue | null;
  repository: string;
  offline: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onBack: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const cached = useQuery(cachedIssueQuery(account, content));
  const fresh = useQuery({ ...issueQuery(account, content), enabled: !offline });
  const record = fresh.data
    ? fresh.data.status === "unavailable"
      ? null
      : fresh.data.issue
    : cached.data;
  const unavailable = fresh.data?.status === "unavailable";
  const issue = unavailable ? null : record?.content.kind === "issue" ? record.content : summary;
  const openLink = (url: string) =>
    void openUrl(url).catch((error) => notify(errorMessage(error), "error"));

  return (
    <IssueDetail
      {...props}
      itemId={content}
      item={issue ? cardData(issue) : null}
      project={repository}
      status={null}
      githubState={issue?.state}
      editable={Boolean(issue)}
      notice={
        unavailable
          ? "This issue is unavailable with your current GitHub access."
          : !issue
            ? "This issue is not in the local cache. Refresh when connected."
            : fresh.error
              ? `Showing saved issue. ${errorMessage(fresh.error)}`
              : undefined
      }
      onGitHub={issue ? () => openLink(issue.url) : undefined}
    >
      {issue && (
        <>
          <IssueDescription
            account={account}
            content={content}
            sourceUrl={issue.url}
            offline={offline}
          />
          <IssueActivity
            account={account}
            content={content}
            sourceUrl={issue.url}
            offline={offline}
          />
          <IssueComments
            account={account}
            content={content}
            sourceUrl={issue.url}
            offline={offline}
            onOpenLink={openLink}
          />
        </>
      )}
    </IssueDetail>
  );
}
