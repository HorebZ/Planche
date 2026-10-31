import { expect, type Locator, type Page, test } from "@playwright/test";

import type { Scenario } from "@/ipc/_fixtures/scenarios.fixtures";

test.use({ viewport: { width: 1920, height: 900 } });

const card = (page: Page, number: number) =>
  page.locator(`[data-slot="issue-card"][data-item-id="PVTI_${number}"]`);

async function open(page: Page, scenario: Scenario) {
  await page.goto(`/?mock=${scenario}`);

  await expect(card(page, 226)).toBeVisible();
}

async function lift(page: Page, from: Locator, to: Locator, below = true) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();

  if (!a || !b) {
    throw new Error("no box");
  }

  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 10, { steps: 3 });

  await expect(page.locator('[data-slot="drag-help-bar"]')).toBeVisible();

  await page.mouse.move(b.x + b.width / 2, b.y + b.height * (below ? 0.8 : 0.2), { steps: 12 });
}

test.describe("screenshots", () => {
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture the drag states");

  for (const colorScheme of ["light", "dark"] as const) {
    test(`drag ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await open(page, "board");
      await lift(page, card(page, 214), card(page, 231));
      await page.waitForTimeout(250);
      await page.screenshot({ path: `screenshots/window-drag-${colorScheme}.png` });
      await page.mouse.up();
    });
    test(`offline ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await open(page, "offline");
      await page.screenshot({
        path: `screenshots/window-error-${colorScheme}.png`,
        animations: "disabled",
      });
    });
    test(`rollback ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await open(page, "rollback");
      await lift(page, card(page, 226), card(page, 220));
      await page.mouse.up();
      await page.getByText("Reverted.").waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `screenshots/window-rollback-${colorScheme}.png`,
        animations: "disabled",
      });
    });
  }
});
