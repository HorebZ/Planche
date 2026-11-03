import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [1440, 1100]) {
    test(`activity fits the detail at ${width}px in ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/?mock=board");
      await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();

      const activity = page.getByRole("region", { name: "Activity", exact: true });

      await activity.scrollIntoViewIfNeeded();
      await expect(activity).toContainText("Ready for review");
      expect(await activity.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: test.info().outputPath(`activity-${width}-${colorScheme}.png`),
        animations: "disabled",
      });
    });
  }
}
