import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark", "high-contrast-light", "high-contrast-dark"] as const) {
  test(`PR colors agree across cards, counts and resources in ${theme}`, async ({ page }) => {
    await page.goto("/playground");
    const scope = page.locator(`#board [data-theme-scope="${theme}"]`);

    for (const [state, token] of [
      ["open", "--pl-success"],
      ["draft", "--pl-fg-3"],
      ["closed", "--pl-danger"],
      ["merged", "--pl-s-review"],
    ] as const) {
      const color = await scope.evaluate((element, token) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${token})`;
        element.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();

        return color;
      }, token);

      const count = scope
        .getByRole("img", { name: `Pull request #42: Fix the issue (${state})`, exact: true })
        .locator("svg");
      const card = scope
        .locator(
          `[data-slot="issue-card"][data-kind="pr"][data-state="${state}"] > div:nth-child(2) svg`,
        )
        .first();
      const resources = scope
        .getByRole("region", { name: "Resources", exact: true })
        .getByRole("img", { name: state[0].toUpperCase() + state.slice(1), exact: true })
        .first();

      await expect(count).toHaveCSS("color", color);
      await expect(card).toHaveCSS("color", color);
      await expect(resources).toHaveCSS("color", color);
    }
  });
}
