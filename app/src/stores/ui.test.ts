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
  ui.openDetail("next");

  expect(useUi.getState()).toMatchObject({ detailId: "next", selectedId: "first" });

  ui.closeDetail();

  expect(useUi.getState()).toMatchObject({ detailId: null, selectedId: "first" });

  for (const reset of [
    () => ui.selectProject("other"),
    () => ui.selectView("other"),
    ui.invalidateUndo,
  ]) {
    ui.openDetail("first");
    reset();

    expect(useUi.getState().detailId).toBeNull();
  }
});
