import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "check-design-"));

function check(source: string) {
  const file = join(dir, `${crypto.randomUUID()}.tsx`);

  writeFileSync(file, source);

  const result = spawnSync("bun", [join(import.meta.dirname, "check-design.ts"), file], {
    encoding: "utf8",
  });

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

test("a raw color inside a Tailwind arbitrary value fails", () => {
  expect(check('<span className="shadow-[0_1px_2px_rgba(0,0,0,0.25)]" />\n').code).toBe(1);
  expect(check('<span className="shadow-[0_0_0_1px_#fff]" />\n').code).toBe(1);
});

test("a Tailwind palette class fails", () => {
  expect(check('<div className="bg-gray-100" />\n').code).toBe(1);
});

test("a file using only tokens passes", () => {
  const { code, stderr } = check(
    '<div className="bg-surface text-fg-2 shadow-card hover:bg-hover" />\n',
  );

  expect(stderr).toBe("");
  expect(code).toBe(0);
});

test("the source scan skips colocated test assertions about colors and issue numbers", () => {
  const sourceDir = join(dir, "src");

  mkdirSync(sourceDir);
  writeFileSync(join(sourceDir, "Card.tsx"), '<div className="bg-surface" />');
  writeFileSync(join(sourceDir, "Card.visual.e2e.ts"), 'expect(color).toBe("rgb(18, 18, 19)");');
  writeFileSync(join(sourceDir, "Card.test.tsx"), 'expect(reference).toBe("#226");');
  mkdirSync(join(sourceDir, "_fixtures"));
  writeFileSync(join(sourceDir, "_fixtures", "card.ts"), 'const label = { color: "#226" };');

  const result = spawnSync("bun", [join(import.meta.dirname, "check-design.ts")], {
    cwd: dir,
    encoding: "utf8",
  });

  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});
