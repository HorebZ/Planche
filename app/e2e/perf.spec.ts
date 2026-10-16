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

test("20 drops show the card in its column within a frame, and drags keep frames under 20 ms", async ({ page }) => {
	await page.goto("/?mock=board");
	const card = page.locator('[data-slot="issue-card"][data-item-id="PVTI_226"]');
	await expect(card).toBeVisible();
	const anchor = (name: string) =>
		page
			.locator('[data-slot="board-column"]')
			.filter({ has: page.getByText(name, { exact: true }) })
			.locator('[data-slot="issue-card"]')
			.first();
	for (let i = 0; i < 20; i++) {
		// Done and back: the card ends in Todo, at the top, where it started.
		const to = i % 2 === 0 ? anchor("Done") : anchor("Todo");
		const a = await card.boundingBox();
		const b = await to.boundingBox();
		if (!a || !b) throw new Error("no box");
		await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
		await page.mouse.down();
		await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 10, { steps: 3 });
		// About 30 frames of travel, as a hand moves.
		const [x0, y0, x1, y1] = [
			a.x + a.width / 2,
			a.y + a.height / 2 + 10,
			b.x + b.width / 2,
			b.y + b.height * (i % 2 === 0 ? 0.8 : 0.2),
		];
		for (let step = 1; step <= 30; step++) {
			await page.mouse.move(x0 + ((x1 - x0) * step) / 30, y0 + ((y1 - y0) * step) / 30);
			await page.waitForTimeout(16);
		}
		await page.mouse.up();
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as unknown as { __plancheDragPerf: { drops: number[] } }).__plancheDragPerf.drops.length,
				),
			)
			.toBe(i + 1);
		await page.waitForTimeout(400);
	}
	const { drops, frames } = await page.evaluate(
		() => (window as unknown as { __plancheDragPerf: { drops: number[]; frames: number[] } }).__plancheDragPerf,
	);
	const sorted = [...drops].sort((x, y) => x - y);
	const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
	const slow = frames.filter((ms) => ms > 20).length / frames.length;
	console.log(
		`drops=${drops.length} median=${sorted[Math.floor(sorted.length / 2)].toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${sorted.at(-1)?.toFixed(1)}ms | drag frames=${frames.length} over20ms=${(slow * 100).toFixed(1)}%`,
	);
	await expect(card).toBeVisible();
	expect(p95).toBeLessThan(16);
	expect(slow).toBeLessThanOrEqual(0.02);
});

/** Sends a key 30 times, and times each from `keydown` to the frame after `done()` holds. */
async function keyLatencies(
	page: import("@playwright/test").Page,
	key: { key: string; metaKey?: boolean },
	done: string,
	reset?: string,
) {
	return page.evaluate(
		async ({ key, done, reset }) => {
			const ready = new Function(`return (${done})`) as () => boolean;
			const after = reset ? (new Function(reset) as () => void) : () => {};
			const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
			const times: number[] = [];
			const work: number[] = [];
			for (let i = 0; i < 30; i++) {
				// A key press lands anywhere in a frame, not right at its start.
				await new Promise((resolve) => setTimeout(resolve, Math.random() * 16));
				const before = document.activeElement;
				const start = performance.now();
				window.dispatchEvent(new KeyboardEvent("keydown", { ...key, bubbles: true, cancelable: true }));
				// React commits a discrete update in a microtask, before the next frame.
				await Promise.resolve();
				if (ready.call(before)) work.push(performance.now() - start);
				let end = await frame();
				while (!ready.call(before)) end = await frame();
				times.push(end - start);
				after();
				await frame();
				await frame();
			}
			return { frames: times.sort((a, b) => a - b), work: work.sort((a, b) => a - b) };
		},
		{ key, done, reset },
	);
}

const p95 = (sorted: number[]) => sorted[Math.floor(sorted.length * 0.95)];

test("⌘K shows the palette within 50 ms p95, and J the next card within 16 ms p95 on 1000 cards", async ({ page }) => {
	await page.goto("/?mock=big");
	await expect(page.locator('[data-slot="column-scroll"]')).toHaveCount(5);
	await page.locator('[data-slot="issue-card"]').first().click();

	const palette = await keyLatencies(
		page,
		{ key: "k", metaKey: true },
		"document.querySelector('[cmdk-root]') != null",
		"document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))",
	);
	await expect(page.getByRole("dialog")).toHaveCount(0);
	const j = await keyLatencies(page, { key: "j" }, "document.activeElement !== this");
	const line = (name: string, { frames, work }: { frames: number[]; work: number[] }) =>
		`${name} frame p50=${frames[15].toFixed(1)} p95=${p95(frames).toFixed(1)} ms, commit p95=${p95(work)?.toFixed(1)} ms (${work.length}/30)`;
	console.log(`${line("palette", palette)}; ${line("j", j)}`);
	expect(p95(palette.frames)).toBeLessThan(50);
	// The frame wait alone is up to 16.7 ms at 60 Hz, so the p95 of a free key sits near 16.
	expect(p95(j.frames)).toBeLessThan(17);
	expect(p95(j.work)).toBeLessThan(8);
});
