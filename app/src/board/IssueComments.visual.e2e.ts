import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`comment composer states fit the detail in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
    await page.goto("/?mock=board");
    await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();
    const composer = page.getByRole("region", { name: "Write a comment" });
    const editor = composer.getByRole("textbox", { name: "Add a comment", exact: true });
    await expect(editor).toBeEnabled();
    await editor.fill(
      "A **Markdown** comment with a [link](https://github.com).\n\nA second paragraph.",
    );
    await composer.getByRole("button", { name: "Preview", exact: true }).click();
    await composer.scrollIntoViewIfNeeded();

    expect(await composer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await composer.screenshot({
      path: test.info().outputPath(`comment-${theme}.png`),
      animations: "disabled",
    });
    await page.goto("/playground");
    const previews = page
      .locator(`[data-theme-scope="${theme}"]`)
      .getByRole("region", { name: "Write a comment" });

    await expect(previews).toHaveCount(8);
    await expect(previews.nth(6)).toContainText("Publication could not be confirmed");
    expect(
      await previews.nth(6).evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await previews.nth(6).screenshot({
      path: test.info().outputPath(`failed-comment-${theme}.png`),
      animations: "disabled",
    });
  });
}
