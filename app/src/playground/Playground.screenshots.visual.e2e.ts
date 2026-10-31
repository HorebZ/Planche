import { test } from "@playwright/test";

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture playground sections");

test("capture each playground section", async ({ page }) => {
  await page.goto("/playground");
  await page.getByRole("heading", { name: "Planche playground" }).waitFor();

  for (const section of await page.locator("[data-section]").all()) {
    const id = await section.getAttribute("data-section");

    await section.screenshot({ path: `screenshots/${id}.png`, animations: "disabled" });
  }
});
