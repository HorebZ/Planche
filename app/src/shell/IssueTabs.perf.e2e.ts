import { expect, test } from "@playwright/test";

test.skip(!process.env.PERF, "set PERF=1 to measure retained issue tabs");

test("switching five retained issues stays below 50 ms p95 with a 1000-card source", async ({
  page,
}) => {
  await page.goto("/?mock=big");

  for (let id = 0; id < 5; id++) {
    await page.locator(`[data-slot="issue-card"][data-item-id="PVTI_${id}"]`).click();
    await page.keyboard.press("Meta+Enter");
    await page.keyboard.press("Escape");
  }

  const times = await page.evaluate(async () => {
    const times: number[] = [];

    for (let run = 0; run < 35; run++) {
      const previous = document.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
      const start = performance.now();

      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      if (document.querySelector('[role="tab"][aria-selected="true"]')?.textContent === previous) {
        throw new Error("The active tab did not change");
      }

      if (run >= 5) {
        times.push(performance.now() - start);
      }
    }

    return times;
  });

  times.sort((left, right) => left - right);
  const p95 = times[Math.ceil(times.length * 0.95) - 1];

  console.log(
    `Tab switch: 5 retained issues, 1000-card source, 30 runs after 5 warmups, p95=${p95.toFixed(1)}ms, budget=50ms`,
  );
  expect(p95).toBeLessThan(50);
});
