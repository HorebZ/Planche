// @vitest-environment happy-dom
import { expect, test } from "vitest";
import App from "@/App";
import { signedIn } from "@/ipc/_fixtures/scenarios.fixtures";
import { authStatus } from "@/ipc/_fixtures/user.fixtures";
import { commands } from "@/ipc/bindings.types";
import { authQuery, queryClient } from "@/ipc/queries";
import { useRepositoryViews } from "@/stores/repository-views";
import { button, click, fill, get, installMockBackend, key, render, submit } from "@/test-support";

const rows = () => document.querySelectorAll('ul[aria-label="Repository issues"] > li');

async function setup() {
  const backend = installMockBackend("board");
  await commands.selectRepository(signedIn.id ?? "", "HorebZ/Planche");
  await commands.selectRepository(signedIn.id ?? "", "external/public");
  render(<App />, queryClient);
  await expect
    .poll(() => document.querySelector('[aria-label="Open issues in HorebZ/Planche"]'))
    .not.toBeNull();
  click(get('[aria-label="Open issues in HorebZ/Planche"]'));
  await expect.poll(() => rows().length).toBe(50);
  return backend;
}

async function choose(name: string, option: string, role: string) {
  key("ArrowDown", button(name));
  await expect.poll(() => document.querySelector('[role="menu"]')).not.toBeNull();
  const item = [...document.querySelectorAll<HTMLElement>(`[role="${role}"]`)].find(
    (item) => item.textContent?.trim() === option,
  );
  if (!item) {
    throw new Error(`Missing option ${option}`);
  }
  click(item);
}

test("native repositories paginate complete source filters, union labels and save deletable shortcuts", async () => {
  await setup();
  expect(document.body.textContent).toContain("Partial cache");
  click(button("All"));
  await expect.poll(() => rows().length).toBe(50);
  click(button("Load more issues"));
  await expect.poll(() => rows().length).toBe(100);
  click(button("Load more issues"));
  await expect.poll(() => rows().length).toBe(123);
  expect(document.body.textContent).toContain("Complete result");

  await choose("Filter by milestone", "Backlog", "menuitemradio");
  await expect.poll(() => rows().length).toBe(50);
  await choose("Filter by labels", "bug", "menuitemcheckbox");
  await expect.poll(() => rows().length).toBe(0);
  const help = [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')].find(
    (item) => item.textContent?.trim() === "help",
  );
  if (!help) {
    throw new Error("Missing help label");
  }
  click(help);
  key("Escape", help);
  await expect.poll(() => rows().length).toBe(21);
  expect(document.body.textContent).toContain("Repository issue 3");
  expect(document.body.textContent).not.toContain("Repository issue 122");
  fill(get('input[aria-label="Saved filter name"]'), "Triage");
  submit(get('input[aria-label="Saved filter name"]'));
  await expect
    .poll(() => document.querySelector('button[aria-label="Delete filter Triage"]'))
    .not.toBeNull();
  click(button("Clear filters"));
  await expect.poll(() => rows().length).toBe(123);
  click(button("Triage"));
  await expect.poll(() => rows().length).toBe(21);
  expect(button("Filter by milestone").textContent).toContain("Backlog");
  click(button("Delete filter Triage"));
  await expect
    .poll(() => document.querySelector('button[aria-label="Delete filter Triage"]'))
    .toBeNull();
});

test("shared detail has GitHub state and account-scoped navigation restores filters and scroll", async () => {
  await setup();
  click(button("Closed"));
  await expect.poll(() => rows().length).toBe(41);
  const list = get('ul[aria-label="Repository issues"]').parentElement;
  if (!list) {
    throw new Error("Missing list scroll container");
  }
  list.scrollTop = 500;
  list.dispatchEvent(new Event("scroll", { bubbles: true }));
  click(button("Open issue #123: Repository issue 123"));
  await expect
    .poll(() => document.querySelector('[data-slot="issue-detail"] h1')?.textContent)
    .toBe("Repository issue 123");
  const detail = get('[data-slot="issue-detail"]');
  expect(detail.textContent).toContain("StateClosed");
  expect(detail.querySelector('[aria-label="Change project status"]')).toBeNull();
  expect([...detail.querySelectorAll("dt")].map((item) => item.textContent)).not.toContain(
    "Project",
  );
  await expect.poll(() => detail.textContent).toContain("Comment");

  click(get('[aria-label="Open issues in external/public"]'));
  await expect.poll(() => rows().length).toBe(50);
  expect(button("Open").getAttribute("aria-pressed")).toBe("true");
  click(get('[aria-label="Open issues in HorebZ/Planche"]'));
  await expect.poll(() => rows().length).toBe(41);
  expect(button("Closed").getAttribute("aria-pressed")).toBe("true");
  expect(get('ul[aria-label="Repository issues"]').parentElement?.scrollTop).toBe(500);
  expect(document.querySelector('[data-slot="issue-detail"]')).not.toBeNull();
  key("Escape", window);
  await expect.poll(() => document.querySelector('[data-slot="issue-detail"]')).toBeNull();

  queryClient.setQueryData(authQuery.queryKey, authStatus({ id: "B", login: "other" }));
  await expect.poll(() => useRepositoryViews.getState().active).toBeNull();
  await expect.poll(() => document.querySelector('[aria-label="Repository browser"]')).toBeNull();
  expect(queryClient.getQueriesData({ queryKey: ["repository-issues", signedIn.id] })).toEqual([]);
});

test("offline pagination keeps the partial snapshot and explicitly distinguishes an uncached filter", async () => {
  const backend = await setup();
  backend.setRepositoryOffline(true);
  click(button("Load more issues"));
  await expect.poll(() => document.body.textContent).toContain("Offline · Saved issues");
  expect(rows().length).toBe(50);
  expect(document.body.textContent).toContain("Partial cache");
  click(button("Closed"));
  await expect
    .poll(() => document.body.textContent)
    .toContain("Offline · No saved issues for these filters.");
  expect(rows().length).toBe(0);
  click(button("Open"));
  await expect.poll(() => rows().length).toBe(50);
  backend.setRepositoryOffline(false);
  click(button("Load more issues"));
  await expect.poll(() => rows().length).toBe(82);
  expect(document.body.textContent).toContain("Complete result");
});
