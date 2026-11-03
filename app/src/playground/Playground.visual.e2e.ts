import { expect, type Page, test } from "@playwright/test";

type Theme = "light" | "dark" | "high-contrast-light" | "high-contrast-dark";

for (const theme of ["light", "dark"] as const) {
  test(`stacked notifications stay readable without hovering in ${theme}`, async ({ page }) => {
    const panel = scope(page, "overlays", theme);

    await panel.getByRole("button", { name: "Show toast", exact: true }).click();
    await panel.getByRole("button", { name: "Show toast", exact: true }).click();
    await page.mouse.move(0, 0);

    const notifications = panel.locator("[data-sonner-toast]");

    await expect(notifications).toHaveCount(2);
    await expect
      .poll(() =>
        notifications.evaluateAll((nodes) => {
          if (nodes.length !== 2) {
            return false;
          }

          const [a, b] = nodes.map((node) => node.getBoundingClientRect());

          return a.bottom <= b.top || b.bottom <= a.top;
        }),
      )
      .toBe(true);
  });
}

const scope = (page: Page, section: string, theme: Theme) =>
  page.locator(`#${section} [data-theme-scope="${theme}"]`);

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];

  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/playground");

  await expect(page.getByRole("heading", { name: "Planche playground" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("each theme scope resolves its own token values", async ({ page }) => {
  await expect(scope(page, "buttons", "light")).toHaveCSS("background-color", "rgb(249, 249, 250)");
  await expect(scope(page, "buttons", "dark")).toHaveCSS("background-color", "rgb(18, 18, 19)");
  await expect(scope(page, "buttons", "light")).toHaveCSS("color", "rgb(36, 36, 37)");
  await expect(scope(page, "buttons", "dark")).toHaveCSS("color", "rgb(237, 237, 238)");
});

for (const theme of ["light", "dark", "high-contrast-light", "high-contrast-dark"] as const) {
  test(`${theme} text and controls have sufficient contrast on every base surface`, async ({
    page,
  }) => {
    const highContrast = theme.startsWith("high-contrast");
    const contrasts = await scope(page, "buttons", theme).evaluate((panel) => {
      const probe = document.createElement("span");

      panel.append(probe);

      const luminance = (color: string) => {
        const [r, g, b] = (color.match(/[\d.]+/g) ?? []).map((value) => {
          const channel = Number(value) / 255;

          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });

        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };

      const tokens =
        panel.dataset.contrast === "high"
          ? ["fg", "fg-2", "fg-3", "border", "border-strong", "ring"]
          : ["fg-3"];
      const surfaces = ["bg-sunken", "bg", "column", "surface", "card", "elevated"];

      if (panel.dataset.contrast === "high") {
        surfaces.push("hover", "active");
      }

      const results = tokens.flatMap((token) => {
        probe.style.color = `var(--pl-${token})`;

        const foreground = luminance(getComputedStyle(probe).color);

        return surfaces.map((name) => {
          probe.style.backgroundColor = `var(--pl-${name})`;

          const background = luminance(getComputedStyle(probe).backgroundColor);

          return {
            name: `${token} on ${name}`,
            text: token.startsWith("fg"),
            ratio:
              (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
          };
        });
      });

      probe.remove();

      return results;
    });

    for (const { name, ratio, text } of contrasts) {
      expect(ratio, name).toBeGreaterThanOrEqual(text ? (highContrast ? 7 : 4.5) : 3);
    }
  });
}

for (const theme of ["high-contrast-light", "high-contrast-dark"] as const) {
  test(`${theme} outlines controls and marks selection independently of the background`, async ({
    page,
  }) => {
    const buttons = scope(page, "buttons", theme);
    const focusColor = theme === "high-contrast-light" ? "rgb(3, 73, 180)" : "rgb(145, 203, 255)";
    const borderColor =
      theme === "high-contrast-light" ? "rgb(110, 119, 129)" : "rgb(122, 130, 142)";
    const secondary = buttons.getByRole("button", { name: "Secondary", exact: true }).first();

    await expect(secondary).toHaveCSS("outline-style", "solid");
    await expect(secondary).toHaveCSS("outline-width", "1px");
    await expect(secondary).toHaveCSS("outline-color", borderColor);
    await secondary.focus();

    await expect(secondary).toHaveCSS("outline-width", "2px");
    await expect(secondary).toHaveCSS("outline-color", focusColor);
    await expect(buttons.getByRole("button", { name: "Filter", exact: true }).nth(2)).toHaveCSS(
      "outline-color",
      focusColor,
    );
    await expect(buttons.getByRole("button", { name: "Filter", exact: true }).nth(2)).toHaveCSS(
      "outline-width",
      "2px",
    );

    const sidebarSelection = scope(page, "shell", theme).locator(
      '[data-slot="sidebar-item"][data-active]',
    );
    const commandSelection = scope(page, "overlays", theme)
      .locator('[data-slot="command-item"][data-selected="true"]')
      .first();

    for (const selected of [sidebarSelection, commandSelection]) {
      await expect(selected).toHaveCSS("border-style", "solid");
      await expect(selected).toHaveCSS("border-width", "1px");
      await expect(selected).toHaveCSS("border-color", focusColor);
      await expect(selected).toHaveCSS("box-shadow", "none");
    }

    const column = scope(page, "board", theme).locator('[data-slot="board-column"]').first();

    await expect(column.locator("header")).toHaveCSS("border-bottom-color", borderColor);
    await expect(column.locator("header")).toHaveCSS("border-bottom-width", "1px");
    await expect(column.locator('[data-slot="board-column-count"]')).toHaveCSS(
      "border-top-width",
      "1px",
    );
  });
}

test("shadows switch with the theme scope", async ({ page }) => {
  const secondary = (theme: Theme) =>
    scope(page, "buttons", theme).getByRole("button", { name: "Secondary" }).first();

  await expect(secondary("light")).toHaveCSS("box-shadow", /rgba\(36, 36, 37, 0\.06\)/);
  await expect(secondary("dark")).toHaveCSS("box-shadow", /rgba\(255, 255, 255, 0\.04\)/);
});

test("portalled overlays take the theme of their panel", async ({ page }) => {
  const menu = (theme: Theme) =>
    scope(page, "overlays", theme).locator('[data-slot="dropdown-menu-content"]').first();

  await expect(menu("light")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(menu("dark")).toHaveCSS("background-color", "rgb(36, 36, 37)");

  const tooltip = scope(page, "overlays", "dark").locator('[data-slot="tooltip-content"]').first();

  await expect(tooltip).toHaveCSS("background-color", "rgb(237, 237, 238)");
});

test("a live dialog opened from the dark panel is dark", async ({ page }) => {
  const dark = scope(page, "overlays", "dark");

  await dark.getByRole("button", { name: "Open dialog" }).click();

  const dialog = dark.locator('[data-slot="dialog-content"]').filter({ visible: true });

  await expect(dialog).toHaveCount(1);
  await expect(dialog).toHaveCSS("background-color", "rgb(36, 36, 37)");

  await page.keyboard.press("Escape");

  await expect(dialog).toHaveCount(0);
});

test("dialogs use the slow motion token and respect reduced motion", async ({ page }) => {
  const panel = scope(page, "overlays", "light");

  await panel.getByRole("button", { name: "Open dialog" }).click();

  const dialog = panel.locator('[data-slot="dialog-content"]').filter({ visible: true });

  await expect(dialog).toHaveCSS("animation-name", "pl-in");
  await expect(dialog).toHaveCSS("animation-duration", "0.2s");
  await page.emulateMedia({ reducedMotion: "reduce" });

  await expect(dialog).toHaveCSS("animation-duration", "0s");
});

test("cards resolve the card token per theme", async ({ page }) => {
  const card = (theme: Theme) =>
    scope(page, "board", theme).locator('[data-slot="issue-card"]').first();

  await expect(card("light")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(
    scope(page, "board", "light").locator('[data-slot="board-column"]').first(),
  ).toHaveCSS("background-image", /linear-gradient\(rgb\(245, 245, 246\)/);
  await expect(card("dark")).toHaveCSS("background-color", "rgb(26, 26, 27)");
  await expect(
    scope(page, "board", "dark").locator('[data-slot="board-column"]').first(),
  ).toHaveCSS("background-image", /linear-gradient\(rgb\(16, 16, 17\)/);
});

test("a drop target column counts the hovering card, the origin keeps its own", async ({
  page,
}) => {
  const board = scope(page, "board", "light");
  const targets = board.locator('[data-slot="board-column"][data-drop-target]');

  await expect(targets).toHaveCount(2);

  for (const target of await targets.all()) {
    await expect(target.locator('[data-slot="board-column-count"]')).toHaveText("4");
    await expect(target.locator('[data-slot="board-column-count"]')).toHaveCSS(
      "color",
      "rgb(98, 98, 105)",
    );
  }

  const origin = board.locator(
    '[data-slot="board-column"]:has([data-slot="issue-card"][data-drag-state="ghost"])',
  );

  await expect(origin.locator('[data-slot="board-column-count"]')).toHaveText("6");
});

test("data-preview forces hover and focus styles", async ({ page }) => {
  const ghost = scope(page, "buttons", "light").getByRole("button", { name: "Filter" });

  await expect(ghost.nth(0)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(ghost.nth(1)).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(ghost.nth(2)).not.toHaveCSS("box-shadow", "none");
});
