import { expect, type Locator, type Page, test } from "@playwright/test";
import type { Board } from "../src/ipc/bindings";

const card = (page: Page, number: number) =>
  page.locator(`[data-slot="issue-card"][data-item-id="PVTI_${number}"]`);
const snapshot = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __planche: { getBoard: () => Board } }).__planche.getBoard(),
  );
const order = (board: Board) =>
  board.columns
    .flatMap((column) => column.cards)
    .sort((left, right) => left.position - right.position)
    .map((card) => card.item_id);

async function filter(page: Page, name: string) {
  await page.getByRole("button", { name: "Filter statuses" }).click();
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
  await page.keyboard.press("Escape");
}

async function moveToProgress(page: Page) {
  await page.keyboard.press("s");

  await expect(page.getByPlaceholder("Change status…")).toBeFocused();

  await page.keyboard.press("3");

  await expect(page.getByPlaceholder("Change status…")).toHaveCount(0);
}

async function drag(page: Page, from: Locator, to: Locator, below: boolean) {
  const source = await from.boundingBox();
  const target = await to.boundingBox();

  if (!source || !target) {
    throw new Error("Missing card bounds");
  }

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2 + 10, {
    steps: 3,
  });

  await expect(page.getByRole("button", { name: "Filter statuses" })).toBeDisabled();

  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height * (below ? 0.8 : 0.2),
    { steps: 12 },
  );
  await expect(page.locator('[data-slot="drag-bubble"]')).toContainText(
    `position ${below ? 2 : 1}`,
  );
  await page.mouse.up();
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`status filters share counts and recover empty results in ${colorScheme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto("/?mock=six-statuses");

    await expect(card(page, 226)).toBeVisible();

    await page.keyboard.press("f");
    await page.getByRole("menuitemcheckbox", { name: "Todo", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`filter-menu-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");

    await expect(page.locator('[data-slot="issue-card"]')).toHaveCount(3);
    await expect(page.locator("header").getByText("3/17 issues")).toBeVisible();

    await page.getByRole("button", { name: "List", exact: true }).click();

    await expect(page.locator('[data-slot="issue-list-row"]')).toHaveCount(3);

    await page.screenshot({
      path: testInfo.outputPath(`filters-${colorScheme}.png`),
      animations: "disabled",
    });
    await filter(page, "Cancelled");
    await filter(page, "Todo");

    await expect(page.getByText("No issues match these filters")).toBeVisible();
    await expect(page.locator("header").getByText("0/17 issues")).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath(`empty-filter-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Clear filters", exact: true }).first().click();

    await expect(page.locator('[data-slot="issue-list-row"]')).toHaveCount(17);
  });
}

for (const layout of ["Board", "List"] as const) {
  test(`${layout}: a filtered-out status change selects the next card, then the previous, then the view`, async ({
    page,
  }) => {
    await page.goto("/?mock=board");
    await page.getByRole("button", { name: layout, exact: true }).click();

    const item = (number: number) =>
      layout === "Board"
        ? card(page, number)
        : page.locator(`[data-slot="issue-list-row"][data-item-id="PVTI_${number}"]`);
    await filter(page, "Todo");
    await item(226).focus();
    await moveToProgress(page);

    await expect(item(226)).toHaveCount(0);
    await expect(item(223)).toBeFocused();

    await item(219).focus();
    await moveToProgress(page);

    await expect(item(223)).toBeFocused();

    await moveToProgress(page);

    await expect(page.getByRole("region", { name: "Project view" })).toBeFocused();
    await expect(page.getByText("No issues match these filters")).toBeVisible();

    await page.keyboard.press("Meta+z");

    await expect(item(223)).toBeVisible();
  });
}

test("search clears filters explicitly and reveals a collapsed List group", async ({ page }) => {
  await page.goto("/?mock=board");
  await page.getByRole("button", { name: "List", exact: true }).click();

  const done = page
    .locator('[data-slot="issue-list-group"]')
    .filter({ has: page.getByText("Done", { exact: true }) });

  await done.locator('[data-slot="issue-list-toggle"]').click();
  await filter(page, "Todo");
  await page.keyboard.press("Meta+k");
  await page.getByRole("combobox").fill("Onboarding: token validation");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Status filters cleared to show the search result")).toBeVisible();
  await expect(page.locator('[data-slot="issue-list-row"][data-item-id="PVTI_220"]')).toBeFocused();
  await expect(done.locator('[data-slot="issue-list-toggle"]')).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

for (const { below, filtered } of [
  { below: false, filtered: true },
  { below: true, filtered: true },
  { below: false, filtered: false },
]) {
  test(`mouse drop ${below ? "after" : "before"} a neighbor ${filtered ? "with" : "without"} filters preserves order and Undo`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("/?mock=board");

    if (filtered) {
      await filter(page, "Todo");
    } else {
      await expect(card(page, 226)).toBeVisible();
    }

    const original = await snapshot(page);
    const before = order(original);
    const movedId = "PVTI_219";

    await drag(page, card(page, 219), card(page, 226), below);

    await expect
      .poll(async () => (await snapshot(page)).columns[1].cards.map((card) => card.item_id))
      .toEqual(below ? ["PVTI_226", movedId, "PVTI_223"] : [movedId, "PVTI_226", "PVTI_223"]);

    expect(order(await snapshot(page)).filter((id) => id !== movedId)).toEqual(
      before.filter((id) => id !== movedId),
    );

    if (!below) {
      const after = order(await snapshot(page));

      expect(after.indexOf(movedId)).toBe(before.indexOf("PVTI_226"));
    }

    await page.keyboard.press("Meta+z");

    await expect.poll(async () => order(await snapshot(page))).toEqual(before);
  });
}

test("keyboard drop into a filtered-out group appends canonically and stays undoable", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await filter(page, "Todo");

  const before = order(await snapshot(page));

  await card(page, 226).focus();
  await page.keyboard.press("Space");

  await expect(page.getByRole("button", { name: "Filter statuses" })).toBeDisabled();

  await page.keyboard.press("f");

  await expect(page.getByRole("menuitemcheckbox")).toHaveCount(0);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");

  await expect(card(page, 226)).toHaveCount(0);
  await expect(card(page, 223)).toBeFocused();

  const moved = await snapshot(page);

  expect(moved.columns[2].cards.map((card) => card.item_id)).toEqual([
    "PVTI_231",
    "PVTI_232",
    "PVTI_228",
    "PVTI_226",
  ]);
  expect(order(moved).filter((id) => id !== "PVTI_226")).toEqual(
    before.filter((id) => id !== "PVTI_226"),
  );

  await page.keyboard.press("Meta+z");

  await expect.poll(async () => order(await snapshot(page))).toEqual(before);
});
