import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`the compact color palette changes only its project and persists in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/?mock=board");
    const sidebar = page.locator('[data-slot="sidebar"]');
    const project = sidebar.getByRole("button", { name: "API Gateway", exact: true });
    const current = sidebar.getByRole("button", { name: /^Planche — v1\.2/ });
    const swatch = project.locator('[data-slot="project-color"]');
    const trigger = sidebar.getByRole("button", { name: "Change color for API Gateway" });
    const palette = page.getByRole("dialog", { name: "Color for API Gateway", exact: true });
    const headerSwatch = page.locator('main header [data-slot="project-color"]');

    await expect(headerSwatch).toHaveClass(/\bbg-project-gray\b/);

    await trigger.click();
    await expect(current).toHaveAttribute("aria-current", "page");
    await expect(project).not.toHaveAttribute("aria-current");
    await expect(palette.getByRole("button")).toHaveCount(12);
    expect(await palette.getByRole("button").allTextContents()).toEqual(Array(12).fill(""));
    const colors = await palette
      .locator("button > span")
      .evaluateAll((swatches) => swatches.map((el) => getComputedStyle(el).backgroundColor));
    expect(new Set(colors).size).toBe(12);
    await expect(palette.getByRole("button", { name: "Purple", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await palette.getByRole("button", { name: "Blue", exact: true }).click();
    await expect(palette).toHaveCount(0);
    await expect(swatch).toHaveClass(/\bbg-project-blue\b/);
    await expect(headerSwatch).toHaveClass(/\bbg-project-gray\b/);
    const color = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor);

    await project.click();
    await expect(project).toHaveAttribute("aria-current", "page");
    await expect(swatch).toHaveCSS("background-color", color);
    await expect(headerSwatch).toHaveCSS("background-color", color);
    await current.click();
    await expect(project).not.toHaveAttribute("aria-current");
    await expect(swatch).toHaveCSS("background-color", color);
    await expect(headerSwatch).toHaveClass(/\bbg-project-gray\b/);

    await page.reload();
    await expect(swatch).toHaveCSS("background-color", color);
    await expect(current.locator('[data-slot="project-color"]')).toHaveClass(/\bbg-project-gray\b/);

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(palette).toBeVisible();
    await expect(palette.getByRole("button", { name: "Blue", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(swatch).toHaveCSS("background-color", color);

    await sidebar
      .getByRole("button", { name: "Change color for Planche — v1.2", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Color for Planche — v1.2", exact: true })
      .getByRole("button", { name: "Pink", exact: true })
      .click();
    const currentSwatch = current.locator('[data-slot="project-color"]');
    await expect(currentSwatch).toHaveClass(/\bbg-project-pink\b/);
    const currentColor = await currentSwatch.evaluate((el) => getComputedStyle(el).backgroundColor);
    await expect(headerSwatch).toHaveCSS("background-color", currentColor);
    await page.reload();
    await expect(headerSwatch).toHaveCSS("background-color", currentColor);
  });
}
