// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { draft } from "@/ipc/_fixtures/card.fixtures";
import { useUi } from "@/stores/ui";
import { Card, focusCard } from "./Card";

test.each(["backlog", "todo", "doing", "review", "done"] as const)(
  "a draft keeps its dotted glyph in a %s column",
  (status) => {
    const container = document.createElement("div");

    container.innerHTML = renderToStaticMarkup(
      <Card
        status={status}
        card={draft({ item_id: "item", id: "draft" })}
      />,
    );

    const glyph = container.querySelector("[data-slot='status-square'] svg");

    expect(glyph?.getAttribute("aria-label")).toBe("Draft");
    expect(glyph?.querySelector("circle")?.getAttribute("stroke-dasharray")).toBe("2.26 2.26");
  },
);

test("focus restoration consumes mounted reveals and preserves unmounted requests", () => {
  const element = document.createElement("div");

  element.dataset.itemId = "focused";
  element.tabIndex = 0;
  document.body.append(element);
  element.focus();
  useUi.getState().revealCard("focused");

  focusCard("focused");

  expect(document.activeElement).toBe(element);
  expect(useUi.getState().revealId).toBeNull();

  useUi.getState().revealCard("unmounted");
  focusCard("unmounted");

  expect(useUi.getState().revealId).toBe("unmounted");

  element.remove();
  useUi.getState().finishReveal("unmounted");
  useUi.getState().select(null);
});
