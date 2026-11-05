import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [1440, 1100]) {
    test(`activity fits the detail at ${width}px in ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 900 });
      await page.route("https://github.com/*.png?size=32", (route) =>
        route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8"/></svg>',
        }),
      );
      await page.goto("/?mock=relations");
      await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();

      const activity = page.getByRole("region", { name: "Activity", exact: true });
      const resources = page.getByRole("region", { name: "Resources", exact: true });

      await activity.scrollIntoViewIfNeeded();
      await expect(activity).toContainText("Ready for review");
      const avatar = activity.locator('[data-slot="avatar"]').first();

      await expect(avatar.locator("img")).toHaveAttribute(
        "src",
        "https://github.com/lea.png?size=32",
      );
      expect((await avatar.boundingBox())?.width).toBe(16);
      await expect(activity.locator('[data-slot="avatar"]').last()).toHaveText("DU");
      expect(await activity.evaluate((element) => getComputedStyle(element).borderLeftWidth)).toBe(
        "0px",
      );
      for (const section of [resources, activity]) {
        expect(await section.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe(
          "1px",
        );
      }
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
