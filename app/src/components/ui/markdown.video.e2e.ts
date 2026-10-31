import { expect, test } from "@playwright/test";

test.skip(!process.env.VIDEO, "set VIDEO=1 to record Markdown navigation");
test.use({
  viewport: { width: 1440, height: 900 },
  video: { mode: "on", size: { width: 1440, height: 900 } },
});

test("Markdown description walkthrough", async ({ page }) => {
  await page.goto("/?mock=markdown");
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();

  const markdown = page.locator('[data-slot="markdown"]');
  const link = markdown.getByRole("link", { name: "project", exact: true });

  // Keep the rendered states visible long enough to review the recording.
  const pause = () => page.waitForTimeout(1500);

  await expect(markdown.getByRole("heading", { name: "Release notes" })).toBeVisible();
  await pause();
  await markdown
    .getByText("Image not loaded: Board screenshot", { exact: true })
    .scrollIntoViewIfNeeded();
  await pause();
  await link.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");

  await expect(link).toBeFocused();
  await pause();
  await page.keyboard.press("Enter");
  await pause();
  await page.keyboard.press("Escape");

  await expect(page.locator('[data-slot="issue-detail"]')).toHaveCount(0);
  await pause();
});
