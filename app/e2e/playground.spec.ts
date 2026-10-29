import { expect, type Page, test } from "@playwright/test";

type Theme = "light" | "dark";

for (const theme of ["light", "dark"] as const) {
	test(`stacked notifications stay readable without hovering in ${theme}`, async ({ page }) => {
		const panel = scope(page, "overlays", theme);
		await panel.getByRole("button", { name: "Show toast", exact: true }).click();
		await panel.getByRole("button", { name: "Show toast", exact: true }).click();
		await page.mouse.move(0, 0);
		const notifications = panel.locator("[data-sonner-toast]");
		await expect(notifications).toHaveCount(2);
		await expect
			.poll(() =>
				notifications.evaluateAll((nodes) => {
					if (nodes.length !== 2) return false;
					const [a, b] = nodes.map((node) => node.getBoundingClientRect());
					return a.bottom <= b.top || b.bottom <= a.top;
				}),
			)
			.toBe(true);
	});
}

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
	await expect(scope(page, "buttons", "dark")).toHaveCSS("background-color", "rgb(25, 24, 23)");
	await expect(scope(page, "buttons", "light")).toHaveCSS("color", "rgb(28, 26, 23)");
	await expect(scope(page, "buttons", "dark")).toHaveCSS("color", "rgb(238, 235, 229)");
});

test("shadows switch with the theme scope", async ({ page }) => {
	const secondary = (theme: Theme) => scope(page, "buttons", theme).getByRole("button", { name: "Secondary" }).first();
	await expect(secondary("light")).toHaveCSS("box-shadow", /rgba\(28, 25, 20, 0\.06\)/);
	await expect(secondary("dark")).toHaveCSS("box-shadow", /rgba\(255, 248, 235, 0\.06\)/);
});

test("portalled overlays take the theme of their panel", async ({ page }) => {
	const menu = (theme: Theme) => scope(page, "overlays", theme).locator('[data-slot="dropdown-menu-content"]').first();
	await expect(menu("light")).toHaveCSS("background-color", "rgb(255, 255, 255)");
	await expect(menu("dark")).toHaveCSS("background-color", "rgb(36, 35, 33)");
	const tooltip = scope(page, "overlays", "dark").locator('[data-slot="tooltip-content"]').first();
	await expect(tooltip).toHaveCSS("background-color", "rgb(238, 235, 229)");
});

test("a live dialog opened from the dark panel is dark", async ({ page }) => {
	const dark = scope(page, "overlays", "dark");
	await dark.getByRole("button", { name: "Open dialog" }).click();
	const dialog = dark.locator('[data-slot="dialog-content"]').filter({ visible: true });
	await expect(dialog).toHaveCount(1);
	await expect(dialog).toHaveCSS("background-color", "rgb(36, 35, 33)");
	await page.keyboard.press("Escape");
	await expect(dialog).toHaveCount(0);
});

test("cards resolve the card token per theme", async ({ page }) => {
	const card = (theme: Theme) => scope(page, "board", theme).locator('[data-slot="issue-card"]').first();
	await expect(card("light")).toHaveCSS("background-color", "rgb(255, 255, 255)");
	await expect(card("dark")).toHaveCSS("background-color", "rgb(33, 32, 30)");
});

test("a drop target column counts the hovering card, the origin keeps its own", async ({ page }) => {
	const board = scope(page, "board", "light");
	const targets = board.locator('[data-slot="board-column"][data-drop-target]');
	await expect(targets).toHaveCount(2);
	for (const target of await targets.all()) {
		await expect(target.locator('[data-slot="board-column-count"]')).toHaveText("4");
		await expect(target.locator('[data-slot="board-column-count"]')).toHaveCSS("color", "rgb(113, 108, 99)");
	}
	const origin = board.locator('[data-slot="board-column"]:has([data-slot="issue-card"][data-drag-state="ghost"])');
	await expect(origin.locator('[data-slot="board-column-count"]')).toHaveText("6");
});

test("data-preview forces hover and focus styles", async ({ page }) => {
	const ghost = scope(page, "buttons", "light").getByRole("button", { name: "Filter" });
	await expect(ghost.nth(0)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(ghost.nth(1)).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(ghost.nth(2)).not.toHaveCSS("box-shadow", "none");
});
