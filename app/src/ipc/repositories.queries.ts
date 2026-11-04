import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { commands, type RepositorySource, type SelectedRepository } from "./bindings.types";

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
