import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`palette keeps search, context and shortcuts readable in ${colorScheme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme });
    await page.goto("/?mock=board");
    await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').focus();
    await page.keyboard.press("Meta+k");

    const dialog = page.getByRole("dialog");
    const search = dialog.getByRole("combobox");
    const context = dialog.locator('[data-slot="command-context"]');

    await expect(search).toBeFocused();
    await expect(context).toContainText("#226 Show linked PRs in issue detail");
    await expect(dialog.getByRole("option").filter({ hasText: "Sync now" })).toBeInViewport();

    const bounds = await dialog.evaluate((element) => {
      const search = element.querySelector('[data-slot="command-input"]')?.getBoundingClientRect();
      const context = element
        .querySelector('[data-slot="command-context"]')
        ?.getBoundingClientRect();

      if (!search || !context) {
        throw new Error("Missing palette content");
      }

      return {
        searchWidth: search.width,
        dialogWidth: element.clientWidth,
        searchBottom: search.bottom,
        contextTop: context.top,
        overflows: element.scrollWidth > element.clientWidth,
      };
    });

    expect(bounds.searchWidth).toBeGreaterThan(bounds.dialogWidth * 0.75);
    expect(bounds.contextTop).toBeGreaterThan(bounds.searchBottom);
    expect(bounds.overflows).toBe(false);

    await page.screenshot({
      path: `screenshots/command-palette-${colorScheme}.png`,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1100, height: 700 });

    await expect(dialog).toBeInViewport({ ratio: 1 });
    await expect(dialog.locator('[data-slot="command-footer"]')).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: `screenshots/command-palette-compact-${colorScheme}.png`,
      animations: "disabled",
    });
  });
}
