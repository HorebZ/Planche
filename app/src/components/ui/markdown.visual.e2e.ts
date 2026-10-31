import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`Markdown headings, lists, code and links in ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.emulateMedia({ colorScheme });
    await page.goto("/?mock=markdown");
    await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();

    const markdown = page.locator('[data-slot="markdown"]');

    await expect(markdown.getByRole("heading", { name: "Release notes" })).toBeVisible();
    expect(await markdown.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`markdown-top-${colorScheme}.png`),
      animations: "disabled",
    });
    await markdown
      .getByText("Image not loaded: Board screenshot", { exact: true })
      .scrollIntoViewIfNeeded();
    await markdown.getByRole("link", { name: "project", exact: true }).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");

    await expect(markdown.locator("pre")).toBeInViewport();
    await page.screenshot({
      path: test.info().outputPath(`markdown-bottom-${colorScheme}.png`),
      animations: "disabled",
    });
  });
}
