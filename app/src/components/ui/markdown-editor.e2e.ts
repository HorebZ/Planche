import { expect, test } from "@playwright/test";

test("formatting from the mouse or keyboard keeps comment and description drafts editable", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();
  const comment = page.getByRole("region", { name: "Write a comment", exact: true });
  const editor = comment.getByRole("textbox", { name: "Add a comment", exact: true });
  await editor.fill("Ready for review");
  await editor.press("Meta+A");
  await comment.getByRole("button", { name: "Bold", exact: true }).click();

  await expect(editor).toHaveValue("**Ready for review**");
  await expect(editor).toBeFocused();
  await comment.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(editor).toHaveValue("Ready for review");
  await comment.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(editor).toHaveValue("**Ready for review**");
  await comment.getByRole("radio", { name: "Preview", exact: true }).click();
  await expect(comment.locator("strong")).toHaveText("Ready for review");
  await comment.getByRole("radio", { name: "Write", exact: true }).click();
  await expect(editor).toHaveValue("**Ready for review**");

  await page.getByRole("button", { name: "Edit description", exact: true }).click();
  const description = page.getByRole("region", { name: "Edit description", exact: true });
  const body = description.getByRole("textbox", { name: "Description Markdown", exact: true });
  await body.fill("first\nsecond");
  await body.press("Meta+A");
  const list = description.getByRole("button", { name: "Bulleted list", exact: true });
  await list.focus();
  await list.press("Enter");

  await expect(body).toHaveValue("- first\n- second");
  await expect(body).toBeFocused();
  await list.focus();
  await list.press("Enter");
  await expect(body).toHaveValue("first\nsecond");
  await list.focus();
  await list.press("Enter");
  await expect(body).toHaveValue("- first\n- second");
  const tasks = description.getByRole("button", { name: "Task list", exact: true });
  await tasks.click();
  await expect(body).toHaveValue("- [ ] first\n- [ ] second");
  await tasks.click();
  await expect(body).toHaveValue("first\nsecond");
  await tasks.click();
  await expect(body).toHaveValue("- [ ] first\n- [ ] second");
  await description.getByRole("radio", { name: "Preview", exact: true }).click();
  await expect(description.locator("ul > li")).toHaveText([" first", " second"]);
  await expect(description.getByRole("checkbox")).toHaveCount(2);
  await expect(description.getByRole("checkbox").first()).not.toBeChecked();
  await description.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor).toHaveValue("**Ready for review**");
});
