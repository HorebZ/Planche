import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`Display persists and labels stay accessible in ${colorScheme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto("/?mock=labels");

    const card = page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]');
    const labels = card.getByRole("button", { name: /^Labels:/ });

    await expect(card.locator('[data-slot="label-chip"]')).toHaveCount(2);
    await expect(labels).toContainText("+3");

    await labels.focus();

    await expect(labels).toBeFocused();

    await page.keyboard.press("Meta+k");

    await expect(page.getByRole("combobox")).toBeVisible();

    await page.keyboard.press("Escape");
    await labels.focus();
    await page.keyboard.press("Enter");

    const details = page.getByRole("dialog", { name: "Issue labels" });

    await expect(details.getByRole("listitem")).toHaveCount(5);
    await expect(details).toContainText("A very long label name that needs truncation");
    await expect(page.locator('[data-drag-state="lifted"]')).toHaveCount(0);

    await page.screenshot({
      path: testInfo.outputPath(`labels-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");

    await expect(labels).toBeFocused();

    await page.getByRole("button", { name: "Display", exact: true }).focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("menuitemcheckbox")).toHaveCount(3);

    await page.getByRole("menuitemcheckbox", { name: "Labels", exact: true }).focus();
    await page.keyboard.press("Space");
    await page.getByRole("menuitemcheckbox", { name: "Repository", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: "Assignees", exact: true }).click();
    await page.keyboard.press("Escape");

    await expect(card.locator('[data-slot="label-chip"], [data-slot="avatar"]')).toHaveCount(0);
    await expect(card).toContainText("#226");
    await expect(card).not.toContainText("app#226");

    await card.focus();
    await page.keyboard.press("Space");

    const lifted = page.locator('[data-drag-state="lifted"]');

    await expect(lifted).toBeVisible();
    await expect(lifted.locator('[data-slot="label-chip"], [data-slot="avatar"]')).toHaveCount(0);

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "List", exact: true }).click();

    const row = page.locator('[data-slot="issue-list-row"][data-item-id="PVTI_226"]');

    await expect(row).toContainText("#226");
    await expect(
      page.locator('main [data-slot="label-chip"], main [data-slot="avatar"]'),
    ).toHaveCount(0);

    const sidebar = page.locator('[data-slot="sidebar"]');

    await sidebar.getByRole("button", { name: "API Gateway", exact: true }).click();

    await expect(page.getByRole("button", { name: /^Labels:/ }).first()).toBeVisible();

    await sidebar.getByRole("button", { name: /^Planche — v1\.2/ }).click();
    await page.reload();

    await expect(row).toBeVisible();
    await expect(page.getByRole("button", { name: /^Labels:/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Display", exact: true }).click();

    for (const property of ["Repository", "Labels", "Assignees"]) {
      await expect(
        page.getByRole("menuitemcheckbox", { name: property, exact: true }),
      ).toHaveAttribute("aria-checked", "false");
    }

    await page.screenshot({
      path: testInfo.outputPath(`display-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.getByRole("menuitemcheckbox", { name: "Labels", exact: true }).click();
    await page.keyboard.press("Escape");

    const listLabels = row.locator("..").getByRole("button", { name: /^Labels:/ });

    await listLabels.focus();
    await page.keyboard.press("Enter");

    await expect(details.getByRole("listitem")).toHaveCount(5);

    await page.keyboard.press("Escape");

    await expect(listLabels).toBeFocused();
  });
}
