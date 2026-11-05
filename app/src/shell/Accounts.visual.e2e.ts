import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`account settings and selector render with ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/?mock=accounts");
    await page.getByRole("button", { name: "Settings ⌘," }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Connected via PAT")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "camille-work OAuth" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Add account…" })).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(760);
    expect(box?.x).toBeGreaterThanOrEqual(0);
  });
}
