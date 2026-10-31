import { expect, type Locator, type Page, test } from "@playwright/test";

import type { Board } from "@/ipc/bindings.types";

test.use({ video: process.env.VIDEO ? "on" : "off" });

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
  await page.getByRole("button", { name: "Filter issues" }).click();
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
  await page.keyboard.press("Escape");
}

async function drag(page: Page, from: Locator, to: Locator) {
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

  await expect(page.getByRole("button", { name: "Filter issues" })).toBeDisabled();

  await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.8, { steps: 12 });
  await expect(page.locator('[data-slot="drag-bubble"]')).toContainText("position 2");
  await page.mouse.up();
}

test("a mouse drop after a filtered neighbor preserves order and Undo", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto("/?mock=board");
  await filter(page, "Todo");

  const before = order(await snapshot(page));
  const movedId = "PVTI_219";

  await drag(page, card(page, 219), card(page, 226));

  await expect
    .poll(async () => (await snapshot(page)).columns[1].cards.map((card) => card.item_id))
    .toEqual(["PVTI_226", movedId, "PVTI_223"]);
  expect(order(await snapshot(page)).filter((id) => id !== movedId)).toEqual(
    before.filter((id) => id !== movedId),
  );

  await page.keyboard.press("Meta+z");

  await expect.poll(async () => order(await snapshot(page))).toEqual(before);
});

test("keyboard drop into a filtered-out group appends canonically and stays undoable", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await filter(page, "Todo");

  const before = order(await snapshot(page));

  await card(page, 226).focus();
  await page.keyboard.press("Space");

  await expect(page.getByRole("button", { name: "Filter issues" })).toBeDisabled();

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

test("combined filters share results between Board/List, removable chips and reset", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await page.getByRole("button", { name: "Filter issues" }).click();

  for (const name of ["Me (camille-r)", "bug"]) {
    await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
  }

  await expect(page.getByText("No issues match these filters")).toBeVisible();

  for (const name of ["feature", "design", "planche/app"]) {
    await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
  }

  await page.keyboard.press("Escape");

  const expected = ["PVTI_214", "PVTI_226", "PVTI_231", "PVTI_229"];
  const ids = (slot: string) =>
    page
      .locator(`[data-slot="${slot}"]`)
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-item-id")));

  await expect.poll(() => ids("issue-card")).toEqual(expected);
  await expect(page.locator('[data-slot="project-toolbar"]')).toContainText("4/17 issues");
  await page.getByRole("button", { name: "List", exact: true }).click();

  await expect.poll(() => ids("issue-list-row")).toEqual(expected);
  await page.getByRole("button", { name: "Remove assignee filter: Me (camille-r)" }).click();

  await expect(page.locator('[data-slot="issue-list-row"]')).toHaveCount(8);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();

  await expect(page.locator('[data-slot="issue-list-row"]')).toHaveCount(17);
});

test("a keyboard drop preserves hidden neighbors within a column filtered by label", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await filter(page, "feature");

  const before = order(await snapshot(page));

  await card(page, 198).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");

  await expect
    .poll(async () => (await snapshot(page)).columns[0].cards.map((card) => card.item_id))
    .toEqual(["PVTI_218", "PVTI_198", "PVTI_214", "PVTI_209", "PVTI_201", "PVTI_193"]);
  await page.keyboard.press("Meta+z");

  await expect.poll(async () => order(await snapshot(page))).toEqual(before);
});
