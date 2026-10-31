import { beforeEach, expect, test } from "vitest";
import { useUi } from "./ui";

beforeEach(() => useUi.setState({ statusFilter: [], dragging: false }));

test("status filters freeze during drag and reset with the project or view", () => {
  const ui = useUi.getState();

  ui.setStatusFilter(["todo", null]);
  ui.setDragging(true);
  ui.setStatusFilter([]);

  expect(useUi.getState().statusFilter).toEqual(["todo", null]);

  ui.setDragging(false);
  ui.selectView("other");

  expect(useUi.getState().statusFilter).toEqual([]);

  ui.setStatusFilter(["done"]);
  ui.selectProject("other");

  expect(useUi.getState().statusFilter).toEqual([]);

  ui.setStatusFilter(["todo"]);
  ui.invalidateUndo();

  expect(useUi.getState().statusFilter).toEqual([]);
});
