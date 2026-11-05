// @vitest-environment happy-dom
import { expect, test } from "vitest";
import App from "@/App";
import { signedIn } from "@/ipc/_fixtures/scenarios.fixtures";
import { authStatus } from "@/ipc/_fixtures/user.fixtures";
import { commands } from "@/ipc/bindings.types";
import { authQuery, queryClient } from "@/ipc/queries";
import { useRepositoryViews } from "@/stores/repository-views";
import { button, click, fill, get, installMockBackend, key, render } from "@/test-support";

const rows = () =>
  document.querySelectorAll(
    'ul[aria-label="Repository issues"] > li, [aria-label="Repository kanban"] li',
  );

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
  click(button("Board"));
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
  click(button("Save filter"));
  await expect.poll(() => button("Filtre 1").textContent).toContain("Filtre 1");
  await choose("Options for filter Filtre 1", "Rename", "menuitem");
  await expect
    .poll(() => document.querySelector('input[aria-label="Rename filter Filtre 1"]'))
    .not.toBeNull();
  fill(get('input[aria-label="Rename filter Filtre 1"]'), "Triage");
  key("Enter", get('input[aria-label="Rename filter Filtre 1"]'));
  await expect.poll(() => button("Triage").textContent).toContain("Triage");
  click(button("Clear filters"));
  await expect.poll(() => rows().length).toBe(123);
  click(button("Triage"));
  await expect.poll(() => rows().length).toBe(21);
  expect(button("Filter by milestone").textContent).toContain("Backlog");
  await choose("Options for filter Triage", "Delete", "menuitem");
  await expect
    .poll(() => document.querySelector('[aria-label="Options for filter Triage"]'))
    .toBeNull();
});

test("shared detail has GitHub state and account-scoped navigation restores filters and scroll", async () => {
  await setup();
  click(button("Closed"));
  await expect.poll(() => rows().length).toBe(41);
  const list = get('[data-slot="repository-scroll"]');
  if (!list) {
    throw new Error("Missing list scroll container");
  }
  list.scrollTop = 500;
  list.dispatchEvent(new Event("scroll", { bubbles: true }));
  click(get('[data-item-id="I_repo_123"]'));
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
  expect(get('[data-slot="repository-scroll"]').scrollTop).toBe(500);
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

test("Open is the default list, Closed stays a list, and Board is a separate view", async () => {
  await setup();
  expect(button("Open").getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelector('ul[aria-label="Repository issues"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Repository kanban"]')).toBeNull();

  click(button("Closed"));
  await expect.poll(() => rows().length).toBe(41);
  expect(document.querySelector('ul[aria-label="Repository issues"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Repository kanban"]')).toBeNull();

  click(button("Board"));
  await expect.poll(() => rows().length).toBe(50);
  expect(document.querySelector('ul[aria-label="Repository issues"]')).toBeNull();
  const columns = [
    ...document.querySelectorAll('[aria-label="Repository kanban"] [data-slot="board-column"]'),
  ];
  expect(columns.map((column) => column.getAttribute("aria-label"))).toEqual([
    "Backlog",
    "Ready",
    "In progress",
    "Review",
    "Done",
  ]);
  for (const [name, number] of [
    ["Backlog", 115],
    ["Ready", 121],
    ["In progress", 122],
    ["Review", 119],
    ["Done", 123],
  ] as const) {
    expect(
      get(`[data-slot="board-column"][aria-label="${name}"]`).querySelector(
        `[data-item-id="I_repo_${number}"]`,
      ),
    ).not.toBeNull();
  }
  expect(
    get('[data-slot="board-column"][aria-label="Backlog"]').querySelector(
      '[data-item-id="I_repo_110"]',
    ),
  ).not.toBeNull();

  click(get('[data-item-id="I_repo_115"]'));
  await expect
    .poll(() => document.querySelector('[data-slot="issue-detail"] h1')?.textContent)
    .toBe("Repository issue 115");
  key("j", window);

  await expect
    .poll(() => document.querySelector('[data-slot="issue-detail"] h1')?.textContent)
    .toBe("Repository issue 110");
});
