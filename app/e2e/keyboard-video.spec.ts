import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 1440, height: 900 },
  video: { mode: "on", size: { width: 1440, height: 900 } },
});

test.describe("keyboard review video", () => {
  test.skip(!process.env.VIDEO, "set VIDEO=1 to record the keyboard walkthrough");

  test("keyboard walkthrough in WebKit", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/?mock=board");
    await page.locator('[data-item-id="PVTI_226"]').click();

    // Hold each state long enough to make the review recording readable.
    const pause = () => page.waitForTimeout(2000);

    await pause();

    for (const key of ["j", "ArrowRight", "Shift+ArrowRight", "Meta+z", "s", "Escape", "Meta+k"]) {
      await page.keyboard.press(key);
      await pause();
    }

    await page.keyboard.type("mv done", { delay: 150 });
    await pause();
    await page.keyboard.press("Escape");
    await page.keyboard.press("c");
    await page.keyboard.type("Planche test draft", { delay: 80 });
    await pause();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Meta+,");
    await pause();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Meta+k");
    await page.keyboard.type("Show list", { delay: 150 });
    await page.keyboard.press("Enter");

    await expect(page.locator('[data-slot="issue-list-row"]').first()).toBeVisible();

    await page.waitForTimeout(5000);
  });
});
