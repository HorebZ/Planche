import { expect, type Locator, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

const card = (page: Page, number: number) => page.locator(`[data-slot="issue-card"][data-item-id="PVTI_${number}"]`);
const column = (page: Page, name: string) =>
	page.locator('[data-slot="board-column"]').filter({ has: page.getByText(name, { exact: true }) });
const numbers = (col: Locator) =>
	col
		.locator('[data-slot="issue-card"]')
		.evaluateAll((cards) => cards.map((c) => Number(c.getAttribute("data-item-id")?.replace("PVTI_", ""))));
const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("data-item-id") ?? null);
const toast = (page: Page) => page.locator('[data-slot="toast"]');

async function open(page: Page) {
	await page.goto("/?mock=board");
	await expect(card(page, 226)).toBeVisible();
}

/** Selects a card the way a user does: a click, then the keyboard from there. */
async function selectCard(page: Page, number: number) {
	await card(page, number).click();
	await expect.poll(() => focused(page)).toBe(`PVTI_${number}`);
}

test("J moves the focus ring to the second card, and the arrows keep the nearest index", async ({ page }) => {
	await open(page);
	await selectCard(page, 218);
	await page.keyboard.press("j");
	await expect.poll(() => focused(page)).toBe("PVTI_214");
	await expect(card(page, 214)).toHaveCSS("box-shadow", /2px/);
	expect(await card(page, 214).evaluate((el) => el.matches(":focus-visible"))).toBe(true);
	await page.keyboard.press("ArrowRight");
	await expect.poll(() => focused(page)).toBe("PVTI_223");
	await page.keyboard.press("k");
	await expect.poll(() => focused(page)).toBe("PVTI_226");
	await page.keyboard.press("k");
	await expect.poll(() => focused(page)).toBe("PVTI_226");
	await page.keyboard.press("Escape");
	await expect.poll(() => focused(page)).toBeNull();
});

test("⇧→ moves the card a column, ⌘Z puts it back where it was, and the toast says so", async ({ page }) => {
	await open(page);
	await selectCard(page, 223);
	await page.keyboard.press("Shift+ArrowRight");
	await expect.poll(() => numbers(column(page, "In progress"))).toContain(223);
	await expect(toast(page).filter({ hasText: "#223 moved to In progress" })).toBeVisible();
	await expect(toast(page).getByRole("button", { name: /Undo/ })).toBeVisible();
	await page.keyboard.press("Meta+z");
	await expect.poll(() => numbers(column(page, "Todo"))).toEqual([226, 223, 219]);
	await expect(toast(page).filter({ hasText: "Undone: #223 moved to In progress" })).toBeVisible();
	expect(await focused(page)).toBe("PVTI_223");
	// One level: a second ⌘Z changes nothing.
	await page.keyboard.press("Meta+z");
	await expect.poll(() => numbers(column(page, "Todo"))).toEqual([226, 223, 219]);
});

test("S opens the Status menu under the card, and a digit picks the option of its rank", async ({ page }) => {
	await open(page);
	await selectCard(page, 223);
	await page.keyboard.press("Shift+ArrowRight");
	await page.keyboard.press("Meta+z");
	await expect.poll(() => numbers(column(page, "Todo"))).toEqual([226, 223, 219]);
	await page.keyboard.press("s");
	const menu = page.locator('[data-slot="popover-content"]');
	await expect(menu.getByPlaceholder("Move to…")).toBeFocused();
	await expect(menu.locator("[cmdk-item]")).toHaveText(["Backlog1", "Todo2", "In progress3", "In review4", "Done5"]);
	await expect(menu.getByLabel("Current")).toHaveCount(1);
	expect(await menu.locator("[cmdk-root]").evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(216);
	await page.keyboard.press("5");
	await expect(menu).toHaveCount(0);
	await expect.poll(() => numbers(column(page, "Done"))).toContain(223);
	expect(await focused(page)).toBe("PVTI_223");
	await page.keyboard.press("s");
	await page.keyboard.press("2");
	await expect.poll(() => numbers(column(page, "Todo"))).toEqual([226, 223, 219]);
});

test("⌘K, mv done, runs Move to Done first, and Esc gives the focus back to the card", async ({ page }) => {
	await open(page);
	await selectCard(page, 226);
	await page.keyboard.press("Meta+k");
	const palette = page.getByRole("dialog");
	await expect(palette.locator('[data-slot="command-context"]')).toHaveText("#226");
	await page.keyboard.type("mv done");
	await expect(palette.locator("[cmdk-item]").first()).toContainText("Move to Done");
	await expect(palette.locator('[cmdk-item][data-selected="true"]')).toContainText("Move to Done");
	await page.keyboard.press("Escape");
	await expect(palette).toHaveCount(0);
	expect(await focused(page)).toBe("PVTI_226");

	await page.keyboard.press("Meta+k");
	await page.keyboard.type("mv done");
	await page.keyboard.press("Enter");
	await expect.poll(() => numbers(column(page, "Done"))).toContain(226);
	await expect.poll(() => focused(page)).toBe("PVTI_226");
});

test("⌫ clears the card from the palette, and a search selects another card", async ({ page }) => {
	await open(page);
	await selectCard(page, 226);
	await page.keyboard.press("Meta+k");
	const palette = page.getByRole("dialog");
	await page.keyboard.press("Backspace");
	await expect(palette.locator('[data-slot="command-context"]')).toHaveCount(0);
	await expect(palette.getByText(/^Actions on/)).toHaveCount(0);
	await page.keyboard.type("websocket");
	await expect(palette.getByText("Issues & pull requests")).toBeVisible();
	await page.keyboard.press("Enter");
	await expect.poll(() => focused(page)).toBe("PVTI_227");
});

test("Assign in the palette adds a user, and I toggles the viewer", async ({ page }) => {
	await open(page);
	await selectCard(page, 219);
	await page.keyboard.press("Meta+k");
	await page.keyboard.type("assign");
	await page.keyboard.press("Enter");
	const picker = page.locator('[data-slot="popover-content"]');
	await expect(picker.getByPlaceholder("Assign…")).toBeFocused();
	await expect(picker.getByLabel("Assigned")).toHaveCount(1);
	await page.keyboard.type("the");
	await page.keyboard.press("Enter");
	await expect(picker).toHaveCount(0);
	const avatars = card(page, 219).locator('[data-slot="avatar"]');
	await expect(avatars).toHaveText(["AM", "TM"]);
	await expect(toast(page).filter({ hasText: "Assigned theo-m to #219" })).toBeVisible();
	await expect.poll(() => focused(page)).toBe("PVTI_219");

	await page.keyboard.press("i");
	await expect(avatars).toHaveText(["AM", "TM", "CR"]);
	await page.keyboard.press("i");
	await expect(avatars).toHaveText(["AM", "TM"]);
	await page.keyboard.press("Meta+z");
	await expect(avatars).toHaveText(["AM", "TM", "CR"]);
});

test("C opens a draft field in the selected column, which keeps letters to itself", async ({ page }) => {
	await open(page);
	await selectCard(page, 231);
	await page.keyboard.press("c");
	const field = column(page, "In progress").getByLabel("Draft title");
	await expect(field).toBeFocused();
	await page.keyboard.type("jkhl");
	await expect(field).toHaveValue("jkhl");
	await page.keyboard.press("Escape");
	await expect(field).toHaveCount(0);
	expect(await focused(page)).toBe("PVTI_231");

	await page.keyboard.press("c");
	await page.keyboard.type("Planche test draft");
	await page.keyboard.press("Enter");
	const first = column(page, "In progress").locator('[data-slot="issue-card"]').first();
	await expect(first).toContainText("Planche test draft");
	await expect(toast(page).filter({ hasText: 'Draft "Planche test draft" created' })).toBeVisible();
	await expect(toast(page).getByRole("button", { name: /Undo/ })).toHaveCount(0);
});

test("Archive in the palette removes the card, and Undo brings it back in place", async ({ page }) => {
	await open(page);
	await selectCard(page, 223);
	await page.keyboard.press("Meta+k");
	await page.keyboard.type("archive");
	await page.keyboard.press("Enter");
	await expect.poll(() => numbers(column(page, "Todo"))).toEqual([226, 219]);
	await toast(page).getByRole("button", { name: /Undo/ }).click();
	await expect.poll(() => numbers(column(page, "Todo"))).toEqual([226, 223, 219]);
});

test("? opens every shortcut of the table", async ({ page }) => {
	await open(page);
	await page.keyboard.press("?");
	const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
	await expect(sheet).toBeVisible();
	await expect(sheet.getByText("Move to the next column")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(sheet).toHaveCount(0);
});
