import { expect, test } from "@playwright/test";

test("a signed-out user can review and install an alpha update", async ({ page }) => {
  await page.goto("/?mock=onboarding");
  await page.getByRole("button", { name: "Check for updates…", exact: true }).click();
  const dialog = page.getByRole("dialog");

  await expect(dialog).toContainText("You’re up to date.");
  await page.evaluate(() =>
    (
      window as unknown as { __planche: { offerUpdate: () => Promise<void> } }
    ).__planche.offerUpdate(),
  );
  await expect(dialog).toContainText("0.1.0-alpha.1 → 0.1.0-alpha.2");
  await dialog.getByRole("button", { name: "Install and restart" }).click();

  await expect(dialog).toContainText("Installing update…");
  await expect(dialog.getByRole("button", { name: "Later" })).toBeDisabled();
});

test("the footer update button sits before settings and opens release details", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  const footer = page.locator('[data-slot="sidebar-footer"]');
  const indicator = footer.locator('[data-slot="update-indicator"]');

  await expect(indicator).toHaveAccessibleName("Check for updates");
  await expect(
    indicator.locator('xpath=following-sibling::button[@aria-label="Settings ⌘,"]'),
  ).toBeVisible();
  await indicator.click();
  await expect(indicator).toHaveAccessibleName("Check for updates");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.evaluate(() =>
    (
      window as unknown as { __planche: { offerUpdate: () => Promise<void> } }
    ).__planche.offerUpdate(),
  );

  await expect(indicator).toHaveAccessibleName("Planche 0.1.0-alpha.2 available");
  await expect(indicator.locator('[data-slot="update-badge"]')).toBeVisible();
  await indicator.click();
  const dialog = page.getByRole("dialog");

  await expect(dialog).toContainText("0.1.0-alpha.1 → 0.1.0-alpha.2");
  await expect(dialog).toContainText("Alpha fixes and improvements.");
  await dialog.getByRole("button", { name: "Later" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(indicator.locator('[data-slot="update-badge"]')).toBeVisible();
  await indicator.click();
  await dialog.getByRole("button", { name: "Install and restart" }).click();

  await expect(dialog).toContainText("Installing update…");
});
