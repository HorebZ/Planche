import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("the inset shell and neutral controls follow the v2 light and dark tokens", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/?mock=board");

  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(239, 239, 240)");
  await expect(page.locator("main")).toHaveCSS("background-color", "rgb(249, 249, 250)");
  await expect(page.locator('[data-slot="sidebar"]')).toHaveCSS("width", "220px");
  await expect(page.locator("main")).toHaveCSS("margin-top", "8px");
  await expect(page.locator("main")).toHaveCSS("border-radius", "10px");

  await page.emulateMedia({ colorScheme: "dark" });

  await expect(page.locator("main")).toHaveCSS("background-color", "rgb(18, 18, 19)");
  await expect(page.locator('[data-slot="issue-card"]').first()).toHaveCSS(
    "background-color",
    "rgb(26, 26, 27)",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });

  await expect(page.locator('[data-slot="issue-card"]').first()).toHaveCSS(
    "transition-duration",
    "0s",
  );
});

test.describe("v2 visual checks", () => {
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture the v2 views");

  for (const colorScheme of ["light", "dark"] as const) {
    test(`list, palette and settings ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/?mock=board");
      await page.getByRole("button", { name: "List", exact: true }).click();
      await page.locator('[data-slot="issue-list-row"]').first().waitFor();
      await page.screenshot({
        path: `screenshots/v2-list-${colorScheme}.png`,
        animations: "disabled",
      });
      await page.keyboard.press("Meta+k");
      await page.getByRole("dialog").waitFor();
      await page.screenshot({
        path: `screenshots/v2-palette-${colorScheme}.png`,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Meta+,");
      await page.getByRole("dialog").waitFor();
      await page.screenshot({
        path: `screenshots/v2-settings-${colorScheme}.png`,
        animations: "disabled",
      });
    });
  }
});
