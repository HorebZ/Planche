import { expect, test } from "@playwright/test";

test("a signed-out user can review and download an alpha update", async ({ page }) => {
  await page.goto("/?mock=onboarding");
  await page.getByRole("button", { name: "Check for updates…", exact: true }).click();
  const dialog = page.getByRole("dialog");

  await expect(dialog).toContainText("You’re up to date.");
  await page.evaluate(() =>
    (
      window as unknown as { __planche: { offerUpdate: () => Promise<void> } }
    ).__planche.offerUpdate(),
  );
  await dialog.getByRole("button", { name: "Download update" }).click();

  await expect(dialog.getByRole("button", { name: "Install and restart" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Later" }).click();

  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in with GitHub", exact: true }),
  ).toBeVisible();
});
