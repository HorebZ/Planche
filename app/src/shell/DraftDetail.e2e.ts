import { expect, test } from "@playwright/test";
import type { Board } from "@/ipc/bindings.types";

test("edit a project draft title and description, preview Markdown, cancel and reopen", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await expect(page.locator('[data-slot="board-column"]')).toHaveCount(5);
  await page.evaluate(async () => {
    const backend = (
      window as unknown as {
        __planche: {
          getBoard: () => Board;
          setBoard: (board: Board) => void;
          emit: (name: string, payload: unknown) => Promise<void>;
        };
      }
    ).__planche;
    const board = structuredClone(backend.getBoard());
    board.columns[1].cards.unshift({
      kind: "draft",
      item_id: "PVTI_draft",
      id: "DI_draft",
      title: "A project draft",
      body: "Original **description**",
      edit_error: null,
      assignees: [],
      position: 0,
      pending: false,
      updated_by_sync: false,
    });
    backend.setBoard(board);
    await backend.emit("board-changed", { project_id: board.project.id });
  });
  const card = page.locator('[data-slot="issue-card"][data-item-id="PVTI_draft"]');
  await card.click();
  await page.getByRole("button", { name: "Edit title", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Draft title", exact: true })).toBeFocused();
  await page.getByRole("textbox", { name: "Draft title", exact: true }).fill("Cancelled title");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A project draft");

  await page.getByRole("button", { name: "Edit description", exact: true }).click();
  await page.getByRole("textbox", { name: "Draft title", exact: true }).fill("Renamed draft");
  const editor = page.getByRole("textbox", { name: "Description Markdown", exact: true });
  await editor.fill("# Draft details\n\nKeep **Markdown**.");
  const editing = page.getByRole("region", { name: "Edit draft", exact: true });
  await editing.getByRole("radio", { name: "Preview", exact: true }).click();
  await expect(editing.locator("strong")).toHaveText("Markdown");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Renamed draft");
  const description = page.getByRole("region", { name: "Description", exact: true });
  await expect(description.locator("strong")).toHaveText("Markdown");
  await expect(page.getByRole("button", { name: "Edit title", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Close detail", exact: true }).click();
  await card.click();
  await page.getByRole("button", { name: "Edit title", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Draft title", exact: true })).toHaveValue(
    "Renamed draft",
  );
  await expect(editor).toHaveValue("# Draft details\n\nKeep **Markdown**.");
});
