// @vitest-environment happy-dom

import { flushSync } from "react-dom";
import { expect, test, vi } from "vitest";
import App from "@/App";
import { draft } from "@/ipc/_fixtures/card.fixtures";
import { commands } from "@/ipc/bindings.types";
import { queryClient } from "@/ipc/queries";
import { useUi } from "@/stores/ui";
import { button, calls, click, fill, get, installMockBackend, render } from "@/test-support";

async function openDraft(
  scenario: Parameters<typeof installMockBackend>[0] = "board",
  body: string | null = "Original **description**",
) {
  const backend = installMockBackend(scenario);
  const board = backend.getBoard();
  if (!board) {
    throw new Error("Missing board fixture");
  }

  board.columns[1].cards.unshift(draft({ item_id: "PVTI_draft", title: "Original draft", body }));
  backend.setBoard(board);
  render(<App />, queryClient);
  await expect.poll(() => document.querySelectorAll('[data-slot="board-column"]').length).toBe(5);
  flushSync(() => useUi.getState().openDetail("PVTI_draft"));

  await expect.poll(() => get("h1").textContent).toBe("Original draft");
  return backend;
}

test.each(["board", "offline", "rollback"] as const)(
  "draft title and Markdown edits survive reopening in %s",
  async (scenario) => {
    const backend = await openDraft(scenario);
    expect(get('[aria-label="Description"] strong').textContent).toBe("description");
    expect(calls.refresh_issue_description ?? 0).toBe(0);
    click(button("Edit title"));
    fill(get<HTMLInputElement>('[aria-label="Draft title"]'), "Renamed draft");
    fill(get<HTMLTextAreaElement>("textarea"), "# Updated\n\nKeep **Markdown**.");
    click(button("Save draft"));

    await expect.poll(() => document.querySelector('[aria-label="Edit draft"]')).toBeNull();
    await expect.poll(() => get("h1").textContent).toBe("Renamed draft");
    if (scenario === "rollback") {
      await expect
        .poll(
          () => document.querySelector('[aria-label="Description"] [role="alert"]')?.textContent,
        )
        .toContain("Could not update GitHub");
    } else if (scenario === "offline") {
      expect(get('[aria-label="Description"]').textContent).toContain("Waiting for GitHub sync");
    } else {
      await expect.poll(() => button("Edit description").disabled).toBe(false);
    }

    click(button("Close detail"));
    flushSync(() => useUi.getState().openDetail("PVTI_draft"));

    expect(get("h1").textContent).toBe("Renamed draft");
    expect(get('[aria-label="Description"] strong').textContent).toBe("Markdown");
    expect(backend.getBoard()?.columns[1].cards[0].item_id).toBe("PVTI_draft");
    if (scenario !== "offline") {
      click(button("Edit description"));
      expect(get<HTMLInputElement>('[aria-label="Draft title"]').value).toBe("Renamed draft");
      expect(get<HTMLTextAreaElement>("textarea").value).toBe("# Updated\n\nKeep **Markdown**.");
    }
  },
);

test("a refused enqueue preserves the draft text; cancel and an empty title do not save", async () => {
  await openDraft();
  click(button("Edit description"));
  const title = get<HTMLInputElement>('[aria-label="Draft title"]');
  fill(title, "   ");
  expect(button("Save draft").disabled).toBe(true);
  fill(title, "Unsaved title");
  fill(get<HTMLTextAreaElement>("textarea"), "Unsaved body");
  vi.spyOn(commands, "dispatchIntent").mockResolvedValue({
    type: "rejected",
    error: { kind: "Cache", message: "Disk full" },
  });

  click(button("Save draft"));

  await expect
    .poll(() => document.querySelector('[aria-label="Edit draft"] [role="alert"]')?.textContent)
    .toBe("Disk full");
  expect(title.value).toBe("Unsaved title");
  expect(get<HTMLTextAreaElement>("textarea").value).toBe("Unsaved body");
  click(button("Cancel"));
  expect(get("h1").textContent).toBe("Original draft");
  expect(get('[aria-label="Description"] strong').textContent).toBe("description");
});

test.each(["readonly-project", "uncached-body"] as const)(
  "draft editing is unavailable for %s",
  async (state) => {
    await openDraft(
      state === "readonly-project" ? state : "board",
      state === "uncached-body" ? null : "Saved body",
    );

    expect(
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent === "Edit title",
      ),
    ).toBe(false);
    expect(
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent === "Edit description",
      ),
    ).toBe(false);
  },
);
