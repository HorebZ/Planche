import { expect, test } from "@playwright/test";

test.skip(!process.env.PERF, "set PERF=1 to measure scrolling on 1000 cards");
test.use({ viewport: { width: 1440, height: 900 } });

// One column at a time, as a pointer scrolls. PERF_COLUMNS=5 scrolls every column at once.
test("scrolling 1000 cards for 5 s keeps frames under 20 ms", async ({ page }) => {
	await page.goto(`/?mock=big&cols=${process.env.PERF_COLUMNS ?? 1}`);
	await expect(page.locator('[data-slot="column-scroll"]')).toHaveCount(5);
	const frames = await page.evaluate(
		() =>
			new Promise<number[]>((resolve) => {
				const columns = [...document.querySelectorAll<HTMLElement>('[data-slot="column-scroll"]')].slice(
					0,
					Number(new URLSearchParams(location.search).get("cols") ?? 1),
				);
				const deltas: number[] = [];
				const start = performance.now();
				let last = start;
				let step = 0;
				const tick = (now: number) => {
					deltas.push(now - last);
					last = now;
					step++;
					// Each column scrolls 60 px per frame, down then back up, like a fast trackpad.
					for (const column of columns) {
						const max = column.scrollHeight - column.clientHeight;
						column.scrollTop = Math.abs(((step * 60) % (2 * max)) - max);
					}
					if (now - start < 5000) requestAnimationFrame(tick);
					else resolve(deltas.slice(1));
				};
				requestAnimationFrame(tick);
			}),
	);
	const slow = frames.filter((ms) => ms > 20).length;
	const share = slow / frames.length;
	const sorted = [...frames].sort((a, b) => a - b);
	console.log(
		`frames=${frames.length} over20ms=${slow} share=${(share * 100).toFixed(1)}% median=${sorted[Math.floor(sorted.length / 2)].toFixed(1)}ms p95=${sorted[Math.floor(sorted.length * 0.95)].toFixed(1)}ms max=${sorted.at(-1)?.toFixed(1)}ms`,
	);
	expect(share).toBeLessThanOrEqual(0.05);
});
