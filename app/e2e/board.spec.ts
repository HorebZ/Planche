import { expect, type Page, test } from "@playwright/test";
import type { Scenario } from "./mockBackend";

test.use({ viewport: { width: 1440, height: 900 } });

async function open(page: Page, scenario: Scenario) {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto(`/?mock=${scenario}`);
	return errors;
}

const column = (page: Page, name: string) =>
	page.locator('[data-slot="board-column"]').filter({ has: page.getByText(name, { exact: true }) });

test("the board shows each column of the mock backend with its cards", async ({ page }) => {
	const errors = await open(page, "board");
	const expected = { Backlog: 6, Todo: 3, "In progress": 3, "In review": 2, Done: 3 };
	await expect(page.locator('[data-slot="board-column"]')).toHaveCount(5);
	for (const [name, count] of Object.entries(expected)) {
		await expect(column(page, name).locator('[data-slot="board-column-count"]')).toHaveText(String(count));
		await expect(column(page, name).locator('[data-slot="issue-card"]')).toHaveCount(count);
	}
	await expect(page.getByRole("button", { name: /Planche — v1.2/ }).first()).toBeVisible();
	await expect(page.locator('[data-slot="sync-indicator"]')).toHaveText("Up to date");
	await expect(page.locator('[data-slot="sidebar-footer"]')).toContainText("Synced 2 min ago");
	expect(errors).toEqual([]);
});

test("5a: before the first sync, skeletons and the loading progress", async ({ page }) => {
	await open(page, "loading");
	await expect(page.locator('[data-slot="skeleton-column"]')).toHaveCount(5);
	await expect(page.locator('[data-slot="sync-indicator"]')).toHaveText("Loading 142 items…");
	await expect(page.getByRole("progressbar")).toBeVisible();
	await expect(page.locator('[data-slot="issue-card"]')).toHaveCount(0);
});

test("5b: a background sync shows its pages and marks the changed cards", async ({ page }) => {
	await open(page, "syncing");
	await expect(page.locator('[data-slot="sync-indicator"]')).toHaveText("Syncing 3 of 5…");
	await expect(page.getByRole("progressbar")).toBeVisible();
	await expect(page.locator('[data-slot="sidebar-footer"]')).toContainText("Syncing…");
	await expect(page.locator('[data-slot="issue-card"] > .bg-accent')).toHaveCount(2);
	// The board stays usable while it syncs.
	await page.locator('[data-slot="issue-card"]').first().focus();
	await expect(page.locator('[data-slot="issue-card"]').first()).toBeFocused();
});

test("5d: an empty board offers its columns as drop zones and the empty card", async ({ page }) => {
	await open(page, "empty");
	await expect(page.getByText("This board is empty")).toBeVisible();
	await expect(page.getByText("Drop cards here")).toHaveCount(5);
	await expect(page.locator('[data-slot="empty-board-card"]').getByRole("button", { name: /New draft/ })).toBeEnabled();
});

test("offline: the toolbar, the footer and the pending card say so", async ({ page }) => {
	await open(page, "offline");
	await expect(page.locator('[data-slot="sync-indicator"]')).toHaveText("Offline");
	await expect(page.locator('[data-slot="sidebar-footer"]')).toContainText("Offline · 1 change pending");
	await expect(column(page, "In progress").getByText("Pending")).toHaveCount(1);
});

test("a board-changed event refetches the board", async ({ page }) => {
	await open(page, "board");
	await expect(page.locator('[data-slot="issue-card"]')).toHaveCount(17);
	const calls = () =>
		page.evaluate(
			() => (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls.get_board,
		);
	const before = await calls();
	await page.evaluate(() =>
		(window as unknown as { __planche: { emit: (e: string, p: unknown) => Promise<void> } }).__planche.emit(
			"board-changed",
			{ project_id: "PVT_planche" },
		),
	);
	await expect.poll(calls).toBeGreaterThan(before);
});

test("6: the onboarding asks for a token with the right scopes", async ({ page }) => {
	await open(page, "onboarding");
	await expect(page.getByText("Step 1 of 2")).toBeVisible();
	await expect(page.getByLabel("Personal access token")).toBeFocused();
	await expect(page.getByRole("button", { name: /Create a token/ })).toBeVisible();
	await expect(page.locator('[data-slot="scope-row"]')).toHaveText([/repo/, /read:org/, /project/]);
	await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();
});

test("6a: while the token is checked, Continue waits", async ({ page }) => {
	await open(page, "checking");
	await page.getByLabel("Personal access token").fill("ghp_example");
	await page.keyboard.press("Enter");
	await expect(page.getByText("Checking…")).toBeVisible();
	await expect(page.locator('[data-slot="scope-row"][data-state="checking"]')).toHaveCount(3);
	await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();
});

test("6b: a valid token shows the account, then the project step opens the board", async ({ page }) => {
	await open(page, "valid");
	await page.getByLabel("Personal access token").fill("ghp_example");
	await page.keyboard.press("Enter");
	await expect(page.getByText("Valid")).toBeVisible();
	await expect(page.locator('[data-slot="account-block"]')).toContainText("Signed in as camille-r · 5 projects found");
	await expect(page.locator('[data-slot="scope-row"][data-state="ok"]')).toHaveCount(3);
	await expect(page.getByRole("button", { name: /Continue/ })).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page.getByText("Step 2 of 2")).toBeVisible();
	await page.getByRole("button", { name: "Planche — v1.2" }).click();
	await page.getByRole("button", { name: /Open board/ }).click();
	await expect(page.locator('[data-slot="board-column"]')).toHaveCount(5);
});

test("a refused token shows the error under the field", async ({ page }) => {
	await open(page, "invalid");
	await page.getByLabel("Personal access token").fill("ghp_wrong");
	await page.keyboard.press("Enter");
	await expect(page.locator('[data-slot="field-message"]')).toHaveText("token rejected by GitHub (401)");
	await expect(page.locator('[data-slot="input"][data-invalid]')).toBeVisible();
});

test.describe("screenshots", () => {
	test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture the window states");
	for (const colorScheme of ["light", "dark"] as const) {
		for (const scenario of ["board", "loading", "syncing", "empty", "offline", "valid"] as const) {
			test(`${scenario} ${colorScheme}`, async ({ page }) => {
				await page.emulateMedia({ colorScheme });
				await open(page, scenario);
				if (scenario === "valid") {
					await page.setViewportSize({ width: 780, height: 540 });
					await page.getByLabel("Personal access token").fill("ghp_7Hq2xxxxxxxxxxxxxxxxxxxxxxxx8f2c");
					await page.keyboard.press("Enter");
					await page.getByText("Valid").waitFor();
				} else {
					await page.locator('[data-slot="board-column"], [data-slot="skeleton-column"]').first().waitFor();
				}
				await page.screenshot({ path: `screenshots/window-${scenario}-${colorScheme}.png`, animations: "disabled" });
			});
		}
	}
});
