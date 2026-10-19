import { expect, type Locator, type Page, test } from "@playwright/test";
import type { Scenario } from "./mockBackend";

test.use({ viewport: { width: 1440, height: 900 } });

const card = (page: Page, number: number) => page.locator(`[data-slot="issue-card"][data-item-id="PVTI_${number}"]`);
const column = (page: Page, name: string) =>
	page.locator('[data-slot="board-column"]').filter({ has: page.getByText(name, { exact: true }) });
const numbers = (col: Locator) =>
	col
		.locator('[data-slot="issue-card"]')
		.evaluateAll((cards) => cards.map((c) => Number(c.getAttribute("data-item-id")?.replace("PVTI_", ""))));

async function open(page: Page, scenario: Scenario) {
	await page.goto(`/?mock=${scenario}`);
	await expect(card(page, 226)).toBeVisible();
}

/** Presses on `from`, then moves in steps to the lower part of `to`, and returns the drop. */
async function lift(page: Page, from: Locator, to: Locator, below = true) {
	const a = await from.boundingBox();
	const b = await to.boundingBox();
	if (!a || !b) throw new Error("no box");
	await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
	await page.mouse.down();
	await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 10, { steps: 3 });
	await page.mouse.move(b.x + b.width / 2, b.y + b.height * (below ? 0.8 : 0.2), { steps: 12 });
}

test("a card dragged under the first card of Done lands second, and the scene matches the mockup", async ({ page }) => {
	await open(page, "board");
	await lift(page, card(page, 226), card(page, 220));
	// While lifted: ghost at the origin, placeholder and +1 count in the target, bubble and help bar.
	await expect(card(page, 226).first()).toHaveAttribute("data-drag-state", "ghost");
	await expect(column(page, "Done").locator('[data-slot="card-placeholder"]')).toHaveCount(1);
	await expect(column(page, "Done").locator('[data-slot="board-column-count"]')).toHaveText("4");
	await expect(column(page, "Done")).toHaveAttribute("data-drop-target", "true");
	await expect(page.locator('[data-slot="drag-bubble"]')).toHaveText("Move to Done · position 2");
	await expect(page.locator('[data-slot="drag-help-bar"]')).toBeVisible();
	await page.mouse.up();

	await expect.poll(() => numbers(column(page, "Done"))).toEqual([220, 226, 215, 211]);
	await expect.poll(() => numbers(column(page, "Todo"))).toEqual([223, 219]);
	await expect(page.locator('[data-slot="drag-help-bar"]')).toHaveCount(0);
	// "Pending" shows where the card was dropped, until the move is acknowledged.
	await expect(card(page, 226).getByText("Pending")).toBeVisible();
	await expect(card(page, 226).getByText("Pending")).toHaveCount(0);
});

test("the keyboard lifts, moves across and down, and drops", async ({ page }) => {
	await open(page, "board");
	await card(page, 226).focus();
	await page.keyboard.press("Space");
	await expect(page.locator('[data-slot="drag-help-bar"]')).toBeVisible();
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("ArrowDown");
	await expect(page.locator('[data-slot="drag-bubble"]')).toHaveText("Move to In progress · position 2");
	await page.keyboard.press("Enter");
	await expect.poll(() => numbers(column(page, "In progress"))).toEqual([231, 226, 232, 228]);
});

test("Escape puts the card back where it was", async ({ page }) => {
	await open(page, "board");
	await card(page, 226).focus();
	await page.keyboard.press("Space");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Escape");
	await expect(page.locator('[data-slot="drag-help-bar"]')).toHaveCount(0);
	await expect.poll(() => numbers(column(page, "Todo"))).toEqual([226, 223, 219]);
});

test("a failed move comes back and says so", async ({ page }) => {
	await open(page, "rollback");
	await lift(page, card(page, 226), card(page, 220));
	await page.mouse.up();
	// The refusal comes at once, so the card may never be seen in Done; the toast and the
	// card back in its slot are what the user sees.
	await expect(page.getByText(`Couldn't move "Show linked PRs in issue detail". Reverted.`)).toBeVisible();
	await expect.poll(() => numbers(column(page, "Todo"))).toEqual([226, 223, 219]);
});

test("offline, the banner counts down and the moved card says Pending", async ({ page }) => {
	await open(page, "offline");
	await expect(page.locator('[data-slot="banner"]')).toContainText("Can't reach api.github.com");
	await expect(page.locator('[data-slot="banner"]')).toContainText(/Retrying in \d+s/);
	await expect(page.locator('[data-slot="sidebar-footer"]')).toContainText("Offline · 1 change pending");
	await lift(page, card(page, 226), card(page, 220));
	await page.mouse.up();
	await expect(card(page, 226).getByText("Pending")).toBeVisible();
});

test("a sorted view moves cards between columns but not within one", async ({ page }) => {
	await open(page, "sorted");
	await lift(page, card(page, 219), card(page, 226), false);
	await page.mouse.up();
	await expect.poll(() => numbers(column(page, "Todo"))).toEqual([226, 223, 219]);
	// Wait for the actual return animation before measuring the next pointer target.
	await expect(page.locator('[data-slot="drag-help-bar"]')).toHaveCount(0);
	await expect
		.poll(() =>
			card(page, 219).evaluate(
				(element) => element.getAnimations().filter((animation) => animation.playState === "running").length,
			),
		)
		.toBe(0);
	await lift(page, card(page, 219), card(page, 220));
	await expect(page.locator('[data-slot="drag-help-bar"]')).toBeVisible();
	await expect(page.locator('[data-slot="drag-bubble"]')).toContainText("Done");
	await page.mouse.up();
	await expect.poll(() => numbers(column(page, "Done"))).toContain(219);
});

test("a sync during a drag waits for the drop", async ({ page }) => {
	await open(page, "board");
	const calls = () =>
		page.evaluate(
			() => (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls.get_board,
		);
	const emit = () =>
		page.evaluate(() =>
			(window as unknown as { __planche: { emit: (e: string, p: unknown) => Promise<void> } }).__planche.emit(
				"board-changed",
				{ project_id: "PVT_planche" },
			),
		);
	await lift(page, card(page, 223), card(page, 231));
	const before = await calls();
	await emit();
	await page.waitForTimeout(300);
	expect(await calls()).toBe(before);
	await expect(page.locator('[data-slot="drag-help-bar"]')).toBeVisible();
	await page.mouse.up();
	await expect.poll(calls).toBeGreaterThan(before);
});

test.describe("screenshots", () => {
	test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture the drag states");
	for (const colorScheme of ["light", "dark"] as const) {
		test(`drag ${colorScheme}`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await open(page, "board");
			await lift(page, card(page, 214), card(page, 231));
			await page.waitForTimeout(250);
			await page.screenshot({ path: `screenshots/window-drag-${colorScheme}.png` });
			await page.mouse.up();
		});
		test(`offline ${colorScheme}`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await open(page, "offline");
			await page.screenshot({ path: `screenshots/window-error-${colorScheme}.png`, animations: "disabled" });
		});
		test(`rollback ${colorScheme}`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await open(page, "rollback");
			await lift(page, card(page, 226), card(page, 220));
			await page.mouse.up();
			await page.getByText("Reverted.").waitFor();
			await page.waitForTimeout(400);
			await page.screenshot({ path: `screenshots/window-rollback-${colorScheme}.png`, animations: "disabled" });
		});
	}
});
