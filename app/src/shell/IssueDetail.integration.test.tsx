// @vitest-environment happy-dom
import { expect, test } from "vitest";
import App from "@/App";
import { emptyFilters } from "@/components/ui/board-filter";
import { draft, redacted } from "@/ipc/_fixtures/card.fixtures";
import { mockupBoard, PROJECT } from "@/ipc/_fixtures/scenarios.fixtures";
import type { Board } from "@/ipc/bindings.types";
import { boardQuery, queryClient } from "@/ipc/queries";
import { useUi } from "@/stores/ui";
import { button, calls, click, fill, get, installMockBackend, key, render } from "@/test-support";

async function open() {
  installMockBackend("board");

  render(<App />, queryClient);

  await expect.poll(() => document.querySelectorAll('[data-slot="board-column"]').length).toBe(5);
  click(button("List"));
}

const row = (id: number) => get(`[data-slot="issue-list-row"][data-item-id="PVTI_${id}"]`);
const detail = () => get('[data-slot="issue-detail"]');

test("click and Enter open a detail, J/K follow the filtered collection and Escape restores the origin", async () => {
  await open();
  useUi.getState().setFilters({ ...emptyFilters, labels: ["bug"] });

  await expect.poll(() => document.querySelectorAll('[data-slot="issue-list-row"]').length).toBe(2);
  click(row(223));

  expect(detail().textContent).toContain("Column counter ignores filtered cards");
  expect(document.activeElement).toBe(get('[data-item-id="PVTI_223"]', detail()));
  key("j");

  expect(detail().textContent).toContain("Fix WebSocket memory leak");
  expect(button("Next issue", detail()).disabled).toBe(true);
  key("k");
  key("Escape");

  expect(document.querySelector('[data-slot="issue-detail"]')).toBeNull();
  expect(document.activeElement).toBe(row(223));
  key("Enter", row(223));

  expect(detail().textContent).toContain("Column counter ignores filtered cards");
  key("o", detail(), { metaKey: true });

  await expect.poll(() => calls["plugin:opener|open_url"]).toBe(1);
});

test("status and assignee menus act on the detail, then Escape returns to a visible neighbor", async () => {
  await open();
  useUi.getState().setFilters({ ...emptyFilters, statuses: ["todo"] });

  await expect.poll(() => document.querySelectorAll('[data-slot="issue-list-row"]').length).toBe(3);
  click(row(226));
  click(button("Change assignees", detail()));

  await expect.poll(() => document.querySelector('[placeholder="Assign…"]')).not.toBeNull();
  key("Escape", get('[placeholder="Assign…"]'));

  expect(detail()).toBeDefined();
  key("i", detail());

  await expect.poll(() => calls.dispatch_intent).toBe(1);
  await expect.poll(() => detail().textContent).not.toContain("camille-r");
  click(button("Change project status", detail()));

  await expect.poll(() => document.querySelector('[placeholder="Change status…"]')).not.toBeNull();
  key("3", get('[placeholder="Change status…"]'));

  await expect.poll(() => detail().textContent).toContain("In progress");
  expect(useUi.getState().detailId).toBe("PVTI_226");
  key("Escape", detail());

  expect(document.activeElement).toBe(row(223));
});

test("a removed item stays explicit and returns to the next row, or the view when none remains", async () => {
  await open();
  click(row(226));
  const source = mockupBoard();

  queryClient.setQueryData(
    boardQuery(PROJECT, null).queryKey,
    (): Board => ({
      ...source,
      columns: source.columns.map((column) => ({
        ...column,
        cards: column.cards.filter((card) => card.item_id !== "PVTI_226"),
      })),
    }),
  );

  await expect.poll(() => detail().textContent).toContain("Item no longer available");
  key("Escape", detail());

  expect(document.activeElement).toBe(row(223));
  click(row(223));
  queryClient.setQueryData(
    boardQuery(PROJECT, null).queryKey,
    (): Board => ({
      ...source,
      columns: source.columns.map((column) => ({ ...column, cards: [] })),
    }),
  );

  await expect.poll(() => detail().textContent).toContain("Item no longer available");
  key("Escape", detail());

  expect(document.activeElement).toBe(get('[aria-label="Project view"]'));
});

test("drafts and redacted items show explicit limits and account changes clear the detail", async () => {
  await open();
  const source = mockupBoard();
  queryClient.setQueryData(
    boardQuery(PROJECT, null).queryKey,
    (): Board => ({
      ...source,
      columns: [
        {
          ...source.columns[0],
          cards: [draft({ item_id: "draft" }), redacted({ item_id: "restricted" })],
        },
      ],
    }),
  );

  await expect.poll(() => document.querySelector('[data-item-id="draft"]')).not.toBeNull();
  click(get('[data-item-id="draft"]'));

  expect(detail().textContent).toContain("It has no GitHub issue page yet");
  expect(button("Open project on GitHub", detail())).toBeDefined();
  key("j", detail());

  expect(detail().textContent).toContain("Redacted item");
  expect(button("Change project status", detail()).disabled).toBe(true);
  expect(button("Change assignees", detail()).disabled).toBe(true);
  expect(button("Change assignees", detail()).textContent).toBe("Unavailable");
  expect(detail().textContent).not.toContain("Draft");
  useUi.getState().invalidateUndo();

  await expect.poll(() => document.querySelector('[data-slot="issue-detail"]')).toBeNull();
});

test("palette search updates the detail and New draft leaves it with the editor focused", async () => {
  await open();
  click(row(226));
  key("k", detail(), { metaKey: true });

  await expect.poll(() => document.querySelector('[role="combobox"]')).not.toBeNull();
  fill(get('[role="combobox"]'), "Onboarding: token validation");

  await expect
    .poll(() => document.querySelector('[role="option"][data-value$="PVTI_220"]'))
    .not.toBeNull();
  click(get('[role="option"][data-value$="PVTI_220"]'));

  expect(detail().textContent).toContain("Onboarding: token validation");
  key("k", detail(), { metaKey: true });

  await expect.poll(() => document.querySelector('[role="combobox"]')).not.toBeNull();
  fill(get('[role="combobox"]'), "New draft");
  click(get('[role="option"][data-value="New draft"]'));

  await expect.poll(() => document.querySelector('[aria-label="Draft title"]')).not.toBeNull();
  expect(document.querySelector('[data-slot="issue-detail"]')).toBeNull();
  expect(document.activeElement).toBe(get('[aria-label="Draft title"]'));
});
