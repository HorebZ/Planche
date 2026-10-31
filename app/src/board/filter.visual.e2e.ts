import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`combined filter chips and menu fit the minimum window in ${colorScheme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.emulateMedia({ colorScheme });
    await page.goto("/?mock=board");
    await page.getByRole("button", { name: "Filter issues" }).click();

    for (const name of ["Todo", "Me (camille-r)", "feature", "design", "planche/app"]) {
      await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
    }

    await page.keyboard.press("Escape");

    const chips = page.getByRole("button", { name: /^Remove .* filter:/ });

    await expect(chips).toHaveCount(5);

    for (const chip of await chips.all()) {
      await expect(chip).toBeInViewport();
    }

    await expect(page.locator("main > header")).toContainText("1/17 issues");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1100);
    await page.screenshot({
      path: test.info().outputPath(`filters-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Filter issues" }).click();
    await page
      .getByRole("menuitemcheckbox", { name: "planche/app", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`filter-menu-${colorScheme}.png`),
      animations: "disabled",
    });
  });
}
