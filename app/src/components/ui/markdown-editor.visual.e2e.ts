import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`Markdown panel wraps at narrow widths in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto("/playground#markdown-editor");
    const scope = page.locator(`#markdown-editor [data-theme-scope="${theme}"]`);
    const panels = scope.locator('[data-slot="markdown-editor"]');

    await expect(panels).toHaveCount(3);
    const formatting = panels.nth(1).getByRole("group", { name: "Markdown formatting" });
    await expect(formatting.getByRole("button")).toHaveCount(8);
    for (const panel of await panels.all()) {
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
    }
    await expect(panels.last().getByRole("button", { name: "Bold", exact: true })).toBeDisabled();
    await scope.screenshot({
      path: test.info().outputPath(`write-${theme}.png`),
      animations: "disabled",
    });
    await scope.getByRole("radio", { name: "Preview", exact: true }).first().click();
    await expect(scope).toContainText("Nothing to preview.");
    await scope.getByRole("radio", { name: "Preview", exact: true }).nth(1).click();
    await expect(scope.locator("strong")).toHaveText("review");
    await expect(scope.locator("del")).toHaveText("Old wording");
    const tasks = scope.getByRole("checkbox", { name: "Task status" });
    await expect(tasks).toHaveCount(2);
    await expect(tasks.first()).toBeChecked();
    await expect(tasks.last()).not.toBeChecked();
    await expect(tasks.first()).toBeDisabled();
    for (const tool of await formatting.getByRole("button").all()) {
      await expect(tool).toBeDisabled();
      await expect(tool).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    }
    await scope.screenshot({
      path: test.info().outputPath(`preview-${theme}.png`),
      animations: "disabled",
    });
  });
}
