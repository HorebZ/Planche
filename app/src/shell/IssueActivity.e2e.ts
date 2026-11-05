import { expect, test } from "@playwright/test";

test("activity is loaded only in the issue detail and survives opening it in a tab", async ({
  page,
}) => {
  await page.goto("/?mock=relations");

  await expect(page.getByRole("region", { name: "Activity", exact: true })).toHaveCount(0);
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();

  const detail = page.getByRole("article", { name: "Issue detail" });
  const activity = detail.getByRole("region", { name: "Activity", exact: true });
  const resources = detail.getByRole("region", { name: "Resources", exact: true });

  await expect(activity.getByText("Ready for", { exact: false })).toBeVisible();
  await expect(activity.locator("strong")).toHaveText("review");
  await expect(resources).toContainText("Blocked by 2 issues");
  await expect(resources).toContainText("Blocking 1 issue");
  await expect(detail.locator("h2")).toHaveText(["Description", "Resources", "Activity"]);
  await expect(resources.getByRole("link", { name: /HorebZ\/Planche#72/ })).toHaveAttribute(
    "href",
    "https://github.com/HorebZ/Planche/pull/72",
  );
  await expect(resources.getByRole("img", { name: "Merged", exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Open in tab" }).click();

  await expect(page.getByRole("tab", { name: /226/ })).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("region", { name: "Activity", exact: true }).filter({ visible: true }),
  ).toContainText("Ready for review");
});

test("offline issue activity shows the saved copy with a date", async ({ page }) => {
  await page.goto("/?mock=offline");
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();

  const activity = page.getByRole("region", { name: "Activity", exact: true });

  await expect(activity).toContainText("Saved activity · Offline");
  await expect(activity.locator("time").first()).toHaveAttribute(
    "datetime",
    "2026-11-03T12:00:00Z",
  );
  await expect(activity).toContainText("Ready for review");
});
