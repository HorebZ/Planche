// @vitest-environment happy-dom
import { expect, test, vi } from "vitest";
import { useUi } from "@/stores/ui";
import { click, get, installMockBackend, render } from "@/test-support";
import { AssigneePicker } from "./AssigneePicker";

test("the picker loads repository users and returns the selected user", async () => {
  const board = installMockBackend("board").getBoard();

  if (!board) {
    throw new Error("Missing fixture board");
  }

  const onToggle = vi.fn();

  useUi.getState().open({ type: "assign" });
  render(
    <AssigneePicker
      board={board}
      card={board.columns[1].cards[0]}
      viewer={null}
      onToggle={onToggle}
    />,
  );

  await expect.poll(() => document.querySelectorAll('[role="option"]').length).toBe(4);
  click(get('[role="option"][data-value="theo-m"]'));

  expect(onToggle).toHaveBeenCalledExactlyOnceWith({ id: "U_TM", login: "theo-m", avatar_url: "" });
  expect(useUi.getState().overlay).toBeNull();
});
