import { expect, test } from "@playwright/test";

for (const scenario of ["board", "empty"] as const) {
	for (const activation of ["click", "Enter", "Space"] as const) {
		test(`${scenario}: column add opens and creates a draft in Todo via ${activation}`, async ({ page }) => {
			await page.goto(`/?mock=${scenario}`);
			if (scenario === "board") {
				await page.locator('[data-item-id="PVTI_231"]').click();
			} else {
				await expect(page.getByText("This board is empty")).toBeVisible();
			}
			const todo = page.locator('[data-slot="board-column"]').filter({ has: page.getByText("Todo", { exact: true }) });
			const add = todo.getByRole("button").first();
			if (activation === "click") await add.click();
			else {
				await add.focus();
				await page.keyboard.press(activation);
			}
			const field = todo.getByLabel("Draft title");
			await expect(field).toBeFocused();
			await expect(todo.getByRole("button", { name: "Add draft to Todo", exact: true })).toBeVisible();
			await expect(
				page.locator('[data-slot="board-column"]').getByRole("button", { name: "More", exact: true }),
			).toHaveCount(0);
			await field.fill("Column draft");
			await page.keyboard.press("Enter");
			await expect(todo.locator('[data-slot="issue-card"]').first()).toContainText("Column draft");
		});
	}
}

for (const colorScheme of ["light", "dark"] as const) {
	test(`column add preserves keyboard focus and Escape in ${colorScheme}`, async ({ page }, testInfo) => {
		await page.emulateMedia({ colorScheme });
		await page.goto("/?mock=board");
		const selected = page.locator('[data-item-id="PVTI_231"]');
		await selected.click();
		const add = page.getByRole("button", { name: "Add draft to Todo", exact: true });
		await page.keyboard.press("Tab");
		await selected.focus();
		await add.focus();
		await expect(add).toBeFocused();
		expect(await add.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
		await page.screenshot({ path: testInfo.outputPath(`column-add-focus-${colorScheme}.png`) });
		await page.keyboard.press("Enter");
		await expect(page.getByLabel("Draft title")).toBeFocused();
		await page.screenshot({ path: testInfo.outputPath(`column-draft-${colorScheme}.png`) });
		await page.keyboard.press("Escape");
		await expect(page.getByLabel("Draft title")).toHaveCount(0);
		await expect(selected).toBeFocused();
	});
}

for (const activation of ["click", "Enter"] as const) {
	test(`empty List: Todo add shows a focused draft via ${activation} and Escape releases shortcuts`, async ({
		page,
	}) => {
		await page.goto("/?mock=empty");
		await expect(page.getByText("This board is empty")).toBeVisible();
		await page.getByRole("button", { name: "List", exact: true }).click();
		const add = page.getByRole("button", { name: "Add draft to Todo", exact: true });
		if (activation === "click") await add.click();
		else {
			await add.focus();
			await page.keyboard.press("Enter");
		}
		const todo = page
			.locator('[data-slot="issue-list-group"]')
			.filter({ has: page.getByText("Todo", { exact: true }) });
		await expect(todo.getByLabel("Draft title")).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(page.getByLabel("Draft title")).toHaveCount(0);
		await page.keyboard.press("c");
		await expect(page.getByLabel("Draft title")).toBeFocused();
		await page.keyboard.press("Escape");
		await add.click();
		await todo.getByLabel("Draft title").fill("Draft from empty List");
		await page.keyboard.press("Enter");
		await expect(todo.locator('[data-slot="issue-list-row"]').first()).toContainText("Draft from empty List");
	});
}
