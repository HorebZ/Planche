import { expect, test } from "@playwright/test";

test("saved accounts switch in both directions without signing out", async ({ page }) => {
  await page.goto("/?mock=accounts");
  await page.getByRole("button", { name: "Planche account: camille-r" }).click();
  await page.getByRole("menuitemradio", { name: "camille-work · OAuth" }).click();
  await page.getByRole("button", { name: "Settings ⌘," }).click();
  await expect(page.getByText("Connected via OAuth")).toBeVisible();
  await page.getByRole("button", { name: "camille-r PAT" }).click();
  await expect(page.getByRole("button", { name: "Planche account: camille-r" })).toBeVisible();
});
