import { expect, test } from "@playwright/test";

test.skip(!process.env.PERF, "set PERF=1 to measure issue navigation");

test("opening and closing a detail stays below 50 ms p95 on 1000 cards", async ({ page }) => {
  await page.goto("/?mock=big");
  await page.locator('[data-slot="issue-card"]').first().focus();

  const times = await page.evaluate(async () => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const times: { open: number[]; close: number[] } = { open: [], close: [] };

    for (let run = 0; run < 35; run++) {
      for (const [phase, key] of [
        ["open", "Enter"],
        ["close", "Escape"],
      ] as const) {
        const start = performance.now();

        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
        );
        await frame();

        if (Boolean(document.querySelector('[data-slot="issue-detail"]')) !== (phase === "open")) {
          throw new Error(`Detail did not ${phase}`);
        }

        if (run >= 5) {
          times[phase].push(performance.now() - start);
        }
      }
    }

    return times;
  });

  for (const [phase, measurements] of Object.entries(times)) {
    const sorted = measurements.sort((left, right) => left - right);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];

    console.log(
      `${phase}: 1000 cards, 30 runs after 5 warmups, p95=${p95.toFixed(1)}ms, budget=50ms`,
    );
    expect(p95).toBeLessThan(50);
  }
});
