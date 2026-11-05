// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { draft, issue } from "@/ipc/_fixtures/card.fixtures";
import { useUi } from "@/stores/ui";
import { Card, cardData, focusCard } from "./Card";

test("a card waiting for sync renders without a Pending badge", () => {
  const container = document.createElement("div");

  container.innerHTML = renderToStaticMarkup(<Card card={draft({ pending: true })} />);

  expect(container.textContent).toContain("Draft issue");
  expect(container.textContent).not.toContain("Pending");
});

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

test("GitHub metadata reaches the card without replacing the creator with an assignee", () => {
  const data = cardData(
    issue({
      assignees: [{ id: "assigned", login: "assigned", avatar_url: "assigned.png" }],
      details: {
        author: { login: "creator", avatar_url: "creator.png" },
        created_at: "2026-10-31T12:00:00Z",
        updated_at: "2026-11-05T12:00:00Z",
        comment_count: 0,
      },
    }),
  );

  expect(data.author).toEqual({ login: "creator", avatarUrl: "creator.png" });
  expect(data.assignees[0].login).toBe("assigned");
  expect(data.createdAt).toBe("2026-10-31T12:00:00Z");
  expect(data.updatedAt).toBe("2026-11-05T12:00:00Z");
  expect(data.commentCount).toBe(0);
});
