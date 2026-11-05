import { expect, type Page, test } from "@playwright/test";

async function openRepository(page: Page, scenario = "board") {
  await page.goto(`/?mock=${scenario}`);
  await page.getByRole("button", { name: "Add repositories", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Add repositories", exact: true });
  await picker.getByRole("button", { name: "Add HorebZ/Planche", exact: true }).click();
  await expect(
    picker.getByRole("button", { name: "HorebZ/Planche already added", exact: true }),
  ).toBeDisabled();
  await picker.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("link", { name: "Open issues in HorebZ/Planche", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Repository issues", exact: true }).getByRole("listitem"),
  ).toHaveCount(50);
  await expect(page.getByRole("button", { name: "Open", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("region", { name: "Repository kanban", exact: true })).toHaveCount(0);
}

test("source pagination, AND milestone and OR labels, and persistent deletable filter shortcuts", async ({
  page,
}) => {
  await openRepository(page);
  const rows = page.locator('[aria-label="Repository kanban"]').getByRole("listitem");
  await page.getByRole("button", { name: "Planche", exact: true }).click();
  await expect(rows).toHaveCount(50);
  await page.getByRole("button", { name: "Load more issues", exact: true }).click();
  await expect(rows).toHaveCount(100);
  await page.getByRole("button", { name: "Load more issues", exact: true }).click();
  await expect(rows).toHaveCount(123);
  await expect(page.getByText(/123 issues loaded · Complete result/)).toBeVisible();
  await page.getByRole("button", { name: "Filter issues", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Backlog", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(rows).toHaveCount(50);
  await page.getByRole("button", { name: "Filter issues", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "bug", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await page.getByRole("menuitemcheckbox", { name: "help", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(rows).toHaveCount(21);
  await expect(
    page.getByRole("button", { name: "Open issue #3: Repository issue 3", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save filter", exact: true }).click();
  await page.getByRole("button", { name: "Filtre 1", exact: true }).dblclick();
  const rename = page.getByRole("textbox", { name: "Rename filter Filtre 1", exact: true });
  await expect(rename).toBeFocused();
  await rename.fill("Triage");
  await rename.press("Enter");
  await expect(page.getByRole("button", { name: "Triage", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Triage", exact: true }).click();
  await expect(rows).toHaveCount(21);
  await expect(
    page.getByRole("button", { name: "Remove milestone filter: Backlog", exact: true }),
  ).toContainText("Backlog");
  await page.getByRole("button", { name: "Options for filter Triage", exact: true }).click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(page.getByRole("button", { name: "Filtre 2", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(rows).toHaveCount(50);
  await page.getByRole("button", { name: "Filtre 2", exact: true }).click();
  await expect(rows).toHaveCount(21);
  await page.getByRole("button", { name: "Options for filter Filtre 2", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const duplicateName = page.getByRole("textbox", { name: "Rename filter Filtre 2", exact: true });
  await expect(duplicateName).toBeFocused();
  await duplicateName.fill("Copy");
  await duplicateName.press("Enter");
  await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Triage", exact: true })).toBeVisible();
  for (const name of ["Copy", "Triage"]) {
    await page.getByRole("button", { name: `Options for filter ${name}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
});

test("native issue detail without a Project preserves source scroll and state when returning", async ({
  page,
}) => {
  await openRepository(page, "projects-empty");
  await page.getByRole("button", { name: "Closed", exact: true }).click();
  const list = page.getByRole("list", { name: "Repository issues", exact: true });
  await expect(list.getByRole("listitem")).toHaveCount(41);
  await list.evaluate((element) => {
    if (element.parentElement) {
      element.parentElement.scrollTop = 600;
    }
  });
  const firstVisible = page.getByRole("button", {
    name: "Open issue #90: Repository issue 90",
    exact: true,
  });
  await firstVisible.focus();
  await firstVisible.press("Enter");
  const detail = page.getByRole("article", { name: "Issue detail", exact: true });
  await expect(
    detail.getByRole("heading", { name: "Repository issue 90", exact: true }),
  ).toBeVisible();
  await expect(detail.getByText("State", { exact: true })).toBeVisible();
  await expect(detail.getByText("Closed", { exact: true })).toBeVisible();
  await expect(detail.getByText("Project", { exact: true })).toHaveCount(0);
  await expect(
    detail.getByRole("button", { name: "Change project status", exact: true }),
  ).toHaveCount(0);
  await expect(detail.getByRole("textbox", { name: "Add a comment", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Closed", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await list.evaluate((element) => element.parentElement?.scrollTop ?? 0)).toBeGreaterThan(
    500,
  );
});

test("a partial offline cache remains partial, can resume, and does not invent cached filters", async ({
  page,
}) => {
  await openRepository(page);
  await page.goto("/?mock=offline");
  await page.getByRole("link", { name: "Open issues in HorebZ/Planche", exact: true }).click();
  const rows = page
    .getByRole("list", { name: "Repository issues", exact: true })
    .getByRole("listitem");
  await expect(rows).toHaveCount(50);
  await expect(
    page.getByText(/Offline · Saved issues · 50 issues loaded · Partial cache/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Closed", exact: true }).click();
  await expect(
    page.getByText("Offline · No saved issues for these filters.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(rows).toHaveCount(50);
  await page.evaluate(() =>
    (
      window as unknown as { __planche: { setRepositoryOffline: (offline: boolean) => void } }
    ).__planche.setRepositoryOffline(false),
  );
  await page.getByRole("button", { name: "Load more issues", exact: true }).click();
  await expect(rows).toHaveCount(82);
  await expect(page.getByText(/82 issues loaded · Complete result/)).toBeVisible();
});

test("Planche uses independent column scrolling while Open and Closed stay lists", async ({
  page,
}) => {
  await openRepository(page);
  await page.getByRole("button", { name: "Planche", exact: true }).click();
  const board = page.getByRole("region", { name: "Repository kanban", exact: true });
  await expect(board.getByRole("listitem")).toHaveCount(50);
  await expect(page.getByRole("list", { name: "Repository issues", exact: true })).toHaveCount(0);
  const column = board.getByRole("region", { name: "Review", exact: true });
  const scroll = column.locator('[data-slot="column-scroll"]');
  const other = board
    .getByRole("region", { name: "In progress", exact: true })
    .locator('[data-slot="column-scroll"]');
  const header = column.locator("header");
  const headerTop = await header.evaluate((element) => element.getBoundingClientRect().top);
  await scroll.hover();
  await page.mouse.wheel(0, 400);

  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await other.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await header.evaluate((element) => element.getBoundingClientRect().top)).toBe(headerTop);
  expect(await board.evaluate((element) => element.scrollTop)).toBe(0);
  expect(
    await page.locator('[data-slot="repository-scroll"]').evaluate((element) => element.scrollTop),
  ).toBe(0);

  await page.getByRole("button", { name: "Closed", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Repository issues", exact: true }).getByRole("listitem"),
  ).toHaveCount(41);
  await expect(board).toHaveCount(0);
});

test("repository issue tabs preserve the shared Markdown editor when returning to fixed views", async ({
  page,
}) => {
  await openRepository(page);
  await page
    .getByRole("button", { name: "Open issue #122: Repository issue 122", exact: true })
    .click();
  await page.getByRole("button", { name: "Open in tab", exact: true }).click();
  const issueTab = page.getByRole("tab", { name: "#122 Repository issue 122", exact: true });
  const detail = page.locator('[data-slot="issue-detail"][data-active="true"]');
  await expect(issueTab).toHaveAttribute("aria-selected", "true");
  await detail.getByRole("button", { name: "Edit description", exact: true }).click();
  await detail
    .getByRole("textbox", { name: "Description Markdown", exact: true })
    .fill("**Repository draft**");
  await detail
    .getByRole("region", { name: "Edit description", exact: true })
    .getByRole("radio", { name: "Preview", exact: true })
    .click();
  await expect(
    detail
      .getByRole("region", { name: "Description Markdown preview", exact: true })
      .locator("strong"),
  ).toHaveText("Repository draft");

  await page.getByRole("tab", { name: "HorebZ/Planche", exact: true }).click();
  await page.getByRole("button", { name: "Closed", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Repository issues", exact: true }).getByRole("listitem"),
  ).toHaveCount(41);
  await issueTab.click();
  await expect(
    detail
      .getByRole("region", { name: "Description Markdown preview", exact: true })
      .locator("strong"),
  ).toHaveText("Repository draft");
  await page
    .getByRole("button", { name: "Close tab: #122 Repository issue 122", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Closed", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("tab")).toHaveCount(1);
});
