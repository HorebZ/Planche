import { expect, test } from "@playwright/test";

test("repository favorites paginate, include organizations and external URLs, and survive reopening the app", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await page.getByRole("button", { name: "Add repositories", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add repositories", exact: true });

  await expect(
    dialog.getByRole("button", { name: "Add HorebZ/disabled", exact: true }),
  ).toBeDisabled();
  const search = dialog.getByRole("textbox", { name: "Find a repository", exact: true });
  await search.fill("second-page");
  await expect(dialog.getByText("HorebZ/second-page", { exact: true })).toBeVisible();
  await expect(dialog.getByText("HorebZ/Planche", { exact: true })).toHaveCount(0);
  await search.fill("");
  await expect(
    dialog.getByRole("button", { name: "Add HorebZ/Planche", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Load more repositories", exact: true }).click();
  await expect(dialog.getByText("HorebZ/second-page", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Add HorebZ/Planche", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "HorebZ/Planche already added", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Organizations", exact: true }).click();
  await dialog.getByRole("button", { name: "Add planche/core", exact: true }).click();
  const reference = dialog.getByRole("textbox", {
    name: "Repository name or GitHub URL",
    exact: true,
  });
  await reference.fill("https://github.com/external/public");
  await reference.press("Enter");
  await expect(reference).toHaveValue("");
  await reference.fill("external/public");
  await reference.press("Enter");
  await expect(reference).toHaveValue("");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  const repositories = page.getByRole("region", { name: "Repositories", exact: true });
  await expect(repositories.locator('[data-slot="sidebar-repository"]')).toHaveCount(3);
  await expect(page.locator('[data-slot="board-column"]')).toHaveCount(5);
  await page.reload();

  await expect(
    repositories.getByRole("link", { name: "Open issues in external/public", exact: true }),
  ).toBeVisible();
  await expect(repositories.locator('[data-slot="sidebar-repository"]')).toHaveCount(3);
  await expect(page.locator('[data-slot="board-column"]')).toHaveCount(5);
});

test("repository refresh follows renames, preserves inaccessible entries, and removing one does not hide its Project", async ({
  page,
}) => {
  await page.goto("/?mock=board");
  await page.getByRole("button", { name: "Add repositories", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add repositories", exact: true });
  await dialog.getByRole("button", { name: "Add HorebZ/Planche", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "HorebZ/Planche already added", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => {
    (
      window as unknown as { __planche: { renameRepository: (id: string, name: string) => void } }
    ).__planche.renameRepository("R_planche", "new-owner/new-name");
    window.dispatchEvent(new Event("visibilitychange"));
  });
  const repository = page.getByRole("link", {
    name: "Open issues in new-owner/new-name",
    exact: true,
  });
  await expect(repository).toBeVisible();
  await page.evaluate(() => {
    (
      window as unknown as { __planche: { removeRepositoryAccess: (id: string) => void } }
    ).__planche.removeRepositoryAccess("R_planche");
    window.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("region", { name: "Repositories", exact: true })).toContainText(
    "Unavailable with current access",
  );
  await repository.focus();
  await page.keyboard.press("Meta+Shift+h");

  await expect(page.locator('[data-slot="sidebar-repository"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="sidebar-item"][data-active]')).toHaveCount(1);
  await expect(page.locator('[data-slot="board-column"]')).toHaveCount(5);
  const reads = await page.evaluate(
    () =>
      (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls
        .refresh_repository,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));

  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls
          .refresh_repository,
    ),
  ).toBe(reads);
});

test("repositories are available before choosing a Project, and submitting their URL does not submit the Project form", async ({
  page,
}) => {
  await page.goto("/?mock=projects-empty");
  await expect(page.getByRole("heading", { name: "Pick a project", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add repositories", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add repositories", exact: true });
  const reference = dialog.getByRole("textbox", {
    name: "Repository name or GitHub URL",
    exact: true,
  });
  await reference.fill("external/public");
  await reference.press("Enter");
  await expect(reference).toHaveValue("");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Pick a project", exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open issues in external/public", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="board-column"]')).toHaveCount(0);
});
