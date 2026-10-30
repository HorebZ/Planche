// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Card } from "./Card";

test.each(["backlog", "todo", "doing", "review", "done"] as const)(
  "a draft keeps its dotted glyph in a %s column",
  (status) => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <Card
        status={status}
        card={{
          kind: "draft",
          item_id: "item",
          id: "draft",
          title: "Draft issue",
          assignees: [],
          position: 0,
          pending: false,
          updated_by_sync: false,
        }}
      />,
    );
    const glyph = container.querySelector("[data-slot='status-square'] svg");
    expect(glyph?.getAttribute("aria-label")).toBe("Draft");
    expect(glyph?.querySelector("circle")?.getAttribute("stroke-dasharray")).toBe("2.26 2.26");
  },
);
