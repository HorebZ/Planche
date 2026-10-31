// @vitest-environment happy-dom
import { expect, test, vi } from "vitest";
import { useUi } from "@/stores/ui";
import { get, installMockBackend, key, render } from "@/test-support";
import { StatusMenu } from "./StatusMenu";

test.each(["2", "6"])(
  "digit %s selects its status rank and skips the current status",
  async (digit) => {
    const board = installMockBackend("six-statuses").getBoard();

    if (!board) {
      throw new Error("Missing fixture board");
    }

    const onMove = vi.fn();

    useUi.getState().open({ type: "status" });
    render(
      <StatusMenu
        board={board}
        card={board.columns[1].cards[0]}
        onMove={onMove}
      />,
    );

    await expect.poll(() => document.querySelectorAll('[role="option"]').length).toBe(6);
    expect(document.querySelectorAll('[aria-label="Current"]')).toHaveLength(1);

    key(digit, get('[role="combobox"]'));

    expect(useUi.getState().overlay).toBeNull();

    if (digit === "6") {
      expect(onMove).toHaveBeenCalledExactlyOnceWith("cancelled");
    } else {
      expect(onMove).not.toHaveBeenCalled();
    }
  },
);
