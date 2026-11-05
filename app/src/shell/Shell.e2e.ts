import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 980, height: 240 } });

for (const layout of ["Board", "List"] as const) {
  test(`${layout} and projects scroll independently while the window stays fixed`, async ({
    page,
  }) => {
    await page.goto("/?mock=big");
    await page.getByRole("button", { name: "Display", exact: true }).click();
    await page.getByRole("menuitemradio", { name: layout, exact: true }).click();

    const sidebar = page.locator('[data-slot="sidebar"]');
    const projects = sidebar.locator('[data-slot="sidebar-group"]').first().locator("..");
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

for (const width of [980, 1440]) {
  test(`named views and external link share one toolbar row at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/?mock=board");
    const views = page.getByRole("group", { name: "Project views", exact: true });
    const external = page.getByRole("button", { name: "Open project on GitHub", exact: true });

    await expect(views.getByRole("button")).toHaveCount(2);
    await views.getByRole("button", { name: "Planning", exact: true }).click();

    await expect(page.getByRole("tab", { selected: true })).toHaveText("Planche — v1.2 / Planning");
    await expect(views.getByRole("button", { name: "Planning", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const viewBounds = await views.boundingBox();
    const linkBounds = await external.boundingBox();
    const toolbarBounds = await page.locator('[data-slot="project-toolbar"]').boundingBox();

    expect(viewBounds).not.toBeNull();
    expect(linkBounds).not.toBeNull();
    expect(toolbarBounds?.height).toBeLessThanOrEqual(44);
    expect(Math.abs((viewBounds?.y ?? 0) - (linkBounds?.y ?? 0))).toBeLessThanOrEqual(2);
    expect(
      await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  });
}
