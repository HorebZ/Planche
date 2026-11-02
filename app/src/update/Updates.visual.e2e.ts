import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`update states render in ${theme}`, async ({ page }) => {
    await page.goto("/playground#updates");
    const states = page.locator(`#updates [data-theme-scope="${theme}"]`);

    await expect(states.getByText("Your update is ready to install.")).toHaveCount(2);
    await expect(states.getByRole("button", { name: "Install and restart" }).last()).toBeDisabled();
    await states.screenshot({ path: `screenshots/updates-${theme}.png`, animations: "disabled" });
  });
}
