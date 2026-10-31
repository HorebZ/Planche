import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`column add preserves keyboard focus and Escape in ${colorScheme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/?mock=board");

    const selected = page.locator('[data-item-id="PVTI_231"]');

    await selected.focus();

    const add = page.getByRole("button", { name: "Add draft to Todo", exact: true });

    await page.keyboard.press("Tab");
    await selected.focus();
    await add.focus();

    await expect(add).toBeFocused();
    expect(await add.evaluate((el) => el.matches(":focus-visible"))).toBe(true);

    await page.screenshot({ path: testInfo.outputPath(`column-add-focus-${colorScheme}.png`) });
    await page.keyboard.press("Enter");

    await expect(page.getByLabel("Draft title")).toBeFocused();

    await page.screenshot({ path: testInfo.outputPath(`column-draft-${colorScheme}.png`) });
    await page.keyboard.press("Escape");

    await expect(page.getByLabel("Draft title")).toHaveCount(0);
    await expect(selected).toBeFocused();
  });
}
