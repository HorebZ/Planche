import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`issue detail and status menu fit the minimum window in ${colorScheme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.emulateMedia({ colorScheme });
    await page.goto("/?mock=relations");
    await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();

    const detail = page.locator('[data-slot="issue-detail"]');

    await expect(detail).toBeVisible();
    await expect(detail.getByRole("heading", { level: 1 })).toHaveText(
      "Show linked PRs in issue detail",
    );
    expect(await detail.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await expect(detail.getByRole("button", { name: "Change assignees" })).toBeInViewport();
    await page.screenshot({
      path: test.info().outputPath(`detail-${colorScheme}.png`),
      animations: "disabled",
    });
    await detail.getByRole("button", { name: "Change project status" }).click();

    await expect(page.getByPlaceholder("Change status…")).toBeFocused();
    await page.screenshot({
      path: test.info().outputPath(`detail-status-${colorScheme}.png`),
      animations: "disabled",
    });
  });
}
