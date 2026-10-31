import { expect, test } from "@playwright/test";

test("description revalidates on reopening and removes saved content after access is refused", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  const card = page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]');

  await card.click();

  const description = page.getByRole("region", { name: "Description", exact: true });

  await expect(description).toContainText("Description for I_226");
  const requests = () =>
    page.evaluate(
      () =>
        (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls
          .refresh_issue_description,
    );
  const firstRequests = await requests();

  await page.keyboard.press("Escape");
  await card.click();

  // StrictMode can replay a mount; each reopening must still fetch again.
  await expect.poll(requests).toBeGreaterThan(firstRequests);
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    (
      window as unknown as { __planche: { denyDescriptions: () => void } }
    ).__planche.denyDescriptions(),
  );
  await card.click();

  await expect(description).toContainText("Your access may have changed");
  await expect(description).not.toContainText("Description for I_226");
});

test("a description error retries without leaving the current issue", async ({ page }) => {
  await page.goto("/?mock=description-error");
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();

  await expect(page.getByRole("alert")).toContainText("Could not load the description");
  await page.evaluate(() =>
    (
      window as unknown as { __planche: { restoreDescriptions: () => void } }
    ).__planche.restoreDescriptions(),
  );
  await page.getByRole("button", { name: "Retry description" }).click();

  await expect(page.getByRole("region", { name: "Description", exact: true })).toContainText(
    "Description for I_226",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Show linked PRs in issue detail",
  );
});

test("offline descriptions show their saved state and render text only", async ({ page }) => {
  await page.goto("/?mock=offline");
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();

  const description = page.getByRole("region", { name: "Description", exact: true });

  await expect(description).toContainText("Saved description · Offline");
  await expect(description).toContainText("## Description");
  await expect(description.locator("img, script, a")).toHaveCount(0);
});
