import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [1440, 1100]) {
    test(`retained issues fit ${width}px in ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.goto("/?mock=markdown");
      await page.getByRole("button", { name: "List", exact: true }).click();

      for (const id of [218, 214, 226, 223]) {
        await page.locator(`[data-slot="issue-list-row"][data-item-id="PVTI_${id}"]`).click();
        await page.keyboard.press("Meta+Enter");
        if (id !== 223) {
          await page.keyboard.press("Escape");
        }
      }

      const detail = page.getByRole("article", { name: "Issue detail" });

      await expect(page.getByRole("tab", { selected: true })).toBeInViewport();
      await expect(detail.getByRole("heading", { level: 1 })).toHaveText(
        "Column counter ignores filtered cards",
      );
      expect(
        await page
          .locator("main")
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`tabs-${width}-${colorScheme}.png`),
        animations: "disabled",
      });
      await detail.getByRole("button", { name: "Change project status" }).click();

      await expect(page.getByPlaceholder("Change status…")).toBeFocused();
      await page.screenshot({
        path: test.info().outputPath(`tabs-status-${width}-${colorScheme}.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page.getByRole("tab", { name: "Planche — v1.2", exact: true }).click();
      await page.getByRole("button", { name: "Board", exact: true }).click();

      await expect(page.getByRole("region", { name: "Project view" })).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath(`tabs-board-${width}-${colorScheme}.png`),
        animations: "disabled",
      });
    });
  }

  test(`issue tabs playground in ${colorScheme}`, async ({ page }) => {
    await page.goto("/playground");
    const preview = page.locator(
      `[data-theme-scope="${colorScheme}"] [data-slot="issue-tabs-preview"]`,
    );

    await expect(preview.getByRole("tab", { selected: true })).toHaveText(/Issue 223/);
    await preview.screenshot({
      path: test.info().outputPath(`tabs-playground-${colorScheme}.png`),
      animations: "disabled",
    });
  });
}
