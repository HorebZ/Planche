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

  // While lifted: ghost at the origin, placeholder and +1 count in the target, and help bar.
  await expect(card(page, 226).first()).toHaveAttribute("data-drag-state", "ghost");
  await expect(column(page, "Done").locator('[data-slot="card-placeholder"]')).toHaveCount(1);
  await expect(column(page, "Done").locator('[data-slot="board-column-count"]')).toHaveText("4");
  await expect(column(page, "Done")).toHaveAttribute("data-drop-target", "true");
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

  await expect(column(page, "In progress").locator('[data-slot="card-placeholder"]')).toHaveCount(
    1,
  );

  await page.keyboard.press("Enter");

  await expect.poll(() => numbers(column(page, "In progress"))).toEqual([231, 226, 232, 228]);
});

test("a drop animates into the optimistic column before the local receipt", async ({ page }) => {
  await open(page, "board");
  await page.evaluate(() => {
    const state = window as unknown as {
      __TAURI_INTERNALS__: { invoke: (command: string, ...args: unknown[]) => Promise<unknown> };
      __dropColumns: (string | null)[];
      __releaseMove: () => void;
    };
    const invoke = state.__TAURI_INTERNALS__.invoke;
    const animate = Element.prototype.animate;

    state.__dropColumns = [];
    state.__TAURI_INTERNALS__.invoke = async (command, ...args) => {
      if (command === "dispatch_intent") {
        await new Promise<void>((resolve) => {
          state.__releaseMove = resolve;
        });
      }

      return invoke(command, ...args);
    };
    Element.prototype.animate = function (...args) {
      if (this.getAttribute("data-item-id") === "PVTI_226") {
        state.__dropColumns.push(
          this.closest("[data-column-index]")?.getAttribute("data-column-index") ?? null,
        );
      }

      return animate.apply(this, args);
    };
  });

  await lift(page, card(page, 226), card(page, 220));
  await page.mouse.up();

  await expect(column(page, "Done").locator('[data-item-id="PVTI_226"]')).toBeVisible();
  await expect(card(page, 226).getByText("Pending")).toBeVisible();

  const animationColumns = await page.evaluate(
    () => (window as unknown as { __dropColumns: string[] }).__dropColumns,
  );

  expect(animationColumns).toEqual(["4"]);

  await page.evaluate(() => (window as unknown as { __releaseMove: () => void }).__releaseMove());
  await expect(card(page, 226).getByText("Pending")).toHaveCount(0);
});

test("a rejected local move clears the drop preview and keeps the original order", async ({
  page,
}) => {
  await open(page, "board");
  await page.evaluate(() => {
    const backend = (
      window as unknown as {
        __TAURI_INTERNALS__: { invoke: (command: string, ...args: unknown[]) => Promise<unknown> };
      }
    ).__TAURI_INTERNALS__;
    const invoke = backend.invoke;

    backend.invoke = async (command, ...args) =>
      command === "dispatch_intent"
        ? { type: "rejected", error: { kind: "Invalid", message: "Move rejected" } }
        : invoke(command, ...args);
  });

  await lift(page, card(page, 226), card(page, 220));
  await page.mouse.up();

  await expect(page.getByText(/Could not apply:.*Move rejected/)).toBeVisible();
  await expect(page.locator('[data-slot="drop-preview"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="drag-help-bar"]')).toHaveCount(0);
  await expect.poll(() => numbers(column(page, "Todo"))).toEqual([226, 223, 219]);
  await expect.poll(() => numbers(column(page, "Done"))).toEqual([220, 215, 211]);
});

test("leaving the board clears the drop target and does not move the card", async ({ page }) => {
  await open(page, "board");
  await lift(page, card(page, 226), card(page, 220));

  await expect(column(page, "Done")).toHaveAttribute("data-drop-target", "true");
  await page.mouse.move(100, 500, { steps: 12 });

  await expect(page.locator('[data-slot="card-placeholder"]')).toHaveCount(0);
  await expect(page.locator("[data-drop-target]")).toHaveCount(0);
  await expect(page.locator('[data-drag-state="lifted"]')).toBeVisible();

  await card(page, 226).hover();

  await expect(column(page, "Todo").locator('[data-slot="card-placeholder"]')).toHaveCount(1);

  await page.mouse.move(100, 500, { steps: 12 });

  await expect(page.locator('[data-slot="card-placeholder"]')).toHaveCount(0);

  await page.mouse.up();

  await expect(page.locator('[data-slot="drag-help-bar"]')).toHaveCount(0);
  await expect.poll(() => numbers(column(page, "Todo"))).toEqual([226, 223, 219]);
  await expect.poll(() => numbers(column(page, "Done"))).toEqual([220, 215, 211]);
});

test("scrolling back up does not jump when the selected card mounts again", async ({ page }) => {
  await page.goto("/?mock=big");

  const first = card(page, 0);
  const scroll = column(page, "Backlog").locator('[data-slot="column-scroll"]');

  await first.focus();
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  await expect(first).toHaveCount(0);

  const jumps = await scroll.evaluate(async (element) => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const jumps: number[] = [];

    element.scrollTop = 1500;
    await frame();
    await frame();

    for (let step = 0; step < 26; step++) {
      const target = Math.max(0, element.scrollTop - 60);

      element.scrollTop = target;
      await frame();
      await frame();
      jumps.push(element.scrollTop - target);
    }

    return jumps;
  });

  expect(Math.min(...jumps)).toBeGreaterThanOrEqual(-1);
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
  await expect(column(page, "Done")).toHaveAttribute("data-drop-target", "true");

  await page.mouse.up();

  await expect.poll(() => numbers(column(page, "Done"))).toContain(219);
});
