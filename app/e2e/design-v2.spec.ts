import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("the inset shell and neutral controls follow the v2 light and dark tokens", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await expect(page.locator('[data-slot="sidebar"]')).toHaveCSS("width", "220px");
  await expect(page.locator("main")).toHaveCSS("margin-top", "8px");
  await expect(page.locator("main")).toHaveCSS("border-radius", "10px");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("main")).toHaveCSS("background-color", "rgb(18, 18, 19)");
  await expect(page.locator('[data-slot="issue-card"]').first()).toHaveCSS(
    "background-color",
    "rgb(26, 26, 27)",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator('[data-slot="issue-card"]').first()).toHaveCSS(
    "transition-duration",
    "0s",
  );
});

test("the list groups the same live cards and collapses a group", async ({ page }) => {
  await page.goto("/?mock=board");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator('[data-slot="issue-list-row"]')).toHaveCount(17);
  await expect(page.locator('[data-slot="board"]')).toHaveCount(0);
  await page
    .locator('[data-slot="issue-list-group"]')
    .filter({ has: page.getByRole("button", { name: "Todo 3" }) })
    .getByRole("button", { name: "Todo 3" })
    .click();
  await expect(page.locator('[data-slot="issue-list-row"]')).toHaveCount(14);
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.locator('[data-slot="issue-card"]')).toHaveCount(17);
});

test("the command palette searches real cards and switches layouts from the keyboard", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await expect(page.locator('[data-slot="issue-card"]').first()).toBeVisible();
  await page.keyboard.press("Meta+k");
  const palette = page.getByRole("dialog");
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("linked PRs");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await expect(palette.getByRole("option")).toContainText("Show linked PRs in issue detail");
  await palette.getByRole("combobox").fill("Show list");
  await page.keyboard.press("Enter");
  await expect(palette).toHaveCount(0);
  await expect(page.locator('[data-slot="issue-list-row"]')).toHaveCount(17);
});

test("settings save sync preferences and persist the chosen theme", async ({ page }) => {
  await page.goto("/?mock=board");
  await expect(page.locator('[data-slot="issue-card"]').first()).toBeVisible();
  await page.keyboard.press("Meta+,");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: "15 min", exact: true }).click();
  await dialog.getByRole("switch", { name: "Sync when the Mac wakes up" }).click();
  await dialog.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("main")).toHaveCSS("background-color", "rgb(18, 18, 19)");
  await page.getByRole("button", { name: "Settings ⌘," }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("background-color", "rgb(36, 36, 37)");
  await page.keyboard.press("Escape");
});

test("a hidden project can be revealed, restored and persists per account", async ({ page }) => {
  await page.goto("/?mock=board");
  const sidebar = page.locator('[data-slot="sidebar"]');
  await sidebar.getByRole("button", { name: "More options for Design system" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: /Hide from sidebar/ }).click();
  await expect(sidebar.getByRole("button", { name: "Design system", exact: true })).toHaveCount(0);
  await page.reload();
  await sidebar.getByRole("button", { name: "1 hidden" }).click();
  await expect(sidebar.getByRole("button", { name: "Design system", exact: true })).toBeVisible();
  await sidebar.getByRole("button", { name: "Show Design system in sidebar" }).click();
  await expect(sidebar.getByRole("button", { name: "Collapse hidden" })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "Design system", exact: true })).toBeVisible();
});

test.describe("v2 visual checks", () => {
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture the v2 views");
  for (const colorScheme of ["light", "dark"] as const) {
    test(`list, palette and settings ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/?mock=board");
      await page.getByRole("button", { name: "List", exact: true }).click();
      await page.locator('[data-slot="issue-list-row"]').first().waitFor();
      await page.screenshot({
        path: `screenshots/v2-list-${colorScheme}.png`,
        animations: "disabled",
      });
      await page.keyboard.press("Meta+k");
      await page.getByRole("dialog").waitFor();
      await page.screenshot({
        path: `screenshots/v2-palette-${colorScheme}.png`,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Meta+,");
      await page.getByRole("dialog").waitFor();
      await page.screenshot({
        path: `screenshots/v2-settings-${colorScheme}.png`,
        animations: "disabled",
      });
    });
  }
});
