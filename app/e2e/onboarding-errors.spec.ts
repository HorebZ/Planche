import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 780, height: 540 } });

async function restoreProjects(page: Page) {
  await page.evaluate(() =>
    (
      window as unknown as { __planche: { restoreProjects: () => void } }
    ).__planche.restoreProjects(),
  );
}

async function expectProjects(page: Page) {
  await expect(page.getByRole("button", { name: /^Planche — v1.2/ })).toBeVisible();
  await expect(page.locator('[data-slot="project-access-state"]')).toHaveCount(0);

  await page.getByRole("button", { name: /^Planche — v1.2/ }).click();

  await expect(page.getByRole("button", { name: /Open board/ })).toBeEnabled();
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const [scenario, state, title] of [
    ["projects-empty", "empty", "No open projects found"],
    ["projects-error", "error", "Could not load projects"],
    ["projects-sso", "sso", "Organization access needs SSO"],
  ] as const) {
    test(`${scenario} offers recovery in ${colorScheme}`, async ({ page }, info) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`/?mock=${scenario}`);

      const notice = page.locator(`[data-slot="project-access-state"][data-state="${state}"]`);

      await expect(notice.getByRole("heading", { name: title })).toBeVisible();
      await expect(page.getByRole("button", { name: /Open board/ })).toBeDisabled();
      await expect(page.locator('[data-state="empty"]')).toHaveCount(state === "empty" ? 1 : 0);

      if (state === "sso") {
        await expect(notice).toContainText("acme-sso");
        await expect(notice.getByRole("button", { name: "Configure SSO" })).toBeEnabled();
      }

      if (state === "error") {
        await expect(notice).toHaveAttribute("role", "alert");
        await expect(notice).toContainText("Projects are inaccessible (403)");
      }

      await page.screenshot({ path: info.outputPath(`${scenario}.png`) });
      await restoreProjects(page);
      await notice.getByRole("button", { name: "Retry now" }).focus();
      await page.keyboard.press("Enter");
      await expectProjects(page);
    });
  }

  test(`invalid token is linked to its field and validation is announced in ${colorScheme}`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/?mock=invalid");

    const token = page.getByLabel("Personal access token");

    await token.fill("ghp_wrong");
    await page.getByRole("button", { name: /Continue/ }).click();

    await expect(token).toHaveAttribute("aria-invalid", "true");
    await expect(token).toHaveAttribute("aria-describedby", "token-error");
    await expect(token).toHaveAccessibleDescription("token rejected by GitHub (401)");
    await expect(token).toBeFocused();
    await expect(page.getByRole("alert")).toHaveText("token rejected by GitHub (401)");

    await page.screenshot({ path: info.outputPath("token-error.png") });
    await token.fill("ghp_valid");

    await expect(token).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toHaveCount(0);

    await page.keyboard.press("Enter");

    await expect(page.getByRole("status")).toContainText("Checking…");
    await expect(page.getByRole("status")).toContainText("Valid");
    await expect(page.getByRole("button", { name: /Continue/ })).toBeFocused();
  });
}

test("a project-list failure does not invalidate or revalidate a stored token", async ({
  page,
}) => {
  await page.goto("/?mock=valid-projects-error");

  const token = page.getByLabel("Personal access token");

  await token.fill("ghp_valid");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("status")).toContainText("Valid");
  await expect(token).not.toHaveAttribute("aria-invalid", "true");

  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.getByRole("heading", { name: "Could not load projects" })).toBeVisible();

  await restoreProjects(page);
  await page.getByRole("button", { name: "Retry now" }).click();
  await expectProjects(page);

  const attempts = await page.evaluate(
    () =>
      (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls
        .auth_set_token,
  );

  expect(attempts).toBe(1);
});

test("Back returns to an empty token field and a new validation loads fresh projects", async ({
  page,
}) => {
  await page.goto("/?mock=projects-error");

  await expect(page.getByRole("heading", { name: "Could not load projects" })).toBeVisible();

  await page.getByRole("button", { name: "Back", exact: true }).click();

  const token = page.getByLabel("Personal access token");

  await expect(token).toBeFocused();
  await expect(token).toHaveValue("");

  await restoreProjects(page);
  await token.fill("ghp_valid");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("status")).toContainText("Valid");

  await page.getByRole("button", { name: /Continue/ }).click();
  await expectProjects(page);
});

test("SSO guidance keeps projects from other owners available", async ({ page }) => {
  await page.goto("/?mock=projects-partial-sso");

  await expect(page.getByRole("heading", { name: "Organization access needs SSO" })).toBeVisible();

  await page.getByRole("button", { name: /^Planche — v1.2/ }).click();

  await expect(page.getByRole("button", { name: /Open board/ })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "No open projects found" })).toHaveCount(0);
});
