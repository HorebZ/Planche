import { expect, test } from "@playwright/test";

test("label details open from the keyboard without dragging and restore focus", async ({
  page,
}) => {
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

  await page.keyboard.press("Escape");

  await expect(labels).toBeFocused();
});
