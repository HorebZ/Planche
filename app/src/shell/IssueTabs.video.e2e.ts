import { expect, test } from "@playwright/test";

test.skip(!process.env.VIDEO, "set VIDEO=1 to record retained issue tabs");
test.use({
  viewport: { width: 1440, height: 900 },
  video: { mode: "on", size: { width: 1440, height: 900 } },
});

test("retained issue tabs walkthrough in WebKit", async ({ page }) => {
  await page.goto("/?mock=markdown");
  await page.getByRole("button", { name: "Display", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "List", exact: true }).click();
  const pause = () => page.waitForTimeout(1500);

  for (const id of [226, 223]) {
    await page.locator(`[data-slot="issue-list-row"][data-item-id="PVTI_${id}"]`).click();
    await pause();
    await page.keyboard.press("Meta+Enter");
    await pause();
    await page.keyboard.press("Escape");
    await pause();
  }

  await page.getByRole("tab", { name: /^#226 / }).click();
  await pause();
  await page.keyboard.press("Meta+Shift+ArrowRight");
  await pause();
  await page.getByRole("button", { name: "Change project status" }).click();
  await pause();
  await page.keyboard.press("Escape");
  await pause();
  await page.setViewportSize({ width: 1100, height: 700 });
  await pause();
  await page.keyboard.press("Meta+w");
  await pause();
  await page.keyboard.press("Meta+w");

  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Project view" })).toBeVisible();
  await pause();
});
