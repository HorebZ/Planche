// @vitest-environment happy-dom
import { expect, test } from "vitest";
import App from "@/App";
import { authStatus } from "@/ipc/_fixtures/user.fixtures";
import { authQuery, queryClient } from "@/ipc/queries";
import { repositoriesQuery, repositoryQuery } from "@/ipc/repositories.queries";
import {
  button,
  calls,
  click,
  fill,
  get,
  installMockBackend,
  key,
  render,
  submit,
} from "@/test-support";
import { RepositorySection } from "./Repositories";

test("the picker paginates, distinguishes organizations and disabled issues, and adds an external URL without duplicates", async () => {
  installMockBackend("board");
  const { client } = render(<RepositorySection />);
  await expect.poll(() => document.body.textContent).toContain("No repositories selected.");
  click(button("Add repositories"));

  await expect.poll(() => document.body.textContent).toContain("HorebZ/Planche");
  expect(button("Add HorebZ/disabled").disabled).toBe(true);
  click(button("Load more repositories"));
  await expect.poll(() => document.body.textContent).toContain("HorebZ/second-page");
  click(button("Organizations"));
  await expect.poll(() => document.body.textContent).toContain("planche/core");
  click(button("Add planche/core"));
  await expect.poll(() => button("planche/core already added").disabled).toBe(true);

  const input = get<HTMLInputElement>(
    'input[placeholder="owner/repository or https://github.com/owner/repository"]',
  );
  fill(input, "https://github.com/external/public");
  submit(input);
  await expect
    .poll(() => document.querySelectorAll('[data-slot="sidebar-repository"]').length)
    .toBe(2);
  fill(input, "external/public");
  submit(input);
  await expect.poll(() => input.value).toBe("");
  expect(document.querySelectorAll('[data-slot="sidebar-repository"]').length).toBe(2);
  expect(calls.select_repository).toBe(3);
  expect(client.getQueryData(authQuery.queryKey)?.id).toBeTruthy();
});

test("refreshing follows a rename, keeps inaccessible favorites, and removal stops their dedicated reads", async () => {
  const backend = installMockBackend("board");
  const { client } = render(<RepositorySection />);
  await expect.poll(() => document.body.textContent).toContain("No repositories selected.");
  click(button("Add repositories"));
  await expect.poll(() => document.body.textContent).toContain("HorebZ/Planche");
  click(button("Add HorebZ/Planche"));
  await expect
    .poll(() => document.querySelectorAll('[data-slot="sidebar-repository"]').length)
    .toBe(1);
  click(button("Close"));
  const account = client.getQueryData(authQuery.queryKey)?.id ?? "";
  backend.renameRepository("R_planche", "new-owner/new-name");

  await client.invalidateQueries({ queryKey: repositoryQuery(account, "R_planche").queryKey });
  await expect.poll(() => document.body.textContent).toContain("new-owner/new-name");
  backend.removeRepositoryAccess("R_planche");
  await client.invalidateQueries({ queryKey: repositoryQuery(account, "R_planche").queryKey });
  await expect.poll(() => document.body.textContent).toContain("Unavailable with current access");
  key("ArrowDown", button("Options for new-owner/new-name"));
  await expect.poll(() => document.querySelector('[role="menu"]')).not.toBeNull();
  const remove = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
    item.textContent?.includes("Remove from sidebar"),
  );
  if (!remove) {
    throw new Error("missing remove action");
  }
  click(remove);
  await expect
    .poll(() => document.querySelectorAll('[data-slot="sidebar-repository"]').length)
    .toBe(0);
  const reads = calls.refresh_repository;

  await client.invalidateQueries({ queryKey: ["repository"] });

  expect(calls.refresh_repository).toBe(reads);
  expect(client.getQueryData(repositoriesQuery(account).queryKey)).toEqual([]);
});

test("repositories can be selected before opening a Project and account changes do not show another account's favorites", async () => {
  installMockBackend("projects-empty");
  render(<App />, queryClient);
  await expect.poll(() => document.body.textContent).toContain("Pick a project");
  click(button("Add repositories"));
  await expect.poll(() => document.body.textContent).toContain("HorebZ/Planche");
  click(button("Add HorebZ/Planche"));
  await expect
    .poll(() => document.querySelectorAll('[data-slot="sidebar-repository"]').length)
    .toBe(1);
  click(button("Close"));
  expect(calls.open_project ?? 0).toBe(0);

  queryClient.setQueryData(authQuery.queryKey, authStatus({ id: "B", login: "other" }));

  await expect
    .poll(() => document.querySelectorAll('[data-slot="sidebar-repository"]').length)
    .toBe(0);
  expect(document.body.textContent).not.toContain("HorebZ/Planche");
});
