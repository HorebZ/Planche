import { infiniteQueryOptions, type QueryClient, queryOptions } from "@tanstack/react-query";
import {
  commands,
  type RepositoryIssueFilter,
  type RepositoryIssuesLoad,
  type RepositorySource,
  type SelectedRepository,
} from "./bindings.types";

export const repositoriesQuery = (account: string) =>
  queryOptions({
    queryKey: ["repositories", account],
    networkMode: "always",
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const result = await commands.cachedRepositories(account);
      signal.throwIfAborted();

      return result;
    },
  });

export const repositoryQuery = (account: string, id: string) =>
  queryOptions({
    queryKey: ["repository", account, id],
    networkMode: "always",
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    queryFn: async ({ client, signal }) => {
      const result = await commands.refreshRepository(account, id);
      signal.throwIfAborted();
      if (result?.unavailable) {
        await forgetRepositoryContent(client, account, id);
        signal.throwIfAborted();
      }
      client.setQueryData<SelectedRepository[]>(repositoriesQuery(account).queryKey, (selected) =>
        result
          ? selected?.map((saved) => (saved.repository.id === id ? result : saved))
          : selected?.filter((saved) => saved.repository.id !== id),
      );

      return result;
    },
  });

export const repositoryCatalogQuery = (account: string, source: RepositorySource, search: string) =>
  infiniteQueryOptions({
    queryKey: ["repository-catalog", account, source, search],
    initialPageParam: null as string | null,
    networkMode: "always",
    refetchOnMount: "always",
    queryFn: async ({ pageParam, signal }) => {
      const result = await commands.repositoryCatalog(account, source, search, pageParam);
      signal.throwIfAborted();

      return result;
    },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });

export const repositoryIssuesKey = (account: string, id: string, filter: RepositoryIssueFilter) =>
  [
    "repository-issues",
    account,
    id,
    { ...filter, labels: [...new Set(filter.labels)].sort() },
  ] as const;

export async function forgetRepositoryContent(
  client: QueryClient,
  account: string,
  id: string,
  source?: readonly unknown[],
) {
  for (const family of ["repository-issues", "repository-options"]) {
    await client.cancelQueries(
      {
        queryKey: [family, account, id],
        predicate: (query) => JSON.stringify(query.queryKey) !== JSON.stringify(source),
      },
      { revert: false, silent: true },
    );
    for (const query of client.getQueryCache().findAll({ queryKey: [family, account, id] })) {
      client.setQueryData(
        query.queryKey,
        family === "repository-issues" && query.queryKey.at(-1) === "fresh"
          ? { kind: "unavailable" }
          : null,
      );
    }
  }
  for (const family of ["board", "issue", "issue-description", "issue-activity"]) {
    void client.invalidateQueries({ queryKey: [family] });
  }
}

export const cachedRepositoryIssuesQuery = (
  account: string,
  id: string,
  filter: RepositoryIssueFilter,
) =>
  queryOptions({
    queryKey: [...repositoryIssuesKey(account, id, filter), "cached"],
    gcTime: Number.POSITIVE_INFINITY,
    networkMode: "always",
    refetchOnMount: "always",
    queryFn: async ({ client, signal }) => {
      const freshKey = repositoryIssuesQuery(account, id, filter).queryKey;
      const version = client.getQueryData(freshKey);
      const result = await commands.cachedRepositoryIssues(account, id, filter);
      signal.throwIfAborted();
      if (client.getQueryData(freshKey) === version) {
        client.setQueryData<RepositoryIssuesLoad>(freshKey, (fresh) =>
          !fresh || fresh.kind === "unavailable"
            ? fresh
            : result
              ? { ...fresh, data: result }
              : fresh.kind === "offline"
                ? { kind: "offline", data: null }
                : { kind: "unavailable" },
        );
      }
      return result;
    },
  });

export const repositoryIssuesQuery = (account: string, id: string, filter: RepositoryIssueFilter) =>
  queryOptions({
    queryKey: [...repositoryIssuesKey(account, id, filter), "fresh"],
    gcTime: Number.POSITIVE_INFINITY,
    networkMode: "always",
    queryFn: async ({ client, signal }) => {
      const result = await commands.refreshRepositoryIssues(account, id, filter, null);
      signal.throwIfAborted();
      if (result.kind === "unavailable") {
        await forgetRepositoryContent(
          client,
          account,
          id,
          repositoryIssuesQuery(account, id, filter).queryKey,
        );
        signal.throwIfAborted();
      }
      client.setQueryData(
        cachedRepositoryIssuesQuery(account, id, filter).queryKey,
        result.kind === "unavailable" ? null : result.data,
      );
      return result;
    },
  });

export const cachedRepositoryOptionsQuery = (account: string, id: string) =>
  queryOptions({
    queryKey: ["repository-options", account, id, "cached"],
    networkMode: "always",
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const result = await commands.cachedRepositoryIssueOptions(account, id);
      signal.throwIfAborted();
      return result;
    },
  });

export const repositoryOptionsQuery = (account: string, id: string) =>
  queryOptions({
    queryKey: ["repository-options", account, id, "fresh"],
    networkMode: "always",
    refetchOnMount: "always",
    queryFn: async ({ client, signal }) => {
      const result = await commands.refreshRepositoryIssueOptions(account, id);
      signal.throwIfAborted();
      if (result === null) {
        await forgetRepositoryContent(
          client,
          account,
          id,
          repositoryOptionsQuery(account, id).queryKey,
        );
        signal.throwIfAborted();
      }
      client.setQueryData(cachedRepositoryOptionsQuery(account, id).queryKey, result);
      return result;
    },
  });

export const repositoryShortcutsQuery = (account: string, id: string) =>
  queryOptions({
    queryKey: ["repository-shortcuts", account, id],
    networkMode: "always",
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const result = await commands.repositoryIssueShortcuts(account, id);
      signal.throwIfAborted();
      return result;
    },
  });
