import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [1440, 1100]) {
    test(`issue detail fits a ${width}px window in ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
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
      expect(
        await detail.locator("header, dl").evaluateAll((elements) =>
          elements.every((element) => {
            const style = getComputedStyle(element);
            return style.borderTopWidth === "0px" && style.borderBottomWidth === "0px";
          }),
        ),
      ).toBe(true);
      expect(
        await detail.getByRole("button", { name: "Change project status" }).evaluate((element) => {
          const style = getComputedStyle(element);
          return Number.parseFloat(style.borderRadius) >= element.clientHeight / 2;
        }),
      ).toBe(true);
      await expect(page.getByRole("region", { name: "Project view" })).toBeVisible({
        visible: width === 1440,
      });
      await page.screenshot({
        path: test.info().outputPath(`board-${width}-${colorScheme}.png`),
        animations: "disabled",
      });
      await detail.getByRole("button", { name: "Change project status" }).click();

      await expect(page.getByPlaceholder("Change status…")).toBeFocused();
      await page.screenshot({
        path: test.info().outputPath(`status-${width}-${colorScheme}.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await detail.getByRole("button", { name: "Close detail" }).click();
      await page.getByRole("button", { name: "List", exact: true }).click();
      await page.locator('[data-slot="issue-list-row"][data-item-id="PVTI_226"]').click();

      await expect(detail.getByRole("heading", { level: 1 })).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath(`list-${width}-${colorScheme}.png`),
        animations: "disabled",
      });
      await detail.getByRole("button", { name: "Expand detail" }).click();

      await expect(detail).toHaveAttribute("data-expanded", "true");
      await page.screenshot({
        path: test.info().outputPath(`expanded-${width}-${colorScheme}.png`),
        animations: "disabled",
      });
    });
  }

  test(`issue panel playground in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/playground");

    const preview = page.locator(
      `[data-theme-scope="${colorScheme}"] [data-slot="issue-panel-preview"]`,
    );

    await expect(preview.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(preview.getByRole("img", { name: "Priority: low" })).toBeVisible();
    await preview.screenshot({
      path: test.info().outputPath(`playground-${colorScheme}.png`),
      animations: "disabled",
    });
  });
}
