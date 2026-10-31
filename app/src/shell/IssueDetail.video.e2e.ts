import { expect, test } from "@playwright/test";

test.skip(!process.env.VIDEO, "set VIDEO=1 to record the detail walkthrough");
test.use({
  viewport: { width: 1440, height: 900 },
  video: { mode: "on", size: { width: 1440, height: 900 } },
});

test("detail walkthrough in WebKit", async ({ page }) => {
  await page.goto("/?mock=board");
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();

  // Hold each state so the recording can be reviewed without pausing.
  const pause = () => page.waitForTimeout(1500);

  await pause();

  for (const key of ["j", "k", "s", "Escape"]) {
    await page.keyboard.press(key);
    await pause();
  }

  await page.getByRole("button", { name: "Change assignees" }).click();
  await pause();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.locator('[data-slot="issue-list-row"][data-item-id="PVTI_226"]').click();
  await pause();
  await page.keyboard.press("s");
  await page.keyboard.press("3");
  await pause();
  await page.keyboard.press("Escape");

  await expect(page.locator('[data-slot="issue-detail"]')).toHaveCount(0);
  await pause();
});
