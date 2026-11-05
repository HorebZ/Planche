import { expect, test } from "@playwright/test";

test("opening a reference from a description preview keeps the unsaved draft", async ({ page }) => {
  await page.goto("/?mock=markdown");
  await page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]').click();
  await page.getByRole("button", { name: "Edit description", exact: true }).click();
  const draft = "Unsaved **description** with #223.";
  const editor = page.getByRole("textbox", { name: "Description Markdown", exact: true });
  await editor.fill(draft);
  await page
    .getByRole("region", { name: "Edit description", exact: true })
    .getByRole("button", { name: "Preview", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Description preview", exact: true })
    .getByRole("link", { name: "#223", exact: true })
    .click();

  const active = page.locator('[data-slot="issue-detail"][data-active="true"]');
  await expect(active.locator("h1")).toHaveText("Column counter ignores filtered cards");
  await active.getByRole("button", { name: "Close detail", exact: true }).click();

  await expect(
    page.getByRole("region", { name: "Description preview", exact: true }),
  ).toContainText("Unsaved description with #223.");
  await page.getByRole("button", { name: "Write", exact: true }).click();

  await expect(editor).toHaveValue(draft);
});

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

  await expect(description.getByRole("link", { name: "#61635", exact: true })).toHaveAttribute(
    "href",
    "https://github.com/planche/app/issues/61635",
  );
  await expect(
    description.getByRole("link", { name: "other/repo#42", exact: true }),
  ).toHaveAttribute("href", "https://github.com/other/repo/issues/42");

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

  const reference = description.getByRole("link", { name: "#223", exact: true });
  await reference.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator('[data-slot="issue-detail"][data-active="true"] h1')).toHaveText(
    "Column counter ignores filtered cards",
  );
  await expect(page.locator('[data-slot="issue-detail"][data-active="true"]')).toHaveAttribute(
    "data-expanded",
    "false",
  );
  await page.keyboard.press("Escape");

  await expect(page.locator('[data-slot="issue-detail"][data-active="true"] h1')).toHaveText(
    "Show linked PRs in issue detail",
  );
  await page.keyboard.press("Escape");

  await expect(page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]')).toBeFocused();
});
