import { beforeEach, expect, test } from "vitest";
import { emptyFilters } from "@/components/ui/board-filter";
import { useUi } from "./ui";

beforeEach(() => useUi.setState({ filters: emptyFilters, dragging: false }));

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
