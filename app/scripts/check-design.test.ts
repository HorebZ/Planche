import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "check-design-"));

function check(source: string) {
	const file = join(dir, `${crypto.randomUUID()}.tsx`);
	writeFileSync(file, source);
	const result = spawnSync("bun", [join(import.meta.dirname, "check-design.ts"), file], { encoding: "utf8" });
	return { code: result.status, stderr: result.stderr, file };
}

test("a dark: utility fails and names the line", () => {
	const { code, stderr, file } = check('const a = 1;\nconst b = "bg-surface dark:bg-black";\n');
	expect(code).toBe(1);
	expect(stderr).toContain(`${file}:2: dark: utility`);
});

test("a raw hex color fails and names the line", () => {
	const { code, stderr, file } = check('const color = "#FF0000";\n');
	expect(code).toBe(1);
	expect(stderr).toContain(`${file}:1: raw hex color`);
});

test("a Tailwind palette class fails", () => {
	expect(check('<div className="bg-gray-100" />\n').code).toBe(1);
});

test("a file using only tokens passes", () => {
	const { code, stderr } = check('<div className="bg-surface text-fg-2 shadow-card hover:bg-hover" />\n');
	expect(stderr).toBe("");
	expect(code).toBe(0);
});
