import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`update states render in ${theme}`, async ({ page }) => {
    await page.goto("/playground#updates");
    const states = page.locator(`#updates [data-theme-scope="${theme}"]`);

    await expect(states.getByText("Your update is ready to install.")).toHaveCount(2);
    await expect(states.getByRole("button", { name: "Install and restart" }).last()).toBeDisabled();
    await expect(states.locator('[data-slot="update-indicator"]')).toHaveCount(8);
    await expect(states.locator('[data-slot="update-badge"]')).toHaveCount(4);
    const checking = states.getByRole("button", { name: "Checking for updates…", exact: true });

    await expect(checking).toBeDisabled();
    await expect(checking.locator("svg")).toHaveCSS("animation-name", "pl-spin");
    await page.emulateMedia({ reducedMotion: "reduce" });

    await expect(checking.locator("svg")).toHaveCSS("animation-duration", "0s");
    await states.screenshot({ path: `screenshots/updates-${theme}.png`, animations: "disabled" });
  });
}
