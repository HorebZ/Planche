import { expect, test } from "@playwright/test";

for (const layout of ["Board", "List"] as const) {
  test(`${layout} returns from detail to the same scroll, groups and focus`, async ({ page }) => {
    await page.goto("/?mock=big");
    await page.getByRole("button", { name: layout, exact: true }).click();

    if (layout === "List") {
      await page.getByRole("button", { name: /^Done.*200$/ }).click();
    }

    await page.keyboard.press("Meta+k");
    await page.getByRole("combobox").fill("Synthetic card 199");
    await page
      .getByRole("option")
      .filter({ hasText: /^Synthetic card 199 with/ })
      .click();

    const slot = layout === "Board" ? "issue-card" : "issue-list-row";
    const origin = page.locator(`[data-slot="${slot}"][data-item-id="PVTI_199"]`);
    const scrolls = () =>
      page
        .locator('[data-slot="column-scroll"], [data-slot="board"], [data-slot="issue-list"]')
        .evaluateAll((elements) =>
          elements.map((element) => [element.scrollTop, element.scrollLeft]),
        );

    await expect(origin).toBeFocused();
    const before = await scrolls();

    await origin.click();
    await expect(page.getByRole("article", { name: "Issue detail" })).toBeVisible();
    await page.keyboard.press("j");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Synthetic card 200 with a title long enough to wrap",
    );
    await page.keyboard.press("k");
    await page.keyboard.press("Escape");

    await expect(page.locator('[data-slot="issue-detail"]')).toHaveCount(0);
    await expect(origin).toBeFocused();
    await expect.poll(scrolls).toEqual(before);

    if (layout === "List") {
      await expect(page.getByRole("button", { name: /^Done.*200$/ })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }

    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Synthetic card 199 with a title long enough to wrap",
    );
  });
}

test("detail isolates Space, closes its submenu first and returns to a neighbor after a filtered move", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await page.getByRole("button", { name: "Filter issues" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Todo", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();
  await page.keyboard.press("Space");

  await expect(page.locator('[data-slot="drag-bubble"]')).toHaveCount(0);
  await page.keyboard.press("s");

  await expect(page.getByPlaceholder("Change status…")).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(page.locator('[data-slot="issue-detail"]')).toBeVisible();
  await page.keyboard.press("s");
  await page.keyboard.press("3");

  await expect(page.getByRole("button", { name: "Change project status" })).toHaveText(
    "In progress",
  );
  await page.keyboard.press("Escape");

  const neighbor = page.locator('[data-slot="issue-card"][data-item-id="PVTI_223"]');

  await expect(neighbor).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");

  await expect(page.locator('[data-slot="issue-detail"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="drag-bubble"]')).toHaveCount(0);
  await expect(neighbor).toHaveCount(0);
});

test("palette commands leave the detail for a focused draft editor or the requested layout", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  const origin = page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]');

  await origin.click();
  await page.keyboard.press("Meta+k");
  await page.getByRole("combobox").fill("New draft");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("textbox", { name: "Draft title" })).toBeFocused();
  await expect(page.locator('[data-slot="issue-detail"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(origin).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Meta+k");
  await page.getByRole("combobox").fill("Show list");
  await page.keyboard.press("Enter");

  await expect(page.locator('[data-slot="issue-detail"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="issue-list-row"]')).toHaveCount(17);
});
