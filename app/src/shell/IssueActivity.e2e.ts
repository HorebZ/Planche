import { expect, test } from "@playwright/test";

test("activity is loaded only in the issue detail and survives opening it in a tab", async ({
  page,
}) => {
  await page.goto("/?mock=board");

  await expect(page.getByRole("region", { name: "Activity", exact: true })).toHaveCount(0);
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();

  const detail = page.getByRole("article", { name: "Issue detail" });
  const activity = detail.getByRole("region", { name: "Activity", exact: true });

  await expect(activity.getByText("Ready for", { exact: false })).toBeVisible();
  await expect(activity.locator("strong")).toHaveText("review");
  await expect(activity.getByRole("heading", { name: "Closing pull requests" })).toBeVisible();
  await expect(activity.getByRole("link", { name: /HorebZ\/Planche#72/ })).toHaveAttribute(
    "href",
    "https://github.com/HorebZ/Planche/pull/72",
  );
  await expect(activity.getByText("Merged", { exact: true })).toBeVisible();
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
