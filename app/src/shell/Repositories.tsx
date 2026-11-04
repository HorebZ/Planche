import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Fragment, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RepositoryPickerContent } from "@/components/ui/repository-picker";
import { SidebarGroup, SidebarGroupAction } from "@/components/ui/sidebar";
import { SidebarRepository } from "@/components/ui/sidebar-repository";
import { notify } from "@/components/ui/toast";
import { commands, type RepositorySource, type SelectedRepository } from "@/ipc/bindings.types";
import { authQuery, errorMessage, useAuth } from "@/ipc/queries";
import {
  repositoriesQuery,
  repositoryCatalogQuery,
  repositoryQuery,
} from "@/ipc/repositories.queries";
import { growWindow } from "@/lib/growWindow";
import { useRepositoryViews } from "@/stores/repository-views";
import { RepositoryShortcuts } from "./RepositoryShortcuts";

export function RepositorySection() {
  const account = useAuth().data?.id;

  return account ? (
    <AccountRepositories
      key={account}
      account={account}
    />
  ) : null;
}

function AccountRepositories({ account }: { account: string }) {
  const active = useRepositoryViews((state) => state.active);
  const client = useQueryClient();
  const selected = useQuery(repositoriesQuery(account));
  const refreshes = useQueries({
    queries: (selected.data ?? []).map((saved) => ({
      ...repositoryQuery(account, saved.repository.id),
      initialData: saved,
    })),
  });
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const add = useRef<HTMLButtonElement>(null);
  const remove = async (id: string) => {
    if (removing) {
      return;
    }

    setRemoving(id);
    try {
      await client.cancelQueries(
        { queryKey: repositoryQuery(account, id).queryKey },
        { revert: false, silent: true },
      );
      const result = await commands.removeRepository(account, id);
      if (client.getQueryData(authQuery.queryKey)?.id !== account) {
        return;
      }

      if (useRepositoryViews.getState().active?.repository === id) {
        useRepositoryViews.getState().close();
      }
      for (const family of ["repository-issues", "repository-options", "repository-shortcuts"]) {
        await client.cancelQueries(
          { queryKey: [family, account, id] },
          { revert: false, silent: true },
        );
        client.removeQueries({ queryKey: [family, account, id] });
      }
      client.setQueryData(repositoriesQuery(account).queryKey, result);
      client.removeQueries({ queryKey: repositoryQuery(account, id).queryKey });
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) {
          add.current?.focus();
        }
      });
    } catch (error) {
      if (client.getQueryData(authQuery.queryKey)?.id === account) {
        notify(`Could not remove repository: ${errorMessage(error)}`, "error");
      }
    } finally {
      setRemoving(null);
    }
  };

  return (
    <>
      <section aria-label="Repositories">
        <SidebarGroup
          title="Repositories"
          action={
            <SidebarGroupAction
              ref={add}
              aria-label="Add repositories"
              onClick={() => setOpen(true)}
            />
          }
        >
          {(selected.data ?? []).map((saved, index) => (
            <Fragment key={saved.repository.id}>
              <SidebarRepository
                active={active?.account === account && active.repository === saved.repository.id}
                selected={saved}
                removing={removing === saved.repository.id}
                warning={
                  refreshes[index]?.error ? "Saved repository · Could not refresh" : undefined
                }
                onOpen={() => {
                  useRepositoryViews.getState().open(account, saved.repository.id);
                  if (window.innerWidth < 1100) {
                    void growWindow().catch((error) => notify(errorMessage(error), "error"));
                  }
                }}
                onOpenGitHub={() =>
                  void openUrl(saved.repository.url).catch((error) =>
                    notify(`Could not open repository: ${errorMessage(error)}`, "error"),
                  )
                }
                onRemove={() => void remove(saved.repository.id)}
              />
              <RepositoryShortcuts
                account={account}
                id={saved.repository.id}
              />
            </Fragment>
          ))}
          {selected.isPending ? (
            <p
              role="status"
              className="px-2.5 text-fg-3 text-xs"
            >
              Loading repositories…
            </p>
          ) : selected.data?.length === 0 ? (
            <p className="px-2.5 text-fg-3 text-xs">No repositories selected.</p>
          ) : null}
          {selected.error ? (
            <div className="px-2.5">
              <p
                role="alert"
                className="text-danger text-xs"
              >
                {errorMessage(selected.error)}
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void selected.refetch()}
              >
                Retry repositories
              </Button>
            </div>
          ) : null}
        </SidebarGroup>
      </section>
      <Dialog
        open={open}
        onOpenChange={setOpen}
      >
        <DialogContent className="max-h-[calc(100vh-32px)] max-w-[600px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add repositories</DialogTitle>
            <DialogDescription>
              Choose repositories for your sidebar, or add any accessible repository by name or URL.
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <RepositoryPicker
              account={account}
              selected={selected.data ?? []}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RepositoryPicker({
  account,
  selected,
}: {
  account: string;
  selected: SelectedRepository[];
}) {
  const client = useQueryClient();
  const [source, setSource] = useState<RepositorySource>("personal");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [reference, setReference] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const catalog = useInfiniteQuery(repositoryCatalogQuery(account, source, query));
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);

    return () => clearTimeout(timer);
  }, [search]);
  const repositories = [
    ...new Map(
      (catalog.data?.pages.flatMap((page) => page.repositories) ?? []).map((repository) => [
        repository.id,
        repository,
      ]),
    ).values(),
  ];
  const add = async (reference: string) => {
    if (adding) {
      return;
    }

    setAdding(reference);
    setError(null);
    setMessage(null);
    try {
      const result = await commands.selectRepository(account, reference);
      if (client.getQueryData(authQuery.queryKey)?.id !== account) {
        return;
      }

      client.setQueryData(repositoriesQuery(account).queryKey, result);
      setReference("");
      setMessage("Repository saved in your sidebar.");
    } catch (error) {
      if (client.getQueryData(authQuery.queryKey)?.id === account) {
        setError(errorMessage(error));
      }
    } finally {
      setAdding(null);
    }
  };

  return (
    <>
      <RepositoryPickerContent
        source={source}
        onSourceChange={setSource}
        search={search}
        onSearchChange={setSearch}
        reference={reference}
        onReferenceChange={setReference}
        repositories={repositories}
        selectedIds={selected.map((saved) => saved.repository.id)}
        loading={catalog.isPending}
        loadingMore={catalog.isFetchingNextPage}
        error={error ?? (catalog.error ? errorMessage(catalog.error) : undefined)}
        hasMore={catalog.hasNextPage}
        adding={adding}
        onMore={() => void catalog.fetchNextPage()}
        onAdd={(reference) => void add(reference)}
        onRetry={() => {
          setError(null);
          void catalog.refetch();
        }}
      />
      {message ? (
        <p
          role="status"
          className="text-fg-3 text-sm"
        >
          {message}
        </p>
      ) : null}
    </>
  );
}
