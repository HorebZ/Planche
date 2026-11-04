import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`repository sidebar and picker fit in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto("/?mock=board");
    await page.getByRole("button", { name: "Add repositories", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Add repositories", exact: true });
    await expect(
      picker.getByRole("button", { name: "Add HorebZ/Planche", exact: true }),
    ).toBeEnabled();

    expect(await picker.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await picker.screenshot({
      path: test.info().outputPath(`picker-${colorScheme}.png`),
      animations: "disabled",
    });
    await picker.getByRole("button", { name: "Add HorebZ/Planche", exact: true }).click();
    await expect(
      picker.getByRole("button", { name: "HorebZ/Planche already added", exact: true }),
    ).toBeDisabled();
    await picker.getByRole("button", { name: "Close", exact: true }).click();
    const sidebar = page.locator('[data-slot="sidebar"]');

    expect(await sidebar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await sidebar.screenshot({
      path: test.info().outputPath(`sidebar-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.goto("/playground");
    const previews = page.locator(
      `[data-theme-scope="${colorScheme}"] [data-slot="repository-picker"]`,
    );
    await expect(previews).toHaveCount(5);

    expect(
      await previews.nth(3).evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await previews.nth(3).screenshot({
      path: test.info().outputPath(`error-${colorScheme}.png`),
      animations: "disabled",
    });
  });
}
