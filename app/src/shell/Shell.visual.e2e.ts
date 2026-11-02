import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("the inset shell and neutral controls follow the v2 light and dark tokens", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/?mock=board");

  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(239, 239, 240)");
  await expect(page.locator("main")).toHaveCSS("background-color", "rgb(249, 249, 250)");
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

for (const theme of ["light", "dark"] as const) {
  test(`error toasts stack at bottom right without shifting the board in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/?mock=refresh-error");

    const view = page.getByRole("region", { name: "Project view" });
    await expect(page.locator('[data-slot="issue-card"]').first()).toBeVisible();
    const before = await view.boundingBox();

    await page.keyboard.press("Meta+r");

    const error = page.getByRole("alert");
    await expect(error).toContainText("Could not start synchronization");
    expect(await view.boundingBox()).toEqual(before);
    await expect(page.locator('[data-slot="banner"]')).toHaveCount(0);
    await expect(page.locator("[data-sonner-toaster]")).toHaveAttribute("data-x-position", "right");
    await expect(page.locator("[data-sonner-toaster]")).toHaveAttribute(
      "data-y-position",
      "bottom",
    );

    await page.locator('[data-slot="issue-card"][data-item-id="PVTI_223"]').focus();
    await page.keyboard.press("Shift+ArrowRight");

    const notifications = page.locator("[data-sonner-toast]");
    await expect(notifications).toHaveCount(2);
    expect(
      await notifications.evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().width),
      ),
    ).toEqual([440, 440]);
    await expect(error).toHaveCSS("border-top-style", "solid");
    await expect(error).toHaveCSS("border-top-width", "1px");
    const colors = await error.evaluate((node) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--pl-danger)";
      probe.style.backgroundColor = "var(--pl-danger-surface)";
      node.append(probe);
      const actual = getComputedStyle(node);
      const expected = getComputedStyle(probe);
      const result = {
        border: actual.borderTopColor,
        background: actual.backgroundColor,
        expectedBorder: expected.color,
        expectedBackground: expected.backgroundColor,
      };
      probe.remove();

      return result;
    });

    expect(colors.border).toBe(colors.expectedBorder);
    expect(colors.background).toBe(colors.expectedBackground);
    await expect
      .poll(() =>
        notifications.evaluateAll((nodes) => {
          const [first, second] = nodes.map((node) => node.getBoundingClientRect());

          return first.bottom <= second.top || second.bottom <= first.top;
        }),
      )
      .toBe(true);
    const bounds = await error.boundingBox();
    const viewport = page.viewportSize();

    expect(bounds).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (bounds && viewport) {
      expect(bounds.x).toBeGreaterThan(viewport.width / 2);
      expect(bounds.y).toBeGreaterThan(viewport.height / 2);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    }

    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await notifications.evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().width),
      ),
    ).toEqual([328, 328]);
    await error.getByRole("button", { name: "Dismiss notification" }).click();

    await expect(error).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(error).toHaveCount(0);
  });
}
