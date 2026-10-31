// @vitest-environment happy-dom
import { expect, test } from "vitest";
import App from "@/App";
import { queryClient } from "@/ipc/queries";
import { usePreferences } from "@/stores/preferences";
import { useUi } from "@/stores/ui";
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

async function open(scenario: Parameters<typeof installMockBackend>[0] = "board") {
  const backend = installMockBackend(scenario);

  render(<App />, queryClient);

  await expect
    .poll(() => document.querySelectorAll('[data-slot="board-column"]').length)
    .toBe(scenario === "six-statuses" ? 6 : 5);

  return backend;
}

function menuItem(role: string, name: string) {
  const element = [...document.querySelectorAll<HTMLElement>(`[role="${role}"]`)].find(
    (item) => item.textContent?.trim() === name,
  );

  if (!element) {
    throw new Error(`Missing ${role}: ${name}`);
  }

  return element;
}

test("layouts and collapsed groups remain independent between projects and GitHub views", async () => {
  await open();

  click(button("List"));

  expect(document.querySelectorAll('[data-slot="issue-list-row"]')).toHaveLength(17);
  click(get('[data-slot="issue-list-group"]:nth-child(2) [data-slot="issue-list-toggle"]'));

  expect(document.querySelectorAll('[data-slot="issue-list-row"]')).toHaveLength(14);

  click(button("API Gateway"));

  await expect.poll(() => button("Board").getAttribute("aria-pressed")).toBe("true");
  click(button("Planche — v1.2"));

  await expect
    .poll(() => document.querySelectorAll('[data-slot="issue-list-row"]').length)
    .toBe(14);
  key("Enter", button("GitHub view: Board"));

  await expect.poll(() => document.querySelector('[role="menuitemradio"]')).not.toBeNull();
  click(menuItem("menuitemradio", "Planning"));

  await expect.poll(() => button("GitHub view: Planning")).toBeDefined();
  await expect.poll(() => button("Board").getAttribute("aria-pressed")).toBe("true");
  click(button("List"));

  expect(document.querySelectorAll('[data-slot="issue-list-row"]')).toHaveLength(17);
  expect(
    Object.values(usePreferences.getState().views).map((view) => view.collapsedGroups),
  ).toContainEqual(["todo"]);
});

test("status filters share counts across layouts and clear empty results", async () => {
  await open("six-statuses");

  key("f");
  await expect.poll(() => document.querySelector('[role="menuitemcheckbox"]')).not.toBeNull();
  click(menuItem("menuitemcheckbox", "Todo"));
  key("Escape", get('[role="menu"]'));
  click(button("List"));

  expect(document.querySelectorAll('[data-slot="issue-list-row"]')).toHaveLength(3);
  expect(get("main header").textContent).toContain("3/17 issues");

  key("f");
  await expect.poll(() => document.querySelector('[role="menuitemcheckbox"]')).not.toBeNull();
  click(menuItem("menuitemcheckbox", "Cancelled"));
  click(menuItem("menuitemcheckbox", "Todo"));
  key("Escape", get('[role="menu"]'));

  expect(document.body.textContent).toContain("No issues match these filters");
  expect(get("main header").textContent).toContain("0/17 issues");

  click(button("Clear filters"));

  expect(document.querySelectorAll('[data-slot="issue-list-row"]')).toHaveLength(17);
});

test("search clears status filters and reveals a result in a collapsed List group", async () => {
  await open();
  click(button("List"));

  const done = get('[data-slot="issue-list-group"]:nth-child(5)');

  click(get('[data-slot="issue-list-toggle"]', done));
  key("f");
  await expect.poll(() => document.querySelector('[role="menuitemcheckbox"]')).not.toBeNull();
  click(menuItem("menuitemcheckbox", "Todo"));
  key("Escape", get('[role="menu"]'));
  key("k", document, { metaKey: true });

  await expect.poll(() => document.querySelector('[role="combobox"]')).not.toBeNull();
  fill(get('[role="combobox"]'), "Onboarding: token validation");

  await expect
    .poll(() => document.querySelector('[role="option"][data-value$="PVTI_220"]'))
    .not.toBeNull();
  click(get('[role="option"][data-value$="PVTI_220"]'));

  expect(useUi.getState().statusFilter).toEqual([]);
  expect(get('[data-slot="issue-list-toggle"]', done).getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(get('[data-item-id="PVTI_220"]'));
  await expect
    .poll(() => document.body.textContent)
    .toContain("Status filters cleared to show the search result");
});

test.each(["board", "empty"] as const)(
  "%s creates a draft in the requested column in both layouts",
  async (scenario) => {
    const backend = await open(scenario);

    for (const layout of ["Board", "List"]) {
      click(button(layout));
      click(button("Add draft to Todo"));

      const input = get<HTMLInputElement>('[aria-label="Draft title"]');

      expect(document.activeElement).toBe(input);
      fill(input, `Draft from ${layout}`);
      submit(input);

      await expect.poll(() => document.querySelector('[aria-label="Draft title"]')).toBeNull();
      expect(backend.getBoard()?.columns[1].cards[0]).toMatchObject({
        kind: "draft",
        title: `Draft from ${layout}`,
      });
    }

    expect(calls.dispatch_intent).toBe(2);
  },
);

test("adding a draft expands a collapsed List group", async () => {
  await open();
  click(button("List"));

  const group = get('[data-slot="issue-list-group"]:nth-child(2)');
  const toggle = get('[data-slot="issue-list-toggle"]', group);

  click(toggle);
  click(button("Add draft to Todo", group));

  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(get('[aria-label="Draft title"]', group));
});

test("Display hides properties in the list and persists the selected view preferences", async () => {
  await open("labels");
  click(button("List"));
  key("Enter", button("Display"));

  await expect.poll(() => document.querySelectorAll('[role="menuitemcheckbox"]').length).toBe(3);

  for (const property of ["Repository", "Labels", "Assignees"]) {
    click(menuItem("menuitemcheckbox", property));
  }

  key("Escape", get('[role="menu"]'));

  expect(
    document.querySelectorAll('main [data-slot="label-chip"], main [data-slot="avatar"]'),
  ).toHaveLength(0);
  expect(get('[data-item-id="PVTI_226"]').textContent).toContain("#226");
  expect(get('[data-item-id="PVTI_226"]').textContent).not.toContain("app#226");
  expect(Object.values(usePreferences.getState().views)[0].hiddenProperties).toEqual([
    "repository",
    "labels",
    "assignees",
  ]);
  expect(localStorage.getItem("planche-ui-preferences")).toContain(
    '"hiddenProperties":["repository","labels","assignees"]',
  );
});

test("settings send sync preferences through IPC and save the theme", async () => {
  await open();
  click(button("Settings ⌘,"));

  await expect.poll(() => document.querySelector('[role="dialog"]')).not.toBeNull();
  click(button("15 min"));
  await expect.poll(() => calls.set_sync_prefs).toBe(1);
  await expect.poll(() => button("15 min").getAttribute("aria-checked")).toBe("true");
  click(button("Sync when the Mac wakes up"));
  await expect.poll(() => calls.set_sync_prefs).toBe(2);
  click(button("Dark"));

  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(usePreferences.getState().theme).toBe("dark");
  expect(button("15 min").getAttribute("aria-checked")).toBe("true");
  expect(button("Sync when the Mac wakes up").getAttribute("aria-checked")).toBe("false");
});

test("project colors update only their project, and hidden projects can be restored", async () => {
  await open();
  click(button("Change color for API Gateway"));

  await expect.poll(() => document.querySelectorAll('[role="dialog"] button').length).toBe(12);
  click(button("Blue"));

  expect(usePreferences.getState().projectColors["camille-r"]).toEqual({ PVT_api: "blue" });
  expect(get('main header [data-slot="project-color"]').className).toContain("bg-project-gray");

  key("h", button("Design system"), { metaKey: true, shiftKey: true });

  expect(usePreferences.getState().hiddenProjects["camille-r"]).toEqual(["PVT_design"]);
  click(button("1 hidden"));
  click(button("Show Design system in sidebar"));

  expect(usePreferences.getState().hiddenProjects["camille-r"]).toEqual([]);
  expect(button("Design system")).toBeDefined();
});
