import { expect, test } from "@playwright/test";

test("an empty List creates drafts with keyboard focus and releases shortcuts on Escape", async ({
  page,
}) => {
  await page.goto("/?mock=empty");

  await expect(page.getByText("This board is empty")).toBeVisible();

  await page.getByRole("button", { name: "List", exact: true }).click();

  const add = page.getByRole("button", { name: "Add draft to Todo", exact: true });

  await add.focus();
  await page.keyboard.press("Enter");

  const todo = page
    .locator('[data-slot="issue-list-group"]')
    .filter({ has: page.getByText("Todo", { exact: true }) });

  await expect(todo.getByLabel("Draft title")).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(page.getByLabel("Draft title")).toHaveCount(0);

  await page.keyboard.press("c");

  await expect(page.getByLabel("Draft title")).toBeFocused();

  await page.keyboard.press("Escape");
  await add.click();
  await todo.getByLabel("Draft title").fill("Draft from empty List");
  await page.keyboard.press("Enter");

  await expect(todo.locator('[data-slot="issue-list-row"]').first()).toContainText(
    "Draft from empty List",
  );
});
