import { beforeEach, expect, test } from "vitest";
import { emptyFilters } from "@/components/ui/board-filter";
import { useUi } from "./ui";

beforeEach(() => useUi.setState(useUi.getInitialState()));

test("all filters freeze during drag and reset with the project or view", () => {
  const ui = useUi.getState();

  ui.setFilters({
    statuses: ["todo", null],
    assignees: ["me"],
    labels: ["bug"],
    repositories: ["owner/repo"],
  });
  ui.setDragging(true);
  ui.setFilters(emptyFilters);

  expect(useUi.getState().filters).toEqual({
    statuses: ["todo", null],
    assignees: ["me"],
    labels: ["bug"],
    repositories: ["owner/repo"],
  });

  ui.setDragging(false);
  ui.selectView("other");

  expect(useUi.getState().filters).toEqual(emptyFilters);

  ui.setFilters({ ...emptyFilters, labels: ["bug"] });
  ui.selectProject("other");

  expect(useUi.getState().filters).toEqual(emptyFilters);

  ui.setFilters({ ...emptyFilters, repositories: ["owner/repo"] });
  ui.invalidateUndo();

  expect(useUi.getState().filters).toEqual(emptyFilters);
});

test("detail navigation keeps the return selection, rejects a drag and resets with context", () => {
  const ui = useUi.getState();

  ui.setDragging(true);
  ui.openDetail("first");

  expect(useUi.getState().detailId).toBeNull();

  ui.setDragging(false);
  ui.openDetail("first");
  ui.setDetailExpanded(true);
  ui.openDetail("next");

  expect(useUi.getState()).toMatchObject({
    detailId: "next",
    detailExpanded: true,
    selectedId: "first",
  });

  ui.closeDetail();

  expect(useUi.getState()).toMatchObject({
    detailId: null,
    detailExpanded: false,
    selectedId: "first",
  });

  for (const reset of [
    () => ui.selectProject("other"),
    () => ui.selectView("other"),
    ui.invalidateUndo,
  ]) {
    ui.openDetail("first");
    ui.setDetailExpanded(true);
    reset();

    expect(useUi.getState().detailId).toBeNull();
    expect(useUi.getState().detailExpanded).toBe(false);
  }
});

test("issue tabs deduplicate content and retain their first Project context", () => {
  const ui = useUi.getState();
  const tab = { id: "I_1", projectId: "project-a", viewId: "view-a", itemId: "item-a" };

  ui.setFilters({ ...emptyFilters, labels: ["bug"] });
  ui.select("origin");
  ui.openIssueTab(tab);
  ui.activateIssueTab(null);
  ui.selectProject("project-b");
  ui.openIssueTab({ ...tab, projectId: "project-b", itemId: "item-b" });

  expect(useUi.getState()).toMatchObject({
    projectId: "project-b",
    issueTabs: [tab],
    activeIssueTab: "I_1",
  });

  ui.activateIssueTab(null);
  ui.setFilters({ ...emptyFilters, labels: ["bug"] });
  ui.select("origin");
  ui.openIssueTab({ id: "I_2", projectId: "project-b", viewId: null, itemId: "second" });
  ui.closeIssueTab("I_2");

  expect(useUi.getState().activeIssueTab).toBe("I_1");
  ui.closeIssueTab("I_1");

  expect(useUi.getState()).toMatchObject({
    issueTabs: [],
    activeIssueTab: null,
    selectedId: "origin",
    filters: { ...emptyFilters, labels: ["bug"] },
  });
});

test("closing an inactive tab leaves the active one and changing account clears all tabs", () => {
  const ui = useUi.getState();

  ui.openIssueTab({ id: "I_1", projectId: "project", viewId: null, itemId: "first" });
  ui.openIssueTab({ id: "I_2", projectId: "project", viewId: null, itemId: "second" });
  ui.closeIssueTab("I_1");

  expect(useUi.getState().activeIssueTab).toBe("I_2");
  ui.invalidateUndo();

  expect(useUi.getState()).toMatchObject({ issueTabs: [], activeIssueTab: null });
});

test("board tabs retain their project and view, allow duplicates and keep one board open", () => {
  const ui = useUi.getState();

  ui.openBoardTab("project-a");
  const first = useUi.getState().activeBoardTab as string;
  ui.selectView("view-a");
  ui.openBoardTab("project-a");
  const second = useUi.getState().activeBoardTab as string;
  ui.selectProject("project-b");
  ui.activateBoardTab(first);

  expect(useUi.getState()).toMatchObject({
    projectId: "project-a",
    viewId: "view-a",
    boardTabs: [
      { id: first, projectId: "project-a", viewId: "view-a" },
      { id: second, projectId: "project-b", viewId: null },
    ],
  });

  ui.setFilters({ ...emptyFilters, labels: ["bug"] });
  ui.select("origin");
  ui.openIssueTab({ id: "I_1", projectId: "project-a", viewId: "view-a", itemId: "first" });
  ui.activateBoardTab(first);

  expect(useUi.getState()).toMatchObject({
    activeIssueTab: null,
    selectedId: "origin",
    filters: { ...emptyFilters, labels: ["bug"] },
  });

  ui.closeBoardTab(first);

  expect(useUi.getState()).toMatchObject({
    activeBoardTab: second,
    projectId: "project-b",
    viewId: null,
  });
  ui.closeBoardTab(second);

  expect(useUi.getState().boardTabs).toHaveLength(1);
});

test("board tabs freeze during drag and are discarded on account changes", () => {
  const ui = useUi.getState();

  ui.openBoardTab("project-a");
  const first = useUi.getState().activeBoardTab as string;
  ui.openBoardTab("project-b");
  const second = useUi.getState().activeBoardTab;
  ui.setDragging(true);
  ui.openBoardTab("project-c");
  ui.activateBoardTab(first);
  ui.closeBoardTab(first);

  expect(useUi.getState().boardTabs).toHaveLength(2);
  expect(useUi.getState().activeBoardTab).toBe(second);

  ui.invalidateUndo();

  expect(useUi.getState().boardTabs).toEqual([]);
  expect(useUi.getState().activeBoardTab).toBeNull();
});
