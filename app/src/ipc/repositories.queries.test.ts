// @vitest-environment happy-dom
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test, vi } from "vitest";
import { selectedRepository } from "./_fixtures/repository.fixtures";
import { repositoryIssues } from "./_fixtures/repository-issues.fixtures";
import { authStatus } from "./_fixtures/user.fixtures";
import {
  commands,
  type RepositoryIssueFilter,
  type RepositoryIssueOptions,
  type RepositoryIssues,
  type RepositoryIssuesLoad,
} from "./bindings.types";
import { authQuery, createQueryClient } from "./queries";
import {
  cachedRepositoryIssuesQuery,
  cachedRepositoryOptionsQuery,
  repositoriesQuery,
  repositoryIssuesQuery,
  repositoryQuery,
} from "./repositories.queries";

afterEach(() => {
  clearMocks();
  vi.restoreAllMocks();
});

const filter: RepositoryIssueFilter = { state: "open", milestone: null, labels: [] };

test("a late disk read cannot replace pages loaded while it was in flight", async () => {
  const client = createQueryClient();
  const fresh = repositoryIssuesQuery("A", "R", filter);
  const first = repositoryIssues({ complete: false, next_cursor: "next" });
  client.setQueryData(fresh.queryKey, (): RepositoryIssuesLoad => ({ kind: "ready", data: first }));
  let resolve: (data: RepositoryIssues) => void = () => {};
  vi.spyOn(commands, "cachedRepositoryIssues").mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );

  const read = client.fetchQuery(cachedRepositoryIssuesQuery("A", "R", filter));
  const complete = repositoryIssues();
  client.setQueryData(
    fresh.queryKey,
    (): RepositoryIssuesLoad => ({ kind: "ready", data: complete }),
  );
  resolve(first);
  await read;

  expect(client.getQueryData(fresh.queryKey)).toEqual({ kind: "ready", data: complete });
  client.clear();
});

test("an access refusal cancels other pages and clears every filter and its options", async () => {
  const client = createQueryClient();
  const other = repositoryIssuesQuery("A", "R", { ...filter, state: "closed" });
  const cached = cachedRepositoryIssuesQuery("A", "R", filter);
  client.setQueryData(cached.queryKey, repositoryIssues());
  client.setQueryData(
    cachedRepositoryOptionsQuery("A", "R").queryKey,
    (): RepositoryIssueOptions => ({ labels: [], milestones: [] }),
  );
  let complete: () => void = () => {};
  vi.spyOn(commands, "refreshRepositoryIssues").mockImplementation((_account, _id, filter) =>
    filter.state === "closed"
      ? new Promise((resolve) => {
          complete = () => resolve({ kind: "ready", data: repositoryIssues() });
        })
      : Promise.resolve({ kind: "unavailable" }),
  );

  const pending = client.fetchQuery(other).catch(() => null);
  const result = await client.fetchQuery(repositoryIssuesQuery("A", "R", filter));
  complete();
  await pending;

  expect(result.kind).toBe("unavailable");
  expect(client.getQueryData(cached.queryKey)).toBeNull();
  expect(client.getQueryData(other.queryKey)).toEqual({ kind: "unavailable" });
  expect(client.getQueryData(cachedRepositoryOptionsQuery("A", "R").queryKey)).toBeNull();
  client.clear();
});

test("an account change cancels a late repository refresh before it can repopulate private caches", async () => {
  const client = createQueryClient();
  client.setQueryData(authQuery.queryKey, authStatus({ id: "A" }));
  client.setQueryData(repositoriesQuery("A").queryKey, [selectedRepository()]);
  let finish: (value: unknown) => void = () => {};
  mockIPC(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const request = client.fetchQuery(repositoryQuery("A", "R_planche")).catch(() => null);

  client.setQueryData(authQuery.queryKey, authStatus({ id: "B" }));
  finish(selectedRepository());
  await request;

  expect(client.getQueriesData({ queryKey: ["repository"] })).toEqual([]);
  expect(client.getQueryData(repositoriesQuery("A").queryKey)).toBeUndefined();
  client.clear();
});
