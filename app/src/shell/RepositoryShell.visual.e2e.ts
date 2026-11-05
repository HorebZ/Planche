import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`repository lists, optional board and native detail fit in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?mock=board");
    await page.getByRole("button", { name: "Add repositories", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Add repositories", exact: true });
    await picker.getByRole("button", { name: "Add HorebZ/Planche", exact: true }).click();
    await expect(
      picker.getByRole("button", { name: "HorebZ/Planche already added", exact: true }),
    ).toBeDisabled();
    await picker.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("link", { name: "Open issues in HorebZ/Planche", exact: true }).click();
    const browser = page.getByRole("region", { name: "Repository browser", exact: true });
    await expect(browser.getByRole("listitem")).toHaveCount(50);
    expect(await browser.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`repository-list-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Save filter", exact: true }).click();
    await page.getByRole("button", { name: "Options for filter Filtre 1", exact: true }).click();
    for (const name of ["Rename", "Duplicate", "Delete"]) {
      await expect(page.getByRole("menuitem", { name, exact: true })).toBeVisible();
    }
    await page.screenshot({
      path: test.info().outputPath(`bookmark-menu-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    const rename = page.getByRole("textbox", { name: "Rename filter Filtre 1", exact: true });
    await expect(rename).toBeFocused();
    await rename.fill("Triage");
    await page.screenshot({
      path: test.info().outputPath(`bookmark-rename-${colorScheme}.png`),
      animations: "disabled",
    });
    await rename.press("Escape");
    await expect(page.getByRole("button", { name: "Filtre 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Closed", exact: true }).click();
    await expect(browser.getByRole("listitem")).toHaveCount(41);
    await page.screenshot({
      path: test.info().outputPath(`repository-closed-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Board", exact: true }).click();
    const board = page.getByRole("region", { name: "Repository kanban", exact: true });
    await expect(board.locator('[data-slot="board-column"]')).toHaveCount(5);
    await expect(board.getByRole("listitem")).toHaveCount(50);
    expect(await board.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`repository-board-${colorScheme}.png`),
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Open issue #122: Repository issue 122", exact: true })
      .click();
    const detail = page.getByRole("article", { name: "Issue detail", exact: true });
    await expect(
      detail.getByRole("heading", { name: "Repository issue 122", exact: true }),
    ).toBeVisible();
    await expect(detail.getByRole("textbox", { name: "Add a comment", exact: true })).toBeVisible();
    expect(
      await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`detail-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1100, height: 700 });
    await expect(detail).toBeVisible();
    expect(await detail.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`detail-small-${colorScheme}.png`),
      animations: "disabled",
    });
  });
}
