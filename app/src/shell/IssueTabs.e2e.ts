import { expect, test } from "@playwright/test";
import type { Board } from "@/ipc/bindings.types";

test("two retained issues, reopening without duplicates and closing the active tab", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await page.getByRole("button", { name: "List", exact: true }).click();
  const detail = page.getByRole("article", { name: "Issue detail" });
  const origin = page.locator('[data-slot="issue-list-row"][data-item-id="PVTI_226"]');

  await origin.click();
  await detail.getByRole("button", { name: "Open in tab" }).click();

  await expect(page.getByRole("tab", { selected: true })).toHaveText(/^#226 /);
  await page.keyboard.press("Escape");
  await expect(origin).toBeFocused();
  await page.locator('[data-slot="issue-list-row"][data-item-id="PVTI_223"]').click();
  await page.keyboard.press("Meta+Enter");

  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.getByRole("tab", { selected: true })).toHaveText(/^#223 /);
  await page.keyboard.press("Escape");
  await origin.click();

  await expect(page.getByRole("tab", { selected: true })).toHaveText(/^#226 /);
  await expect(page.getByRole("tab")).toHaveCount(3);
  await page.keyboard.press("Meta+w");

  await expect(page.getByRole("tab", { selected: true })).toHaveText(/^#223 /);
  await expect(detail.getByRole("heading", { level: 1 })).toHaveText(
    "Column counter ignores filtered cards",
  );
  await page.getByRole("button", { name: /^Close tab: #223 / }).click();

  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(detail).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Project view" })).toBeVisible();
});

for (const layout of ["Board", "List"] as const) {
  test(`${layout} preserves source filters, scroll and focus while a tab is retained`, async ({
    page,
  }) => {
    await page.goto("/?mock=big");
    await page.getByRole("button", { name: layout, exact: true }).click();
    await page.getByRole("button", { name: "Filter issues" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Todo", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Meta+k");
    await page.getByRole("combobox").fill("Synthetic card 399");
    await page
      .getByRole("option")
      .filter({ hasText: /^Synthetic card 399 with/ })
      .click();

    const slot = layout === "Board" ? "issue-card" : "issue-list-row";
    const origin = page.locator(`[data-slot="${slot}"][data-item-id="PVTI_1199"]`);
    const scrolls = () =>
      page
        .locator('[data-slot="column-scroll"], [data-slot="board"], [data-slot="issue-list"]')
        .evaluateAll((elements) =>
          elements.map((element) => [element.scrollTop, element.scrollLeft]),
        );

    await expect(origin).toBeFocused();
    const before = await scrolls();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Meta+Enter");

    await expect(page.getByRole("tab")).toHaveCount(2);
    await page.keyboard.press("Escape");

    await expect(origin).toBeFocused();
    await expect(page.getByRole("button", { name: "Remove status filter: Todo" })).toBeVisible();
    await expect.poll(scrolls).toEqual(before);
    await page.getByRole("tab", { name: /^#1199 / }).click();
    await page.keyboard.press("Meta+w");

    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(origin).toBeFocused();
    await expect.poll(scrolls).toEqual(before);
  });
}

test("a narrow tab bar scrolls, supports arrow navigation and closes from the keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto("/?mock=board");
  await page.getByRole("button", { name: "List", exact: true }).click();

  for (const id of [218, 214, 209, 201, 198]) {
    await page.locator(`[data-slot="issue-list-row"][data-item-id="PVTI_${id}"]`).click();
    await page.keyboard.press("Meta+Enter");
    await page.keyboard.press("Escape");
  }

  await expect(page.getByRole("tab")).toHaveCount(6);
  await page.keyboard.press("Meta+Shift+ArrowLeft");

  const active = page.getByRole("tab", { selected: true });
  await expect(active).toHaveText(/^#198 /);
  await expect(active).toBeInViewport();
  await expect(page.getByRole("button", { name: /^Close tab: #198 / })).toBeInViewport();
  await active.focus();
  await page.keyboard.press("ArrowLeft");

  await expect(page.getByRole("tab", { selected: true })).toHaveText(/^#201 /);
  await expect(page.getByRole("tab", { selected: true })).toBeFocused();
  await page.keyboard.press("Backspace");

  await expect(page.getByRole("tab")).toHaveCount(5);
  await expect(page.getByRole("tab", { selected: true })).toHaveText(/^#209 /);
  await page.getByRole("tab", { name: /^#218 / }).click();
  await page.keyboard.press("ArrowLeft");

  await expect(page.getByRole("tab", { selected: true })).toHaveText("Planche — v1.2");
  await expect(page.getByRole("tab", { selected: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");

  await expect(page.getByRole("tab", { selected: true })).toHaveText(/^#218 /);
});

test("reopening from another Project keeps the original context, status and mutation target", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.evaluate(() => {
    const backend = (
      window as unknown as {
        __planche: { getBoard: () => Board; setBoard: (board: Board) => void };
      }
    ).__planche;
    const other = structuredClone(backend.getBoard());
    other.project = { ...other.project, id: "PVT_api", title: "API Gateway" };
    for (const column of other.columns) {
      for (const card of column.cards) {
        card.item_id = `api-${card.item_id}`;
      }
    }
    const shared = other.columns[1].cards.shift();
    if (shared) {
      other.columns[2].cards.push(shared);
    }
    backend.setBoard(other);
  });
  await page.locator('[data-slot="issue-list-row"][data-item-id="PVTI_226"]').click();
  await page.keyboard.press("Meta+Enter");
  await page.getByRole("button", { name: "API Gateway", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.locator('[data-slot="issue-list-row"][data-item-id="api-PVTI_226"]').click();

  const detail = page.getByRole("article", { name: "Issue detail" });

  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(detail).toContainText(
    "Actions apply to Planche — v1.2. Current source: API Gateway.",
  );
  await expect(detail.getByRole("button", { name: "Change project status" })).toHaveText("Todo");
  await page.keyboard.press("s");
  await page.keyboard.press("3");

  await expect(detail.getByRole("button", { name: "Change project status" })).toHaveText(
    "In progress",
  );
  await page.keyboard.press("Escape");

  await expect(page.getByRole("region", { name: "Project view" })).toBeVisible();
  await expect(
    page
      .locator('[data-slot="issue-list-group"]')
      .filter({ has: page.locator('[data-item-id="api-PVTI_226"]') }),
  ).toContainText("In progress");
});
