import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  for (const scenario of [
    "board",
    "offline",
    "description-error",
    "description-denied",
    "description-loading",
  ] as const) {
    test(`description ${scenario} in ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1100, height: 700 });
      await page.emulateMedia({ colorScheme });
      await page.goto(`/?mock=${scenario}`);
      await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();

      const description = page.getByRole("region", { name: "Description", exact: true });

      await expect(description).toBeVisible();
      await expect(description).toContainText(
        scenario === "board"
          ? "Description for I_226"
          : scenario === "offline"
            ? "Saved description · Offline"
            : scenario === "description-error"
              ? "Could not load the description"
              : scenario === "description-denied"
                ? "Your access may have changed"
                : "Loading description",
      );
      await page.screenshot({
        path: test.info().outputPath(`${scenario}-${colorScheme}.png`),
        animations: "disabled",
      });
    });
  }
}
