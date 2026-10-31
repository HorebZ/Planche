import { expect, test } from "@playwright/test";

test("search reveals a result in a collapsed List group and releases focus afterwards", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await page.getByRole("button", { name: "List", exact: true }).click();

  const group = page
    .locator('[data-slot="issue-list-group"]')
    .filter({ has: page.getByText("Todo", { exact: true }) });

  await group.locator('[data-slot="issue-list-toggle"]').click();
  await page.keyboard.press("Meta+k");

  const dialog = page.getByRole("dialog");

  await expect(dialog.getByText("Loaded project:", { exact: false })).toContainText("Planche");

  await dialog.getByRole("combobox").fill("linked PRs");
  await page.keyboard.press("Enter");

  const row = page.locator('[data-slot="issue-list-row"][data-item-id="PVTI_226"]');

  await expect(row).toBeFocused();
  await expect(row).toBeInViewport();
  await expect(group.locator('[data-slot="issue-list-toggle"]')).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await group.locator('[data-slot="issue-list-toggle"]').click();

  await expect(row).toHaveCount(0);

  await page.keyboard.press("Meta+k");
  await dialog.getByRole("combobox").fill("linked PRs");
  await page.keyboard.press("Enter");

  await expect(row).toBeFocused();
});

for (const layout of ["Board", "List"] as const) {
  test(`search scrolls to an offscreen result in ${layout}`, async ({ page }) => {
    await page.goto("/?mock=big");

    await expect(page.locator('[data-slot="issue-card"]').first()).toBeVisible();

    await page.getByRole("button", { name: layout, exact: true }).click();

    const slot = layout === "Board" ? "issue-card" : "issue-list-row";
    const card = page.locator(`[data-slot="${slot}"][data-item-id="PVTI_199"]`);

    await expect(card).not.toBeInViewport();

    await page.keyboard.press("Meta+k");
    await page.getByRole("combobox").fill("Synthetic card 199");
    await page
      .getByRole("option")
      .filter({ hasText: /^Synthetic card 199 with/ })
      .click();

    await expect(card).toBeFocused();
    await expect(card).toBeInViewport();
  });
}
