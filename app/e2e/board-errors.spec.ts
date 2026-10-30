import { expect, type Page, test } from "@playwright/test";
import type { SyncStatus } from "../src/ipc/bindings";

test.use({ viewport: { width: 1100, height: 700 } });

async function setBoardError(page: Page, fail: boolean, invalidate = false) {
  await page.evaluate(
    async ({ fail, invalidate }) => {
      const backend = (
        window as unknown as {
          __planche: {
            setBoardError: (fail: boolean) => void;
            emit: (event: string, payload: unknown) => Promise<void>;
          };
        }
      ).__planche;
      backend.setBoardError(fail);
      if (invalidate) {
        await backend.emit("board-changed", { project_id: "PVT_planche" });
      }
    },
    { fail, invalidate },
  );
}

async function expectFailure(page: Page, message: string) {
  await expect(page.locator('[data-slot="sync-indicator"]')).toHaveText(message);
  await expect(page.locator('[data-slot="sidebar-footer"]')).toContainText(message);
  await expect(page.getByText("Up to date", { exact: true })).toHaveCount(0);
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`a rejected initial read offers retry without pretending the board is empty in ${colorScheme}`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/?mock=board-error");
    const error = page.locator('[data-slot="board-error"]');
    await expect(error).toContainText("Could not read the local cache");
    await expectFailure(page, "Could not read the local cache");
    await expect(page.locator('[data-slot="skeleton-column"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="empty-board-card"]')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("initial-error.png") });
    await setBoardError(page, false);
    await error.getByRole("button", { name: "Retry now" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-slot="issue-card"]')).toHaveCount(17);
    await expect(error).toHaveCount(0);
    await expect(page.locator('[data-slot="sync-indicator"]')).toHaveText("Up to date");
  });

  test(`a failed cache refresh keeps cards usable and recovers in ${colorScheme}`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/?mock=board");
    await expect(page.locator('[data-slot="issue-card"]')).toHaveCount(17);
    await setBoardError(page, true, true);
    const banner = page.getByRole("alert");
    await expect(banner).toContainText("Showing saved data");
    await expectFailure(page, "Could not read the local cache");
    const card = page.locator('[data-slot="issue-card"]').first();
    await card.focus();
    await expect(card).toBeFocused();
    await page.screenshot({ path: info.outputPath("cached-error.png") });
    await setBoardError(page, false);
    await banner.getByRole("button", { name: "Retry now" }).click();
    await expect(banner).toHaveCount(0);
    await expect(page.locator('[data-slot="issue-card"]')).toHaveCount(17);
  });

  for (const [scenario, message] of [
    ["rate-limited", "Rate limited by GitHub"],
    ["sync-error", "Token rejected by GitHub (401)"],
  ] as const) {
    test(`${scenario} keeps the cache and agrees across the shell in ${colorScheme}`, async ({
      page,
    }, info) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`/?mock=${scenario}`);
      await expectFailure(page, message);
      await expect(page.locator('[data-slot="issue-card"]')).toHaveCount(17);
      const banner = page.getByRole("alert");
      await expect(banner).toContainText(message);
      await expect(banner).toContainText("Showing saved data");
      await page.screenshot({ path: info.outputPath(`${scenario}.png`) });
      await banner.getByRole("button", { name: "Retry now" }).click();
      await expect(banner).toHaveCount(0);
      await expect(page.locator('[data-slot="sync-indicator"]')).toHaveText("Up to date");
      await expect(page.locator('[data-slot="sidebar-footer"]')).toContainText("Synced just now");
    });
  }
}

test("a failed first sync leaves loading, retries, and receives the first board", async ({
  page,
}) => {
  await page.goto("/?mock=uncached-sync-error");
  const error = page.locator('[data-slot="board-error"]');
  await expect(error).toContainText("Token rejected by GitHub (401)");
  await expect(page.locator('[data-slot="skeleton-column"]')).toHaveCount(0);
  await error.getByRole("button", { name: "Retry now" }).click();
  await expect(error).toHaveCount(0);
  await expect(page.locator('[data-slot="issue-card"]')).toHaveCount(17);
});

test("without a cache, offline and quota failures also leave loading", async ({ page }) => {
  await page.goto("/?mock=loading");
  await expect(page.locator('[data-slot="skeleton-column"]')).toHaveCount(5);
  for (const state of [
    { type: "offline" },
    { type: "rate_limited" },
  ] satisfies SyncStatus["state"][]) {
    await page.evaluate(
      (state) =>
        (
          window as unknown as {
            __planche: {
              emit: (event: string, payload: unknown) => Promise<void>;
            };
          }
        ).__planche.emit("sync-status", { state, pending: 0, last_sync_at: null, retry_at: null }),
      state,
    );
    await expect(page.locator('[data-slot="board-error"]')).toBeVisible();
    await expect(page.locator('[data-slot="skeleton-column"]')).toHaveCount(0);
    await expectFailure(page, state.type === "offline" ? "Offline" : "Rate limited by GitHub");
  }
});

test("an unavailable project lets the user return to the project picker", async ({ page }) => {
  await page.goto("/?mock=board-error");
  await page.getByRole("button", { name: "Choose another project" }).click();
  await expect(page.getByRole("heading", { name: "Pick a project" })).toBeVisible();
  await setBoardError(page, false);
  await page.getByRole("button", { name: /^Planche — v1.2/ }).click();
  await page.getByRole("button", { name: /Open board/ }).click();
  await expect(page.locator('[data-slot="issue-card"]')).toHaveCount(17);
});

test("a rejected manual refresh cannot leave Up to date and can be retried", async ({ page }) => {
  await page.goto("/?mock=refresh-error");
  await expect(page.locator('[data-slot="issue-card"]')).toHaveCount(17);
  await page.keyboard.press("Meta+r");
  await expectFailure(page, "Could not start synchronization");
  const banner = page.locator('[data-slot="banner"]');
  await expect(banner).toContainText("Showing saved data");
  await banner.getByRole("button", { name: "Retry now" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.locator('[data-slot="sync-indicator"]')).toHaveText("Up to date");
});

test("a successful automatic sync clears a previous manual refresh error", async ({ page }) => {
  await page.goto("/?mock=refresh-error");
  await expect(page.locator('[data-slot="issue-card"]')).toHaveCount(17);
  await page.keyboard.press("Meta+r");
  await expectFailure(page, "Could not start synchronization");
  await page.evaluate(() =>
    (
      window as unknown as {
        __planche: {
          emit: (event: string, payload: unknown) => Promise<void>;
        };
      }
    ).__planche.emit("sync-status", {
      state: { type: "idle" },
      pending: 0,
      retry_at: null,
      last_sync_at: Date.now(),
    }),
  );
  await expect(page.locator('[data-slot="banner"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="sync-indicator"]')).toHaveText("Up to date");
});
