// @vitest-environment happy-dom
import { expect, test } from "vitest";
import App from "@/App";
import { authStatus } from "@/ipc/_fixtures/user.fixtures";
import { authQuery, currentProjectQuery, queryClient } from "@/ipc/queries";
import { useUi } from "@/stores/ui";
import { button, click, get, installMockBackend, key, render } from "@/test-support";

const detail = () => get('[data-slot="issue-detail"][data-active="true"]');
const tabStatus = () => get('[data-tab-id="I_226"] [data-slot="status-square"] svg');

async function open() {
  const backend = installMockBackend("board");
  const original = backend.getBoard();

  if (!original) {
    throw new Error("Missing source board");
  }

  const other = structuredClone(original);
  other.project = { ...other.project, id: "PVT_api", title: "API Gateway" };
  for (const column of other.columns) {
    for (const card of column.cards) {
      card.item_id = `api-${card.item_id}`;
    }
  }
  const shared = other.columns[1].cards.shift();
  if (shared) {
    other.columns[2].cards.push(shared);
  }
  backend.setBoard(other);

  render(<App />, queryClient);

  await expect.poll(() => document.querySelectorAll('[data-slot="board-column"]').length).toBe(5);
  click(button("List"));

  return backend;
}

test("reopening shared content from another Project keeps the original actions and Undo", async () => {
  const backend = await open();
  click(get('[data-slot="issue-list-row"][data-item-id="PVTI_226"]'));
  click(button("Open in tab", detail()));

  expect(useUi.getState().issueTabs).toHaveLength(1);
  click(button("API Gateway"));

  await expect.poll(() => button("Board").getAttribute("aria-pressed")).toBe("true");
  await expect.poll(() => button("List").disabled).toBe(false);
  click(button("List"));

  await expect.poll(() => document.querySelector('[data-item-id="api-PVTI_226"]')).not.toBeNull();
  useUi.getState().openDetail("api-PVTI_226");

  await expect.poll(() => useUi.getState().activeIssueTab).toBe("I_226");
  await expect
    .poll(() => queryClient.getQueryData(currentProjectQuery.queryKey))
    .toBe("PVT_planche");
  expect(useUi.getState().projectId).toBe("PVT_api");
  expect(useUi.getState().issueTabs).toHaveLength(1);
  expect(detail().textContent).toContain(
    "Actions apply to Planche — v1.2. Current source: API Gateway.",
  );
  expect(button("Change project status", detail()).textContent).toBe("Todo");
  expect(tabStatus().getAttribute("aria-label")).toBe("Todo");
  key("s", detail());

  await expect.poll(() => document.querySelector('[placeholder="Change status…"]')).not.toBeNull();
  key("3", get('[placeholder="Change status…"]'));

  await expect
    .poll(() => backend.getBoard()?.columns[2].cards.some((card) => card.item_id === "PVTI_226"))
    .toBe(true);
  await expect.poll(() => useUi.getState().undo?.intent.project_id).toBe("PVT_planche");
  await expect.poll(() => tabStatus().getAttribute("aria-label")).toBe("In progress");
  key("z", detail(), { metaKey: true });

  await expect
    .poll(() => backend.getBoard()?.columns[1].cards.some((card) => card.item_id === "PVTI_226"))
    .toBe(true);
  await expect.poll(() => tabStatus().getAttribute("aria-label")).toBe("Todo");
  expect(
    backend.getBoard("PVT_api")?.columns[2].cards.some((card) => card.item_id === "api-PVTI_226"),
  ).toBe(true);
  key("Escape", detail());

  await expect.poll(() => queryClient.getQueryData(currentProjectQuery.queryKey)).toBe("PVT_api");
});

test("account changes discard every tab and its mounted content", async () => {
  await open();
  click(get('[data-slot="issue-list-row"][data-item-id="PVTI_226"]'));
  key("Enter", detail(), { metaKey: true });

  expect(useUi.getState().activeIssueTab).toBe("I_226");
  queryClient.setQueryData(authQuery.queryKey, authStatus({ id: "different", login: "other" }));

  await expect.poll(() => useUi.getState().issueTabs).toEqual([]);
  expect(useUi.getState().activeIssueTab).toBeNull();
  await expect.poll(() => document.querySelectorAll('[role="tab"]').length).toBe(1);
  expect(document.querySelector('[data-slot="issue-detail"]')).toBeNull();
});

test("new board tabs open the first visible project and keep existing tabs", async () => {
  await open();
  click(get('[data-slot="issue-list-row"][data-item-id="PVTI_226"]'));
  click(button("Open in tab", detail()));
  const original = useUi.getState().activeBoardTab;

  click(button("New tab"));

  expect(useUi.getState().boardTabs).toHaveLength(2);
  expect(useUi.getState().projectId).toBe("PVT_personal");
  expect(useUi.getState().activeIssueTab).toBeNull();
  expect(useUi.getState().issueTabs).toHaveLength(1);
  key("Enter", get('[role="tab"][data-state="inactive"]'));

  expect(useUi.getState().activeBoardTab).toBe(original);
  expect(useUi.getState().projectId).toBe("PVT_planche");
  click(button("API Gateway"));
  click(button("New tab"));

  expect(useUi.getState().boardTabs).toHaveLength(3);
  expect(useUi.getState().projectId).toBe("PVT_personal");
});
