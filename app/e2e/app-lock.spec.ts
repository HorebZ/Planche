import { expect, test } from "@playwright/test";

test("the app is visible and locked during the single startup authentication", async ({ page }) => {
  await page.goto("/?mock=locked");
  const lock = page.getByRole("dialog", { name: "Unlock Planche" });
  await expect(lock).toBeVisible();
  await expect(lock.getByRole("button", { name: "Unlocking…" })).toBeDisabled();
  await expect(page.locator('[data-slot="skeleton-column"]')).toHaveCount(5);
  await expect(page.locator('[data-slot="issue-card"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(lock).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls
            .auth_status,
      ),
    )
    .toBe(1);
  const calls = await page.evaluate(
    () => (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls,
  );
  expect(calls.auth_status).toBe(1);
  expect(calls.open_project).toBeUndefined();
  expect(calls.list_projects).toBeUndefined();
  await page.clock.install();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.clock.fastForward(5 * 60 * 1000);
  const waiting = await page.evaluate(
    () => (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls,
  );
  expect(waiting.auth_status).toBe(1);
  expect(waiting.open_project).toBeUndefined();
  expect(waiting.refresh_project).toBeUndefined();
  expect(waiting.list_projects).toBeUndefined();
  await page.evaluate(() =>
    (window as unknown as { __planche: { unlock: () => void } }).__planche.unlock(),
  );
  await page.clock.resume();
  await expect(lock).toHaveCount(0);
  await expect(page.locator('[data-slot="issue-card"]')).not.toHaveCount(0);
});

test("cancelling stays locked until the user retries", async ({ page }) => {
  await page.goto("/?mock=unlock-cancelled");
  const lock = page.getByRole("dialog", { name: "Unlock Planche" });
  await expect(lock.getByRole("alert")).toContainText("Authentication cancelled");
  await page.keyboard.press("Escape");
  await expect(lock).toBeVisible();
  await expect(page.locator('[data-slot="onboarding"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="issue-card"]')).toHaveCount(0);
  await page.clock.install();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.clock.fastForward(5 * 60 * 1000);
  const cancelled = await page.evaluate(
    () => (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls,
  );
  expect(cancelled.auth_status).toBe(1);
  expect(cancelled.open_project).toBeUndefined();
  expect(cancelled.refresh_project).toBeUndefined();
  await page.clock.resume();
  await lock.getByRole("button", { name: "Unlock Planche" }).click();
  await expect(lock).toHaveCount(0);
  await expect(page.locator('[data-slot="issue-card"]')).not.toHaveCount(0);
  const calls = await page.evaluate(
    () => (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls,
  );
  expect(calls.auth_status).toBe(2);
});
