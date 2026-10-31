import { expect, type Locator, type Page, test } from "@playwright/test";

import type { Scenario } from "@/ipc/_fixtures/scenarios.fixtures";

test.use({ viewport: { width: 1920, height: 900 } });

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

async function open(page: Page, scenario: Scenario) {
  await page.goto(`/?mock=${scenario}`);

  await expect(card(page, 226)).toBeVisible();
}

async function lift(page: Page, from: Locator, to: Locator, below = true) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();

  if (!a || !b) {
    throw new Error("no box");
  }

  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 10, { steps: 3 });

  await expect(page.locator('[data-slot="drag-help-bar"]')).toBeVisible();

  await page.mouse.move(b.x + b.width / 2, b.y + b.height * (below ? 0.8 : 0.2), { steps: 12 });
}

test("a card dragged under the first card of Done lands second, and the scene matches the mockup", async ({
  page,
}) => {
  await open(page, "board");
  await lift(page, card(page, 226), card(page, 220));

  // While lifted: ghost at the origin, placeholder and +1 count in the target, bubble and help bar.
  await expect(card(page, 226).first()).toHaveAttribute("data-drag-state", "ghost");
  await expect(column(page, "Done").locator('[data-slot="card-placeholder"]')).toHaveCount(1);
  await expect(column(page, "Done").locator('[data-slot="board-column-count"]')).toHaveText("4");
  await expect(column(page, "Done")).toHaveAttribute("data-drop-target", "true");
  await expect(page.locator('[data-slot="drag-bubble"]')).toHaveText("Move to Done · position 2");
  await expect(page.locator('[data-slot="drag-help-bar"]')).toBeVisible();

  await page.mouse.up();

  await expect.poll(() => numbers(column(page, "Done"))).toEqual([220, 226, 215, 211]);
  await expect.poll(() => numbers(column(page, "Todo"))).toEqual([223, 219]);
  await expect(page.locator('[data-slot="drag-help-bar"]')).toHaveCount(0);
  // "Pending" shows where the card was dropped, until the move is acknowledged.
  await expect(card(page, 226).getByText("Pending")).toBeVisible();
  await expect(card(page, 226).getByText("Pending")).toHaveCount(0);
});

test("the keyboard lifts, moves across and down, and drops", async ({ page }) => {
  await open(page, "board");
  await card(page, 226).focus();
  await page.keyboard.press("Space");

  await expect(page.locator('[data-slot="drag-help-bar"]')).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");

  await expect(page.locator('[data-slot="drag-bubble"]')).toHaveText(
    "Move to In progress · position 2",
  );

  await page.keyboard.press("Enter");

  await expect.poll(() => numbers(column(page, "In progress"))).toEqual([231, 226, 232, 228]);
});

test("a sorted view moves cards between columns but not within one", async ({ page }) => {
  await open(page, "sorted");
  await lift(page, card(page, 219), card(page, 226), false);
  await page.mouse.up();

  await expect.poll(() => numbers(column(page, "Todo"))).toEqual([226, 223, 219]);
  // Wait for the actual return animation before measuring the next pointer target.
  await expect(page.locator('[data-slot="drag-help-bar"]')).toHaveCount(0);
  await expect
    .poll(() =>
      card(page, 219).evaluate(
        (element) =>
          element.getAnimations().filter((animation) => animation.playState === "running").length,
      ),
    )
    .toBe(0);

  await lift(page, card(page, 219), card(page, 220));

  await expect(page.locator('[data-slot="drag-help-bar"]')).toBeVisible();
  await expect(page.locator('[data-slot="drag-bubble"]')).toContainText("Done");

  await page.mouse.up();

  await expect.poll(() => numbers(column(page, "Done"))).toContain(219);
});
