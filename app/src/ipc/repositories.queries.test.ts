// @vitest-environment happy-dom
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import { selectedRepository } from "./_fixtures/repository.fixtures";
import { authStatus } from "./_fixtures/user.fixtures";
import { authQuery, createQueryClient } from "./queries";
import { repositoriesQuery, repositoryQuery } from "./repositories.queries";

afterEach(() => clearMocks());

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
