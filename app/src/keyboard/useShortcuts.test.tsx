// @vitest-environment happy-dom
import { expect, test, vi } from "vitest";
import { useUi } from "@/stores/ui";
import { get, key, render } from "@/test-support";
import { type Handlers, useShortcuts } from "./useShortcuts";

function BoardKeys({ handlers }: { handlers: Handlers }) {
  useShortcuts(handlers);

  return (
    <>
      <input />
      <button type="button">Control</button>
    </>
  );
}

test("global and board shortcuts run once and prevent the browser default", () => {
  const move = vi.fn();
  const palette = vi.fn();

  render(<BoardKeys handlers={{ "card.next": move, "palette.open": palette }} />);
  expect(key("j")).toBe(false);
  expect(key("k", document, { metaKey: true })).toBe(false);

  expect(move).toHaveBeenCalledOnce();
  expect(palette).toHaveBeenCalledOnce();
});

test.each(["input", "button", "dialog", "menu", "popover", "overlay", "dragging", "prevented"])(
  "%s keeps board shortcuts inactive",
  (context) => {
    const move = vi.fn();

    render(<BoardKeys handlers={{ "card.next": move }} />);

    if (context === "dialog" || context === "menu") {
      const blocker = document.createElement("div");

      blocker.setAttribute("role", context);
      get("input").parentElement?.append(blocker);
    } else if (context === "popover") {
      get("button").dataset.slot = "popover-content";
    } else if (context === "overlay") {
      useUi.getState().open({ type: "settings" });
    } else if (context === "dragging") {
      useUi.getState().setDragging(true);
    }

    if (context === "prevented") {
      const event = new KeyboardEvent("keydown", { key: "j", bubbles: true, cancelable: true });

      event.preventDefault();
      document.dispatchEvent(event);
    } else {
      key("j", context === "input" || context === "button" ? get(context) : document);
    }

    expect(move).not.toHaveBeenCalled();
  },
);

test("detail scope allows its navigation and close while leaving board-only actions silent", () => {
  const next = vi.fn();
  const close = vi.fn();
  const create = vi.fn();
  const clear = vi.fn();

  render(
    <BoardKeys
      handlers={{
        "card.next": next,
        "detail.close": close,
        "issue.new": create,
        "selection.clear": clear,
      }}
    />,
  );
  useUi.getState().openDetail("issue");

  key("j");
  key("Escape");
  key("c");
  key(" ");
  key("Enter");

  expect(next).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(create).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
});
