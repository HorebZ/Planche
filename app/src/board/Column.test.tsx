// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Column } from "./Column";

test.each([
  ["Backlog", "GREEN", "2.26 2.26", null, null],
  ["Todo", "GRAY", null, null, null],
  ["In progress", "GRAY", null, null, "var(--pl-s-doing)"],
  ["In review", "GRAY", null, null, "var(--pl-s-review)"],
  ["Done", "GRAY", null, "var(--pl-s-done)", "var(--pl-bg)"],
])(
  "%s header uses its status glyph regardless of GitHub color",
  (name, color, dash, fill, pathColor) => {
    const container = document.createElement("div");

    container.innerHTML = renderToStaticMarkup(
      <Column
        column={{ option_id: "status", name, color, cards: [] }}
        projectId="project"
        index={0}
        activeId={null}
        landing={null}
        onCreateDraft={async () => {
          throw new Error("Unexpected draft submission");
        }}
      />,
    );

    const glyph = container.querySelector("header [data-slot='status-square'] svg");

    expect(glyph?.getAttribute("aria-label")).toBe(name);
    expect(glyph?.querySelector("circle")?.getAttribute("stroke-dasharray")).toBe(dash);
    expect(glyph?.querySelector("circle")?.getAttribute("fill")).toBe(fill);

    const path = glyph?.querySelector("path");

    expect(path?.getAttribute("stroke") ?? path?.getAttribute("fill") ?? null).toBe(pathColor);
  },
);
