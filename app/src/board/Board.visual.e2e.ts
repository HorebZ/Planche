import { expect, type Page, test } from "@playwright/test";

import type { Scenario } from "@/ipc/_fixtures/scenarios.fixtures";

test.use({ viewport: { width: 1440, height: 900 } });

async function open(page: Page, scenario: Scenario) {
  const errors: string[] = [];

  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/?mock=${scenario}`);

  return errors;
}

const column = (page: Page, name: string) =>
  page.locator('[data-slot="board-column"]').filter({ has: page.getByText(name, { exact: true }) });

for (const colorScheme of ["light", "dark"] as const) {
  test(`the first card shadow stays below the column header in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await open(page, "board");

    const todo = column(page, "Todo");
    const card = todo.locator('[data-slot="issue-card"]').first();

    await expect(card).toBeVisible();

    const spacing = await todo.evaluate((el) => {
      const header = el.querySelector("header")?.getBoundingClientRect();
      const scroll = el.querySelector('[data-slot="column-scroll"]')?.getBoundingClientRect();
      const card = el.querySelector('[data-slot="issue-card"]')?.getBoundingClientRect();
      const secondCard = el
        .querySelectorAll('[data-slot="issue-card"]')[1]
        ?.getBoundingClientRect();

      if (!header || !scroll || !card || !secondCard) {
        throw new Error("Missing column content");
      }

      return {
        paintInset: card.top - scroll.top,
        headerGap: card.top - header.bottom,
        cardGap: secondCard.top - card.bottom,
      };
    });

    expect(spacing.paintInset).toBeGreaterThanOrEqual(2);
    expect(spacing.headerGap).toBe(8);
    expect(spacing.cardGap).toBe(8);

    await card.focus();
    await todo.screenshot({ path: test.info().outputPath(`column-header-${colorScheme}.png`) });
  });
}

test("cards show PRs, both dependency directions and sub-issue progress without overflowing", async ({
  page,
}) => {
  const errors = await open(page, "relations");
  const card = page.locator('[data-item-id="PVTI_226"]');

  await expect(
    card.getByRole("img", { name: "Pull request #62222: Add linked pull requests (merged)" }),
  ).toBeVisible();
  await expect(card.getByRole("img", { name: "Blocked by 2 issues" })).toHaveText("Blocked by 2");
  await expect(card.getByRole("img", { name: "Blocking 1 issue" })).toHaveText("Blocks 1");
  await expect(card.getByRole("img", { name: "2 of 5 sub-issues completed" })).toHaveText("2/5");
  await expect(card.getByText("Created Oct 2")).toBeVisible();
  await expect(page.getByRole("img", { name: "3 linked pull requests" })).toHaveText("3 PRs");
  await expect(page.getByRole("img", { name: "0 of 2 sub-issues completed" })).toHaveText("0/2");

  const header = card.locator(":scope > div").first();

  expect(await header.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(card.locator('[data-slot="avatar"]')).toHaveText("CR");

  const columns = page.locator('[data-slot="board-column"]');
  const widths = await columns.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().width),
  );

  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
  expect(widths[0]).toBe(300);

  await page.setViewportSize({ width: 1920, height: 1000 });

  const board = page.locator('[data-slot="board"]');

  await expect.poll(() => board.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  expect(
    await columns.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width)),
  ).toEqual(widths);

  await page.screenshot({ path: test.info().outputPath("relations.png"), animations: "disabled" });
  await page.setViewportSize({ width: 980, height: 800 });

  await expect.poll(() => board.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(
    await columns.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width)),
  ).toEqual(widths);
  expect(await header.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test.describe("screenshots", () => {
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture the window states");

  for (const colorScheme of ["light", "dark"] as const) {
    for (const scenario of [
      "board",
      "loading",
      "syncing",
      "empty",
      "offline",
      "valid",
      "locked",
    ] as const) {
      test(`${scenario} ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await open(page, scenario);

        if (scenario === "locked") {
          await page.getByRole("dialog", { name: "Open Planche" }).waitFor();
        } else if (scenario === "valid") {
          await page.setViewportSize({ width: 780, height: 540 });
          await page
            .getByLabel("Personal access token")
            .fill("ghp_7Hq2xxxxxxxxxxxxxxxxxxxxxxxx8f2c");
          await page.keyboard.press("Enter");
          await page.getByText("Valid").waitFor();
        } else {
          await page
            .locator('[data-slot="board-column"], [data-slot="skeleton-column"]')
            .first()
            .waitFor();
        }

        await page.screenshot({
          path: `screenshots/window-${scenario}-${colorScheme}.png`,
          animations: "disabled",
        });
      });
    }
  }
});
