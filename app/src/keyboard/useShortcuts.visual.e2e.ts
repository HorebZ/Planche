import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

const card = (page: Page, number: number) =>
  page.locator(`[data-slot="issue-card"][data-item-id="PVTI_${number}"]`);

const focused = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute("data-item-id") ?? null);

const toast = (page: Page) => page.locator('[data-slot="toast"]');

async function selectCard(page: Page, number: number) {
  await card(page, number).focus();

  await expect.poll(() => focused(page)).toBe(`PVTI_${number}`);
}

test.describe("keyboard review captures", () => {
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture keyboard UI");

  for (const colorScheme of ["light", "dark"] as const) {
    test(`palette, status and undo ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/?mock=six-statuses");
      await selectCard(page, 226);
      await page.keyboard.press("Meta+k");

      await expect(page.getByRole("dialog")).toBeVisible();

      await page.screenshot({
        path: `screenshots/keyboard-palette-${colorScheme}.png`,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page.keyboard.press("s");

      await expect(page.getByPlaceholder("Change status…")).toBeFocused();

      await page.screenshot({
        path: `screenshots/keyboard-status-${colorScheme}.png`,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Shift+ArrowRight");

      await expect(toast(page).getByRole("button", { name: /Undo/ })).toBeVisible();

      await page.screenshot({
        path: `screenshots/keyboard-undo-${colorScheme}.png`,
        animations: "disabled",
      });
    });
  }
});
