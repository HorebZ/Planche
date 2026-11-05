import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`description editor and Markdown preview in ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.emulateMedia({ colorScheme });
    await page.goto("/?mock=board");
    await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();
    await page.getByRole("button", { name: "Edit description", exact: true }).click();
    const editor = page.getByRole("region", { name: "Edit description", exact: true });
    const textbox = editor.getByRole("textbox", { name: "Description Markdown", exact: true });
    await textbox.fill(
      "# Updated description\n\nA **formatted** description.\n\n- Ready for review",
    );
    const field = editor.locator('[data-slot="textarea"]');
    const dimensions = await field.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      formWidth: element.closest("form")?.getBoundingClientRect().width,
    }));

    expect(dimensions.height).toBe(480);
    expect(dimensions.width).toBe(dimensions.formWidth);
    await expect(textbox).toHaveCSS("resize", "none");
    await expect(textbox).toBeFocused();
    await expect(textbox).toHaveCSS(
      "box-shadow",
      /^(none|(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px,? ?)*)$/,
    );
    await editor.scrollIntoViewIfNeeded();
    await expect(editor).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`editor-${colorScheme}.png`),
      animations: "disabled",
    });
    await editor.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(editor.locator("strong")).toHaveText("formatted");
    await expect(textbox).toHaveCount(0);
    const preview = editor.getByRole("region", { name: "Description preview", exact: true });
    const previewDimensions = await preview.boundingBox();

    expect(previewDimensions?.height).toBe(dimensions.height);
    expect(previewDimensions?.width).toBe(dimensions.width);
    await editor.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`preview-${colorScheme}.png`),
      animations: "disabled",
    });
  });

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
