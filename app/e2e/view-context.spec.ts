import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`layout and groups survive navigation, refresh and reload in ${colorScheme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto("/?mock=board");
    await page.getByRole("button", { name: "List", exact: true }).click();

    const todo = page.getByRole("button", { name: /Todo 3$/ });
    const sidebar = page.locator('[data-slot="sidebar"]');

    await todo.click();
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await page.getByRole("button", { name: "List", exact: true }).click();

    await expect(todo).toHaveAttribute("aria-expanded", "false");

    await sidebar.getByRole("button", { name: "API Gateway", exact: true }).click();

    await expect(page.getByRole("button", { name: "Board", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await sidebar.getByRole("button", { name: /^Planche — v1\.2/ }).click();

    await expect(todo).toHaveAttribute("aria-expanded", "false");

    await page.keyboard.press("Meta+r");

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls
              .refresh_project,
        ),
      )
      .toBe(1);
    await expect(todo).toHaveAttribute("aria-expanded", "false");

    await page.reload();

    await expect(todo).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "GitHub view: Board" })).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath(`context-${colorScheme}.png`) });
    await page.keyboard.press("Meta+k");
    await page.getByRole("combobox").fill("linked PRs");
    await page.keyboard.press("Enter");

    await expect(
      page.locator('[data-slot="issue-list-row"][data-item-id="PVTI_226"]'),
    ).toBeFocused();

    await page.reload();

    await expect(todo).toHaveAttribute("aria-expanded", "true");
  });
}

test("GitHub views keep separate layouts and collapsed groups", async ({ page }) => {
  await page.goto("/?mock=board");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: /Todo 3$/ }).click();
  await page.getByRole("button", { name: "GitHub view: Board" }).click();
  await page.getByRole("menuitemradio", { name: "Planning", exact: true }).click();

  await expect(page.getByRole("button", { name: "Board", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "GitHub view: Planning" })).toBeVisible();

  await page.getByRole("button", { name: "List", exact: true }).click();

  await expect(page.getByRole("button", { name: /Todo 3$/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await page.getByRole("button", { name: "GitHub view: Planning" }).click();
  await page.getByRole("menuitemradio", { name: "Board", exact: true }).click();

  await expect(page.getByRole("button", { name: /Todo 3$/ })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
