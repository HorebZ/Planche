import { expect, type Page, test } from "@playwright/test";

type Theme = "light" | "dark";

const scope = (page: Page, section: string, theme: Theme) => page.locator(`#${section} [data-theme-scope="${theme}"]`);

test.beforeEach(async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
	await page.goto("/playground");
	await expect(page.getByRole("heading", { name: "Planche playground" })).toBeVisible();
	expect(errors).toEqual([]);
});

test("each theme scope resolves its own token values", async ({ page }) => {
	await expect(scope(page, "buttons", "light")).toHaveCSS("background-color", "rgb(252, 251, 249)");
	await expect(scope(page, "buttons", "dark")).toHaveCSS("background-color", "rgb(26, 25, 23)");
	await expect(scope(page, "buttons", "light")).toHaveCSS("color", "rgb(28, 26, 23)");
	await expect(scope(page, "buttons", "dark")).toHaveCSS("color", "rgb(238, 235, 229)");
});

test("shadows switch with the theme scope", async ({ page }) => {
	const secondary = (theme: Theme) => scope(page, "buttons", theme).getByRole("button", { name: "Secondary" }).first();
	await expect(secondary("light")).toHaveCSS("box-shadow", /rgba\(28, 25, 20, 0\.07\)/);
	await expect(secondary("dark")).toHaveCSS("box-shadow", /rgba\(255, 248, 235, 0\.07\)/);
});

test("data-preview forces hover and focus styles", async ({ page }) => {
	const ghost = scope(page, "buttons", "light").getByRole("button", { name: "Filter" });
	await expect(ghost.nth(0)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(ghost.nth(1)).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(ghost.nth(2)).not.toHaveCSS("box-shadow", "none");
});
