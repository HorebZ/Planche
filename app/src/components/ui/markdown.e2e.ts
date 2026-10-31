import { expect, test } from "@playwright/test";

test("Markdown is readable, opens links from the keyboard and never requests remote images", async ({
  page,
}) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("example.com")) {
      remoteRequests.push(request.url());
    }
  });

  await page.goto("/?mock=markdown");
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();

  const description = page.getByRole("region", { name: "Description", exact: true });
  const link = description.getByRole("link", { name: "project", exact: true });

  await expect(description.getByRole("heading", { name: "Release notes", level: 3 })).toBeVisible();
  await expect(description.locator("ul > li")).toHaveCount(2);
  await expect(description.locator("ol > li")).toHaveCount(2);
  await expect(description.locator("pre code")).toContainText("let ready = true;");
  await expect(description).toContainText("Image not loaded: Board screenshot");
  await expect(description.locator("img, script, iframe")).toHaveCount(0);
  expect(remoteRequests).toEqual([]);

  await link.focus();
  await page.keyboard.press("Tab");
  await expect(description.getByRole("link", { name: "contact us", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls[
            "plugin:opener|open_url"
          ],
      ),
    )
    .toBe(1);
  await expect(page).toHaveURL(/mock=markdown/);
  await page.keyboard.press("Escape");

  await expect(page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]')).toBeFocused();
});
