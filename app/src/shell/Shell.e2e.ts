import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 980, height: 240 } });

for (const layout of ["Board", "List"] as const) {
  test(`${layout} and projects scroll independently while the window stays fixed`, async ({
    page,
  }) => {
    await page.goto("/?mock=big");
    await page.getByRole("button", { name: layout, exact: true }).click();

    const sidebar = page.locator('[data-slot="sidebar"]');
    const projects = sidebar.locator('[data-slot="sidebar-group"]').locator("..");
    const content = page
      .locator(layout === "Board" ? '[data-slot="column-scroll"]' : '[data-slot="issue-list"]')
      .first();
    const account = sidebar.getByRole("button", { name: /^Planche account:/ });
    const footer = sidebar.locator('[data-slot="sidebar-footer"]');
    const accountBefore = await account.boundingBox();
    const footerBefore = await footer.boundingBox();

    await expect(projects).toHaveCSS("overscroll-behavior-y", "contain");
    await expect(page.locator("html")).toHaveCSS("overscroll-behavior-y", "none");

    await projects.hover();
    await page.mouse.wheel(0, 500);

    await expect.poll(() => projects.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await content.evaluate((element) => element.scrollTop)).toBe(0);
    expect(await account.boundingBox()).toEqual(accountBefore);
    expect(await footer.boundingBox()).toEqual(footerBefore);

    const projectsBefore = await projects.evaluate((element) => element.scrollTop);

    await content.hover();
    await page.mouse.wheel(0, 500);

    await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await projects.evaluate((element) => element.scrollTop)).toBe(projectsBefore);
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
    ).toBe(true);
  });
}
