import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`card titles fill their width within five lines in ${theme}`, async ({ page }) => {
    await page.goto("/playground");

    const board = page.locator(`#board [data-theme-scope="${theme}"]`);

    for (const label of ["long title", "long URL title"]) {
      const preview = board.locator("figure").filter({
        has: page.locator("figcaption").getByText(label, { exact: true }),
      });
      const card = preview.locator('[data-slot="issue-card"]');
      const title = card.locator(":scope > div").nth(1).locator("span[title]");

      await title.scrollIntoViewIfNeeded();
      await expect(title).toBeVisible();

      const layout = await title.evaluate((element) => {
        const card = element.closest('[data-slot="issue-card"]');
        const row = element.parentElement;

        if (!card || !row) {
          throw new Error("Missing card title row");
        }

        return {
          height: element.clientHeight,
          lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
          rightGap: row.getBoundingClientRect().right - element.getBoundingClientRect().right,
          clipped: element.scrollHeight > element.clientHeight,
          overflowing: card.scrollWidth > card.clientWidth,
          fullTitle: element.getAttribute("title") === element.textContent,
        };
      });

      expect(layout.height).toBeLessThanOrEqual(layout.lineHeight * 5 + 1);
      expect(layout.rightGap).toBeCloseTo(0, 0);
      expect(layout.clipped).toBe(label === "long URL title");
      expect(layout.overflowing).toBe(false);
      expect(layout.fullTitle).toBe(true);

      await card.screenshot({ path: test.info().outputPath(`${label}-${theme}.png`) });
    }
  });
}
