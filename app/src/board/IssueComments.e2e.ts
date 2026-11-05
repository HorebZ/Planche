import { expect, test } from "@playwright/test";

test("comment drafts survive opening a tab and Cmd+Enter posts once into activity", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();
  const editor = page.getByRole("textbox", { name: "Add a comment", exact: true });

  await expect(editor).toBeEnabled();
  await editor.fill("A comment from Planche **without duplicates**.");
  await page.getByRole("radio", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("region", { name: "Write a comment" }).locator("strong")).toHaveText(
    "without duplicates",
  );
  await page.getByRole("radio", { name: "Write", exact: true }).click();
  await page.getByRole("button", { name: "Open in tab", exact: true }).click();

  await expect(editor).toHaveValue("A comment from Planche **without duplicates**.");
  await editor.focus();
  await page.keyboard.press("Meta+Enter");
  await page.keyboard.press("Meta+Enter");

  await expect(editor).toHaveValue("");
  const activity = page
    .getByRole("region", { name: "Activity", exact: true })
    .filter({ visible: true });
  await expect(activity.getByText("A comment from Planche", { exact: false })).toHaveCount(1);
  await expect(activity.locator("strong").filter({ hasText: "without duplicates" })).toHaveCount(1);
  await expect(page.getByText("Comment posted.", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls
          .dispatch_issue_intent,
    ),
  ).toBe(1);
});

test("a refused comment keeps its text and can be retried without replacing a newer draft", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();
  const editor = page.getByRole("textbox", { name: "Add a comment", exact: true });
  await expect(editor).toBeEnabled();
  await editor.fill("Please retain my failed comment.");
  await page.evaluate(() =>
    (
      window as unknown as { __planche: { failNextComment: () => void } }
    ).__planche.failNextComment(),
  );
  await editor.press("Meta+Enter");

  await expect(editor).toHaveValue("");
  const composer = page.getByRole("region", { name: "Write a comment" });
  await expect(composer).toContainText("GitHub refused this comment. Your text is saved.");
  await expect(composer).toContainText("Please retain my failed comment.");
  await editor.fill("A newer unsent draft.");
  await composer.getByRole("button", { name: "Retry comment", exact: true }).click();

  await expect(page.getByRole("region", { name: "Activity", exact: true })).toContainText(
    "Please retain my failed comment.",
  );
  await expect(editor).toHaveValue("A newer unsent draft.");
});

test("offline comments enter the persistent queue and remain visible after reopening the detail", async ({
  page,
}) => {
  await page.goto("/?mock=offline");
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();
  const editor = page.getByRole("textbox", { name: "Add a comment", exact: true });
  await expect(editor).toBeEnabled();
  await editor.fill("Saved while offline.");
  await editor.press("Meta+Enter");

  await expect(editor).toHaveValue("");
  await expect(page.getByText("Comment queued · Saved on this Mac", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close detail", exact: true }).click();
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();

  await expect(page.getByRole("region", { name: "Write a comment" })).toContainText(
    "Saved while offline.",
  );
});
