import { expect, type Locator, test } from "@playwright/test";

async function expectRowHeights(rows: Locator) {
  const sizes = await rows.evaluateAll((rows) =>
    rows.map((row) => ({
      height: row.getBoundingClientRect().height,
      labelled: Boolean(row.querySelector('[data-slot="label-chip"]')),
    })),
  );

  const labelled = sizes.filter((row) => row.labelled);
  const unlabelled = sizes.filter((row) => !row.labelled);

  expect(new Set(labelled.map((row) => row.height)).size).toBe(1);
  if (unlabelled.length > 0) {
    expect(new Set(unlabelled.map((row) => row.height)).size).toBe(1);
    expect(unlabelled[0].height).toBeLessThan(labelled[0].height);
  }
}

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
    const unassigned = browser.locator('[data-item-id="I_repo_121"]');
    const assigned = browser.locator('[data-item-id="I_repo_122"]');
    const circle = unassigned.getByRole("img", { name: "Unassigned", exact: true });
    await expect(circle).toHaveCSS("opacity", "0");
    await unassigned.hover();
    await expect(circle).toHaveCSS("opacity", "0.6");
    await assigned.hover();
    await expect(circle).toHaveCSS("opacity", "0");
    await expect(assigned.locator('[data-slot="avatar-stack"] [data-slot="avatar"]')).toBeVisible();
    await unassigned.focus();
    await expect(circle).toHaveCSS("opacity", "0.6");
    await assigned.focus();
    await expect(circle).toHaveCSS("opacity", "0");
    await expect(unassigned.getByTitle("Created by HorebZ")).toBeVisible();
    await expect(unassigned.locator("time")).toHaveCount(2);
    await expect(assigned.getByRole("img", { name: "2 comments", exact: true })).toBeVisible();
    await expect(
      browser
        .locator('[data-item-id="I_repo_119"]')
        .getByRole("img", { name: "Pull request #319: Fix issue 119 (open)", exact: true }),
    ).toHaveText("1");
    await expect(
      browser
        .locator('[data-item-id="I_repo_110"]')
        .getByRole("img", { name: "Pull request #310: Fix issue 110 (draft)", exact: true }),
    ).toHaveText("1");
    const commentGap = await assigned.evaluate((row) => {
      const comments = row
        .querySelector('[data-slot="issue-comment-count"]')
        ?.getBoundingClientRect();
      const assignees = row.querySelector('[data-slot="avatar-stack"]')?.getBoundingClientRect();
      return comments && assignees ? assignees.left - comments.right : 0;
    });
    expect(commentGap).toBeGreaterThanOrEqual(24);
    const commentPositions = await browser
      .locator('[data-item-id] [data-slot="issue-comment-count"]')
      .evaluateAll((counts) => counts.map((count) => count.getBoundingClientRect().left));
    expect(Math.max(...commentPositions) - Math.min(...commentPositions)).toBeLessThan(1);
    await expectRowHeights(browser.locator("[data-item-id]"));
    await expect(
      browser
        .locator("[data-item-id]")
        .filter({ hasNot: page.locator('[data-slot="label-chip"]') }),
    ).not.toHaveCount(0);
    expect(await browser.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`repository-list-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Filter issues", exact: true }).click();
    await expect(page.getByRole("group", { name: "Milestone", exact: true })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`repository-filters-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
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
    await expect(
      browser
        .locator('[data-item-id="I_repo_123"]')
        .getByRole("img", { name: "Pull request #323: Fix issue 123 (closed)", exact: true }),
    ).toHaveText("1");
    await expect(
      browser
        .locator('[data-item-id="I_repo_120"]')
        .getByRole("img", { name: "Pull request #320: Fix issue 120 (merged)", exact: true }),
    ).toHaveText("1");
    await expectRowHeights(browser.locator("[data-item-id]"));
    await page.screenshot({
      path: test.info().outputPath(`repository-closed-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Planche", exact: true }).click();
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
    await detail.getByRole("button", { name: "Open in tab", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: "#122 Repository issue 122", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.screenshot({
      path: test.info().outputPath(`repository-tab-${colorScheme}.png`),
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
