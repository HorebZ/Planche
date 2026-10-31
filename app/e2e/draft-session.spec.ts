import { expect, test } from "@playwright/test";

for (const layout of ["Board", "List"] as const) {
  test(`${layout}: blur preserves text and Escape abandons it`, async ({ page }) => {
    await page.goto("/?mock=board");
    await page.getByRole("button", { name: layout, exact: true }).click();

    const add = page.getByRole("button", { name: "Add draft to Todo", exact: true });

    await add.click();
    await page.getByLabel("Draft title").fill("Session title");
    await add.click();

    await expect(page.getByLabel("Draft title")).toBeFocused();

    await page.keyboard.press("Tab");

    await expect(page.getByLabel("Draft title")).toHaveCount(0);

    await add.click();

    await expect(page.getByLabel("Draft title")).toHaveValue("Session title");

    await page.keyboard.press("Escape");
    await add.click();

    await expect(page.getByLabel("Draft title")).toHaveValue("");
  });
}

test("late acceptance preserves a new editor and new text while double Enter sends once", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await page.getByRole("button", { name: "Add draft to Todo", exact: true }).click();
  await page.evaluate(`{
  const original = window.__TAURI_INTERNALS__.invoke;
  window.draftSends = 0;
  window.__TAURI_INTERNALS__.invoke = (cmd, ...args) => {
   if (cmd !== 'dispatch_intent') return original(cmd, ...args);
   window.draftSends++;
   return new Promise(resolve => { window.finishDraft = () => resolve({ type: 'accepted', seq: 1 }); });
  };
 }`);

  const field = page.getByLabel("Draft title");

  await field.fill("Submitted title");
  await field.press("Enter");
  await field.press("Enter");

  await expect.poll(() => page.evaluate("window.draftSends")).toBe(1);

  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Add draft to Todo", exact: true }).click();

  await expect(field).toHaveValue("Submitted title");

  await field.fill("New text");
  await field.press("Enter");

  expect(await page.evaluate("window.draftSends")).toBe(1);

  await page.evaluate("window.finishDraft()");

  await expect(field).toHaveValue("New text");
  await expect(field).toBeFocused();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`List creates inside a collapsed group in ${colorScheme}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/?mock=board");
    await page.getByRole("button", { name: "List", exact: true }).click();

    const todo = page
      .locator('[data-slot="issue-list-group"]')
      .filter({ has: page.getByText("Todo", { exact: true }) });

    await todo.locator("button[aria-expanded]").click();
    await todo.getByRole("button", { name: "Add draft to Todo", exact: true }).click();
    await todo.getByLabel("Draft title").fill("From collapsed List");
    await page.screenshot({ path: testInfo.outputPath("list-draft.png") });
    await page.keyboard.press("Enter");

    await expect(
      todo.locator('[data-slot="issue-list-row"]').filter({ hasText: "From collapsed List" }),
    ).toBeVisible();
    await expect(page.locator('[data-slot="board"]')).toHaveCount(0);
  });
}

test("certain refusal preserves the title and allows an explicit retry", async ({ page }) => {
  await page.goto("/?mock=board");
  await page.getByRole("button", { name: "Add draft to Todo", exact: true }).click();
  await page.evaluate(`{
  const original = window.__TAURI_INTERNALS__.invoke;
  let refuse = true;
  window.__TAURI_INTERNALS__.invoke = (cmd, ...args) => {
   if (cmd === 'dispatch_intent' && refuse) {
    refuse = false;
    return Promise.resolve({ type: 'rejected', error: { kind: 'Cache', message: 'disk full' } });
   }
   return original(cmd, ...args);
  };
 }`);

  const field = page.getByLabel("Draft title");

  await field.fill("Keep after refusal");
  await field.press("Enter");

  await expect(field).toHaveValue("Keep after refusal");
  await expect(field.locator("xpath=ancestor::form").getByRole("status")).toHaveText("disk full");

  await field.press("Enter");

  await expect(field).toHaveCount(0);
  await expect(
    page.locator('[data-slot="issue-card"]').filter({ hasText: "Keep after refusal" }),
  ).toBeVisible();
});
