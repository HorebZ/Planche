import { expect, test } from "@playwright/test";

for (const theme of ["Light", "Dark", "System"] as const) {
  test(`high contrast renders and persists with the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/?mock=board");
    await page.getByRole("button", { name: "Settings ⌘," }).click();
    await page.getByRole("button", { name: theme, exact: true }).click();
    await page.getByRole("switch", { name: "High contrast", exact: true }).click();

    const root = page.locator("html");
    const foreground = theme === "Light" ? "rgb(14, 17, 22)" : "rgb(255, 255, 255)";

    await expect(root).toHaveAttribute("data-contrast", "high");
    await expect(root).toHaveCSS("color", foreground);
    await expect(page.getByRole("dialog")).toHaveCSS("color", foreground);
    await page.reload();
    await page.getByRole("button", { name: "Settings ⌘," }).click();

    await expect(page.getByRole("switch", { name: "High contrast", exact: true })).toBeChecked();
    await expect(page.getByRole("button", { name: theme, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(root).toHaveCSS("color", foreground);

    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });

      const light = theme === "Light" || (theme === "System" && colorScheme === "light");
      const cardOutline = light
        ? /rgb\(110, 119, 129\) 0px 0px 0px 1px/
        : /rgb\(122, 130, 142\) 0px 0px 0px 1px/;
      const dialogOutline = light
        ? /rgb\(63, 71, 80\) 0px 0px 0px 1px/
        : /rgb\(180, 189, 199\) 0px 0px 0px 1px/;

      await expect(root).toHaveCSS("color", light ? "rgb(14, 17, 22)" : "rgb(255, 255, 255)");
      await expect(page.locator('[data-slot="issue-card"]').first()).toHaveCSS(
        "box-shadow",
        cardOutline,
      );
      await expect(page.getByRole("dialog")).toHaveCSS("box-shadow", dialogOutline);

      const panel = page.locator('[role="tabpanel"][data-state="active"]').locator("..");

      await expect(panel).toHaveCSS("border-width", "1px");
      await expect(panel).toHaveCSS("border-style", "solid");
      await expect(panel).toHaveCSS(
        "border-color",
        light ? "rgb(110, 119, 129)" : "rgb(122, 130, 142)",
      );
      await expect(panel).toHaveCSS("border-radius", "10px");
      await expect(panel).toHaveCSS("box-shadow", "none");
    }

    if (process.env.SCREENSHOTS && theme !== "System") {
      await page.screenshot({
        path: `screenshots/high-contrast-settings-${theme.toLowerCase()}.png`,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page.screenshot({
        path: `screenshots/high-contrast-board-${theme.toLowerCase()}.png`,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Settings ⌘," }).click();
    }

    await page.getByRole("switch", { name: "High contrast", exact: true }).click();

    await expect(root).not.toHaveAttribute("data-contrast");
    await expect(root).toHaveCSS(
      "color",
      theme === "Light" ? "rgb(36, 36, 37)" : "rgb(237, 237, 238)",
    );
  });
}
