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

test("portalled overlays take the theme of their panel", async ({ page }) => {
	const menu = (theme: Theme) => scope(page, "overlays", theme).locator('[data-slot="dropdown-menu-content"]').first();
	await expect(menu("light")).toHaveCSS("background-color", "rgb(255, 255, 255)");
	await expect(menu("dark")).toHaveCSS("background-color", "rgb(42, 41, 37)");
	const tooltip = scope(page, "overlays", "dark").locator('[data-slot="tooltip-content"]').first();
	await expect(tooltip).toHaveCSS("background-color", "rgb(238, 235, 229)");
});

test("a live dialog opened from the dark panel is dark", async ({ page }) => {
	const dark = scope(page, "overlays", "dark");
	await dark.getByRole("button", { name: "Open dialog" }).click();
	const dialog = dark.locator('[data-slot="dialog-content"]').filter({ visible: true });
	await expect(dialog).toHaveCount(1);
	await expect(dialog).toHaveCSS("background-color", "rgb(42, 41, 37)");
	await page.keyboard.press("Escape");
	await expect(dialog).toHaveCount(0);
});

test("cards resolve the surface token per theme", async ({ page }) => {
	const card = (theme: Theme) => scope(page, "board", theme).locator('[data-slot="issue-card"]').first();
	await expect(card("light")).toHaveCSS("background-color", "rgb(255, 255, 255)");
	await expect(card("dark")).toHaveCSS("background-color", "rgb(37, 36, 32)");
});

test("data-preview forces hover and focus styles", async ({ page }) => {
	const ghost = scope(page, "buttons", "light").getByRole("button", { name: "Filter" });
	await expect(ghost.nth(0)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(ghost.nth(1)).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(ghost.nth(2)).not.toHaveCSS("box-shadow", "none");
});
