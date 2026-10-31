import { expect, test } from "@playwright/test";

test("6b: a valid token shows the account, then the project step opens the board", async ({
  page,
}) => {
  await page.goto("/?mock=valid");
  await page.getByLabel("Personal access token").fill("ghp_example");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Valid")).toBeVisible();
  await expect(page.locator('[data-slot="account-block"]')).toContainText(
    "Signed in as camille-r · 5 projects found",
  );
  await expect(page.locator('[data-slot="scope-row"][data-state="ok"]')).toHaveCount(3);
  await expect(page.getByRole("button", { name: /Continue/ })).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(page.getByText("Step 2 of 2")).toBeVisible();

  await page.getByRole("button", { name: "Planche — v1.2" }).click();
  await page.getByRole("button", { name: /Open board/ }).click();

  await expect(page.locator('[data-slot="board-column"]')).toHaveCount(5);
});
