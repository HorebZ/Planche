import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 780, height: 540 } });

for (const colorScheme of ["light", "dark"] as const) {
  test(`compact GitHub connection and waiting state in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/?mock=oauth-waiting");

    const signIn = page.getByRole("button", { name: "Sign in with GitHub", exact: true });

    await expect(signIn).toBeInViewport();
    expect((await signIn.boundingBox())?.width).toBeLessThan(220);
    expect((await signIn.boundingBox())?.height).toBeLessThanOrEqual(28);
    await expect(
      page.getByRole("button", { name: "Use a personal access token" }),
    ).toBeInViewport();
    expect(
      await page.locator("form").evaluate((form) => form.scrollHeight <= form.clientHeight),
    ).toBe(true);
    await page.screenshot({
      path: `screenshots/onboarding-default-${colorScheme}.png`,
      animations: "disabled",
    });
    await signIn.click();

    await expect(page.getByLabel("GitHub verification code")).toHaveText("ABCD-EFGH");
    await expect(page.getByText("Code copied", { exact: true })).toBeVisible();
    await expect(page.getByText("Waiting for GitHub…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open GitHub", exact: true })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Cancel sign-in" })).toBeInViewport();
    expect(
      await page.locator("form").evaluate((form) => form.scrollHeight <= form.clientHeight),
    ).toBe(true);

    await page.getByRole("button", { name: "Copy code", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __planche: { calls: Record<string, number> } }).__planche.calls
              .auth_oauth_copy_code,
        ),
      )
      .toBe(2);
    await page.getByRole("heading", { name: "Connect to GitHub" }).click();
    await page.screenshot({
      path: `screenshots/onboarding-waiting-${colorScheme}.png`,
      animations: "disabled",
    });
  });
}
