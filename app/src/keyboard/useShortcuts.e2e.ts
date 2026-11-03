import { expect, type Locator, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

const card = (page: Page, number: number) =>
  page.locator(`[data-slot="issue-card"][data-item-id="PVTI_${number}"]`);

const column = (page: Page, name: string) =>
  page.locator('[data-slot="board-column"]').filter({ has: page.getByText(name, { exact: true }) });

const numbers = (col: Locator) =>
  col
    .locator('[data-slot="issue-card"]')
    .evaluateAll((cards) =>
      cards.map((c) => Number(c.getAttribute("data-item-id")?.replace("PVTI_", ""))),
    );

const focused = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute("data-item-id") ?? null);

const toast = (page: Page) => page.locator('[data-slot="toast"]');

async function open(page: Page) {
  await page.goto("/?mock=board");

  await expect(card(page, 226)).toBeVisible();
}

async function selectCard(page: Page, number: number) {
  await card(page, number).focus();

  await expect.poll(() => focused(page)).toBe(`PVTI_${number}`);
}

test("⌘⇧H hides the focused project, the menu's project, or the current project from the board", async ({
  page,
}) => {
  await open(page);

  const sidebar = page.locator('[data-slot="sidebar"]');
  const project = (name: string) => sidebar.getByRole("button", { name, exact: true });

  await project("Design system").focus();
  await page.keyboard.press("Meta+Shift+h");

  await expect(project("Design system")).toHaveCount(0);
  await expect(project("Planche — v1.2 17")).toBeVisible();

  await project("More options for API Gateway").click();
  await page.keyboard.press("Meta+Shift+h");

  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(project("API Gateway")).toHaveCount(0);

  await project("2 hidden").click();
  await project("API Gateway").click({ button: "right" });
  await page.keyboard.press("Meta+Shift+h");

  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(project("Show API Gateway in sidebar")).toHaveCount(0);
  await expect(project("API Gateway")).toBeVisible();

  await selectCard(page, 226);
  await page.keyboard.press("Meta+Shift+h");

  await expect(project("Show Planche — v1.2 in sidebar")).toBeVisible();
  await expect(card(page, 226)).toBeVisible();

  await project("Show Planche — v1.2 in sidebar").click();

  await expect(project("Show Planche — v1.2 in sidebar")).toHaveCount(0);
  await expect(project("Planche — v1.2 17")).toBeVisible();
});

test("⇧→ moves the card a column, ⌘Z puts it back where it was, and the toast says so", async ({
  page,
}) => {
  await open(page);
  await selectCard(page, 223);
  await page.keyboard.press("Shift+ArrowRight");

  await expect.poll(() => numbers(column(page, "In progress"))).toContain(223);
  await expect(toast(page).filter({ hasText: "#223 moved to In progress" })).toBeVisible();
  await expect(toast(page).getByRole("button", { name: /Undo/ })).toBeVisible();

  await page.keyboard.press("Meta+z");

  await expect.poll(() => numbers(column(page, "Todo"))).toEqual([226, 223, 219]);
  await expect(toast(page).filter({ hasText: "Undone: #223 moved to In progress" })).toBeVisible();
  expect(await focused(page)).toBe("PVTI_223");

  // One level: a second ⌘Z changes nothing.
  await page.keyboard.press("Meta+z");

  await expect.poll(() => numbers(column(page, "Todo"))).toEqual([226, 223, 219]);
});

test("list selection, status menu and palette restore focus to visible rows", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "List", exact: true }).click();

  const rows = page.locator('[data-slot="issue-list-row"]');

  await rows.first().focus();
  await page.keyboard.press("j");

  await expect(rows.nth(1)).toBeFocused();

  await page.keyboard.press("s");

  await expect(page.getByPlaceholder("Change status…")).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(rows.nth(1)).toBeFocused();

  await page.keyboard.press("Meta+k");
  await page.keyboard.press("Escape");

  await expect(rows.nth(1)).toBeFocused();

  await page.keyboard.press("ArrowLeft");

  const header = page.getByRole("button", { name: /Backlog.*6/ });

  await expect(header).toBeFocused();
  await expect(header).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("ArrowRight");

  await expect(header).toHaveAttribute("aria-expanded", "true");
});
